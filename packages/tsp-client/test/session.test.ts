import assert from "node:assert/strict";
import { test } from "node:test";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { pack, packAccept, unpack } from "@openvtc/vti-tsp-js";
import { nextHop, unpack as unpackRev3 } from "vti-tsp-js-rev3";
import { isPong, openEnvelope, TSP_BINDING_TYPE, TspSession, wrapEnvelope, type PongPayload } from "../src/index.js";

const party = (vid: string) => {
  const signingKey = ed25519.utils.randomSecretKey();
  const decryptionKey = ed25519.utils.toMontgomerySecret(signingKey);
  return { vid, signingKey, decryptionKey, signingPublicKey: ed25519.getPublicKey(signingKey), encryptionPublicKey: x25519.getPublicKey(decryptionKey) };
};

/** A fake mediator socket in front of a fake VTA: the mediator reads the Rev 3 outer layer, the VTA reads the 1.0 inner message. */
function harness(opts: { vtaReplies?: boolean } = {}) {
  const me = party("did:key:me"), med = party("did:peer:mediator"), vta = party("did:webvh:vta");
  const seen: string[] = [];
  const waiters: { claims: (b: Uint8Array) => Promise<boolean>; resolve: (b: Uint8Array) => void }[] = [];
  const offer = async (bytes: Uint8Array) => {
    for (const w of waiters) if (await w.claims(bytes)) { w.resolve(bytes); return; }
  };
  const conn = {
    awaitTspFrame: (_t: number, claims: (b: Uint8Array) => Promise<boolean>) => new Promise<Uint8Array>((resolve) => { waiters.push({ claims, resolve }); }),
    sendBinary: (bytes: Uint8Array) => {
      void (async () => {
        // mediator: Rev 3 outer layer, HPKE-Auth from the client
        const outer = await unpackRev3(bytes, { receiverDecryptionKey: med.decryptionKey, senderEncryptionKey: me.encryptionPublicKey, senderSigningKey: me.signingPublicKey });
        const step = nextHop(outer.hops, outer.payload);
        assert.equal(step.kind, "forward");
        assert.equal(step.next, vta.vid);
        // VTA: TSP 1.0 inner message
        const m = await unpack(step.inner, { receiverDecryptionKey: vta.decryptionKey, senderSigningKey: me.signingPublicKey });
        assert.equal(m.sender, me.vid);
        const keys = { senderSigningKey: vta.signingKey, receiverEncryptionKey: me.encryptionPublicKey };
        if (m.control) {
          seen.push(`control:${m.control.controlType}`);
          if (opts.vtaReplies !== false) await offer((await packAccept(m.threadDigest, vta.vid, me.vid, keys)).bytes);
          return;
        }
        const env = openEnvelope(m.payload);
        seen.push(`app:${String(env.type)}`);
        if (opts.vtaReplies === false) return;
        const reply = { id: "urn:uuid:r", threadId: env.id, type: `${String(env.type)}#response`, payload: { status: "ok", nonce: (env.payload as { nonce: string }).nonce, protocols: ["tsp"] } };
        await offer((await pack(wrapEnvelope(reply), vta.vid, me.vid, keys)).bytes);
      })();
    },
  };
  const session = new TspSession(conn, me, med, vta);
  return { session, seen };
}

test("the binding envelope wraps a document and refuses anything else", () => {
  const doc = { id: "1", payload: {} };
  assert.deepEqual(openEnvelope(wrapEnvelope(doc)), doc);
  assert.throws(() => openEnvelope(new TextEncoder().encode(JSON.stringify(doc))), /not a .* envelope/);
  assert.throws(() => openEnvelope(wrapEnvelope(doc, "https://example.org/other")), /not a .* envelope/);
  assert.throws(() => openEnvelope(new TextEncoder().encode(JSON.stringify({ type: TSP_BINDING_TYPE }))), /no document/);
});

test("isPong demands the echoed nonce and a status", () => {
  const p: PongPayload = { status: "ok", nonce: "n1", protocols: ["tsp"] };
  assert.equal(isPong(p, "n1"), true);
  assert.equal(isPong({ ...p, status: "degraded" }, "n1"), true);
  assert.equal(isPong(p, "other"), false, "a pong for another ping");
  assert.equal(isPong({ nonce: "n1" }, "n1"), false, "no status");
  assert.equal(isPong(null, "n1"), false);
});

test("relationship invite then a routed ping: Rev 3 to the mediator, TSP 1.0 to the VTA, correlated reply", async () => {
  const { session, seen } = harness();
  await session.relate(1000);
  const doc = { id: "urn:uuid:a", type: "https://trusttasks.org/spec/messaging/ping/0.1", payload: { nonce: "n-1" } };
  const reply = await session.request(doc, 1000, (d) => d.threadId === doc.id);
  assert.equal(isPong(reply.payload, "n-1"), true);
  assert.deepEqual(seen, ["control:invite", `app:${doc.type}`]);
});

test("an uncorrelated frame is not taken for the reply", async () => {
  const { session } = harness();
  const doc = { id: "urn:uuid:b", type: "t", payload: { nonce: "n" } };
  const wait = session.request(doc, 200, (d) => d.threadId === "someone else");
  // never resolves: the fake waiter has no timer, so race it against our own
  const lost = await Promise.race([wait.then(() => "answered", () => "rejected"), new Promise((r) => setTimeout(() => r("still waiting"), 300))]);
  assert.equal(lost, "still waiting");
});

test("open() refuses a frame that is not sealed to us by the peer", async () => {
  const me = party("did:key:me"), med = party("did:peer:mediator"), vta = party("did:webvh:vta"), other = party("did:key:other");
  const session = new TspSession({ awaitTspFrame: async () => new Uint8Array(), sendBinary: () => {} }, me, med, vta);
  const good = await pack(wrapEnvelope({ id: "x" }), vta.vid, me.vid, { senderSigningKey: vta.signingKey, receiverEncryptionKey: me.encryptionPublicKey });
  assert.equal((await session.open(good.bytes)).sender, vta.vid);
  const forged = await pack(wrapEnvelope({ id: "x" }), vta.vid, me.vid, { senderSigningKey: other.signingKey, receiverEncryptionKey: me.encryptionPublicKey });
  await assert.rejects(session.open(forged.bytes), /signature|verify|invalid/i, "signed by someone else but claiming the peer's VID");
  const toSomeoneElse = await pack(wrapEnvelope({ id: "x" }), vta.vid, other.vid, { senderSigningKey: vta.signingKey, receiverEncryptionKey: other.encryptionPublicKey });
  await assert.rejects(session.open(toSomeoneElse.bytes));
});
