import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryNote } from "../src/delivery.ts";
import { deriveState } from "../src/state.ts";

test("delivery note is mode-aware and never shows a bare false", () => {
  assert.equal(deliveryNote("local", false).label, "not applicable here");
  assert.match(deliveryNote("local", false).detail, /MODE=tunnel/);
  assert.equal(deliveryNote("tunnel", false).label, "not delivered (expected)");
  assert.equal(deliveryNote("tunnel", undefined).label, "not reported");
  assert.match(deliveryNote("tunnel", false).detail, /no mediator or inbox/);
  assert.equal(deliveryNote("farm", false).pill, "info");
  assert.equal(deliveryNote("tunnel", true).pill, "ok");
});

test("a member state carries what the VTC said about delivery", () => {
  const st = (v: unknown) => ({ ok: true as const, value: v as any });
  assert.deepEqual(deriveState({ status: st({ status: "approved", requestId: "r", credentialsDelivered: false }), memberRead: { ok: true, value: {} } }), { kind: "member", requestId: "r", credentialsDelivered: false });
  assert.equal((deriveState({ status: st({ status: "approved" }), memberRead: { ok: true, value: {} } }) as any).credentialsDelivered, undefined);
});
