// Unit tests that need no VTA: a fake fetch plays the VTA.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DataIntegrityProofVerifier } from "@openvtc/trust-tasks-proof";
import {
  TASK,
  TrustTaskError,
  VtaClient,
  decodeCredential,
  encodeCredential,
  fetchVtaDid,
  identityFromCredential,
  identityFromSeed,
  newIdentity,
  seedFromMultibase,
  seedToMultibase,
} from "../src/index.js";

const VTA_DID = "did:webvh:Qmfake:localhost%3A8100";
const didLog = JSON.stringify({ state: { id: "did:webvh:old" } }) + "\n" + JSON.stringify({ state: { id: VTA_DID } });

type Seen = { url: string; headers: Record<string, string>; doc?: any };
function fakeVta(handler: (doc: any, seen: Seen) => unknown, seen: Seen[] = []): typeof fetch {
  return (async (input: any, init?: any) => {
    const url = String(input);
    if (url.endsWith("/.well-known/did.jsonl")) return new Response(didLog);
    const doc = JSON.parse(init.body);
    const s = { url, headers: init.headers, doc };
    seen.push(s);
    const out = handler(doc, s);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify({ type: doc.type + "#response", payload: out }));
  }) as typeof fetch;
}

test("identity: did:key and multibase seed round trip", () => {
  const id = newIdentity();
  assert.match(id.did, /^did:key:z6Mk[^#]+$/);
  const again = identityFromSeed(seedFromMultibase(seedToMultibase(id.seed)));
  assert.equal(again.did, id.did);
});

test("credential bundle round trips and yields the same identity", () => {
  const id = newIdentity();
  const bundle = { did: id.did, privateKeyMultibase: seedToMultibase(id.seed), vtaDid: VTA_DID, vtaUrl: "http://x" };
  const decoded = decodeCredential(encodeCredential(bundle));
  assert.deepEqual(decoded, bundle);
  assert.equal(identityFromCredential(decoded).did, id.did);
});

test("fetchVtaDid reads the last did.jsonl entry", async () => {
  assert.equal(await fetchVtaDid("http://vta", fakeVta(() => ({}))), VTA_DID);
});

test("call sends a signed envelope addressed to the VTA, verifiable by anyone", async () => {
  const me = newIdentity();
  const seen: Seen[] = [];
  const c = await VtaClient.connect("http://vta", me, fakeVta(() => ({ ok: true }), seen));
  assert.deepEqual(await c.call(TASK.whoami, { a: 1 }), { ok: true });
  const doc = seen[0].doc;
  assert.equal(seen[0].url, "http://vta/trust-tasks");
  assert.equal(doc.issuer, me.did);
  assert.equal(doc.recipient, VTA_DID);
  assert.equal(doc.type, TASK.whoami);
  assert.equal(await new DataIntegrityProofVerifier().verify(doc), true);
  doc.payload.a = 2; // tamper after signing
  assert.equal(await new DataIntegrityProofVerifier().verify(doc), false);
});

test("authenticate runs challenge then authenticate and sends the bearer afterwards", async () => {
  const seen: Seen[] = [];
  const c = await VtaClient.connect(
    "http://vta",
    newIdentity(),
    fakeVta((doc) => {
      if (doc.type === TASK.challenge) return { challenge: "ch", sessionId: "s1" };
      if (doc.type === TASK.authenticate) return { tokens: { accessToken: "tok" } };
      return { roles: ["application"] };
    }, seen),
  );
  await c.authenticate();
  assert.deepEqual(seen.map((s) => s.doc.type), [TASK.challenge, TASK.authenticate]);
  assert.equal(seen[1].doc.payload.challenge, "ch");
  assert.equal(seen[0].headers.authorization, undefined);
  await c.whoami();
  assert.equal(seen[2].headers.authorization, "Bearer tok");
});

test("error responses raise TrustTaskError; 'already exists' is idempotent", async () => {
  const c = await VtaClient.connect(
    "http://vta",
    newIdentity(),
    fakeVta((doc) => {
      const err = doc.type === TASK.contextsCreate ? "context already exists" : "permissionDenied";
      return new Response(JSON.stringify({ type: "trust-task-error", payload: { message: err } }), { status: 400 });
    }),
  );
  assert.equal(await c.createContext("demo"), false);
  await assert.rejects(c.grantAcl("did:key:z6Mkx", "demo"), TrustTaskError);
});

test("grantHandoff sends an admin entry with the one-time hand-off marker and an expiry", async () => {
  const seen: Seen[] = [];
  const c = await VtaClient.connect("http://vta", newIdentity(), fakeVta(() => ({ entry: {} }), seen));
  await c.grantHandoff("did:key:z6Mksetup", "vtc");
  const e = seen[0].doc.payload.entry;
  assert.equal(seen[0].doc.type, TASK.aclGrant);
  assert.deepEqual([e.role, e.scopes, e.ext], ["admin", ["vtc"], { "org.openvtc.handoff": true }]);
  assert.ok(Date.parse(e.expiresAt) > Date.now());
});
