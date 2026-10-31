import assert from "node:assert/strict";
import { test } from "node:test";
import { applicantChoice, deliveryNote } from "../src/delivery.ts";
import { deriveState } from "../src/state.ts";

test("delivery note is mode-aware and never shows a bare false", () => {
  assert.equal(deliveryNote("local", false).label, "not applicable here");
  assert.match(deliveryNote("local", false).detail, /MODE=tunnel/);
  assert.equal(deliveryNote("tunnel", false).label, "not delivered (expected)");
  assert.equal(deliveryNote("tunnel", undefined).label, "not reported");
  assert.match(deliveryNote("tunnel", false).detail, /names no mediator/);
  assert.equal(deliveryNote("farm", false).pill, "info");
  assert.equal(deliveryNote("tunnel", true).pill, "ok");
});

test("every note says credentialsDelivered is the reciprocal credential, not frame arrival", () => {
  for (const m of ["local", "tunnel", "farm"] as const) for (const a of ["did:key", "did:peer"] as const) for (const d of [false, undefined, true]) {
    assert.match(deliveryNote(m, d, a).detail, /own membership credential sent back/);
  }
});

test("a did:peer applicant in tunnel mode is told to run the listener, not that delivery is impossible", () => {
  const n = deliveryNote("tunnel", false, "did:peer");
  assert.equal(n.label, "pushed over TSP; flag stays false");
  assert.match(n.detail, /npm run tsp:listen/);
  assert.doesNotMatch(n.detail, /--did-peer/);
});

test("tunnel mode applies as the did:peer by default; did:key in local/farm, on override, or with the reason", () => {
  assert.deepEqual(applicantChoice("tunnel", "", "did:example:mediator"), { kind: "did:peer" });
  assert.deepEqual(applicantChoice("tunnel", undefined, "did:example:mediator"), { kind: "did:peer" });
  assert.deepEqual(applicantChoice("tunnel", "did:peer", "did:example:mediator"), { kind: "did:peer" });
  assert.deepEqual(applicantChoice("tunnel", "did:key", "did:example:mediator"), { kind: "did:key" });
  assert.deepEqual(applicantChoice("local", "", "did:example:mediator"), { kind: "did:key" });
  assert.deepEqual(applicantChoice("farm", "did:peer", "did:example:mediator"), { kind: "did:key" });
  assert.match(applicantChoice("tunnel", "", null).why ?? "", /no mediator DID/);
  assert.match(applicantChoice("tunnel", "", "did:example:mediator", () => false).why ?? "", /1000-byte DID limit/);
});

test("a member state carries what the VTC said about delivery", () => {
  const st = (v: unknown) => ({ ok: true as const, value: v as any });
  assert.deepEqual(deriveState({ status: st({ status: "approved", requestId: "r", credentialsDelivered: false }), memberRead: { ok: true, value: {} } }), { kind: "member", requestId: "r", credentialsDelivered: false });
  assert.equal((deriveState({ status: st({ status: "approved" }), memberRead: { ok: true, value: {} } }) as any).credentialsDelivered, undefined);
});
