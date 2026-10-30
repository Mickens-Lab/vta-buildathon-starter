import assert from "node:assert/strict";
import { test } from "node:test";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { pack, unpack } from "@openvtc/vti-tsp-js";
import { resolveVtaTspEndpoint } from "@openvtc/pnm-core";
import { signTrustTask } from "@openvtc/trust-tasks-proof";
import { didPeerFromSeed, parseDidPeer2, tspMediatorOf, TSP_SERVICE_TYPE } from "../src/index.js";

const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const MEDIATOR = "did:example:mediator";

test("didPeerFromSeed is deterministic and the mediator is part of the identifier", () => {
  const a = didPeerFromSeed(seed, MEDIATOR);
  const b = didPeerFromSeed(Uint8Array.from(seed), MEDIATOR);
  assert.equal(a.did, b.did);
  assert.match(a.did, /^did:peer:2\.Ez6LS[^.]+\.Vz6Mk[^.]+\.S[A-Za-z0-9_-]+$/);
  assert.notEqual(didPeerFromSeed(seed, "did:example:other").did, a.did);
  assert.equal(a.authKid, `${a.did}#key-2`);
  assert.equal(a.keyAgreementKid, `${a.did}#key-1`);
});

test("the DID carries the seed's keys and a TSPTransport service naming the mediator DID", () => {
  const p = didPeerFromSeed(seed, MEDIATOR);
  const parsed = parseDidPeer2(p.did);
  assert.deepEqual(parsed.keys.map((k) => [k.purpose, k.codec]), [["E", "x25519-pub"], ["V", "ed25519-pub"]]);
  assert.deepEqual(parsed.keys[1].publicKey, ed25519.getPublicKey(seed));
  assert.deepEqual(parsed.keys[0].publicKey, x25519.getPublicKey(ed25519.utils.toMontgomerySecret(seed)));
  assert.deepEqual(parsed.services, [{ type: TSP_SERVICE_TYPE, serviceEndpoint: MEDIATOR }]);
  assert.equal(tspMediatorOf(p.did), MEDIATOR);
  assert.equal(tspMediatorOf("did:key:z6MkExample"), undefined);
});

test("refuses a URL as the TSPTransport endpoint and a short seed", () => {
  assert.throws(() => didPeerFromSeed(seed, "https://mediator.example"), /mediator's DID/);
  assert.throws(() => didPeerFromSeed(seed.slice(0, 16), MEDIATOR), /32 bytes/);
});

test("round trip: pnm-core resolves the DID to the same TSP keys, and a frame sealed to it opens with ours", async () => {
  const p = didPeerFromSeed(seed, MEDIATOR);
  const ep = await resolveVtaTspEndpoint(p.did);
  assert.equal(ep.vid, p.did);
  assert.deepEqual(ep.signingPublicKey, p.ed25519PublicKey);
  assert.deepEqual(ep.encryptionPublicKey, p.x25519PublicKey);
  // A sender (the VTC's role) seals to the resolved keys; we open with the derived decryption key.
  const sender = ed25519.utils.randomSecretKey();
  const sealed = await pack(new TextEncoder().encode("hello"), "did:example:vtc", p.did, { senderSigningKey: sender, receiverEncryptionKey: ep.encryptionPublicKey });
  const opened = await unpack(sealed.bytes, { receiverDecryptionKey: p.decryptionKey, senderSigningKey: ed25519.getPublicKey(sender) });
  assert.equal(new TextDecoder().decode(opened.payload), "hello");
});

test("the signer signs a Trust Task as the did:peer, naming the authentication key", () => {
  const p = didPeerFromSeed(seed, MEDIATOR);
  const doc = signTrustTask({ id: "urn:uuid:1", type: "https://trusttasks.org/spec/example/0.1", issuer: p.did, recipient: "did:example:vtc", issuedAt: new Date().toISOString(), payload: {} } as never, p.signer);
  const proof = (doc as { proof: { verificationMethod: string } }).proof;
  assert.equal(proof.verificationMethod, p.authKid);
});
