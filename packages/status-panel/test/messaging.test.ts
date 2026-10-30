import assert from "node:assert/strict";
import { test } from "node:test";
import { custodyRows } from "../src/custody.ts";
import { messagingRow, protocolsOf } from "../src/messaging.ts";
import type { DidService } from "../src/parse.ts";

const svc = (kind: DidService["kind"]): DidService => ({ id: `#${kind}`, type: kind, endpoints: ["https://example.test"], kind });
const both = [svc("didcomm"), svc("tsp"), svc("rest")];

test("tunnel: ping reporting didcomm and tsp is ok, and says the round trip is unverified", () => {
  const r = messagingRow({ mode: "tunnel", services: both, protocols: ["tsp", "didcomm", "rest"], haveDidDoc: true });
  assert.equal(r.pill, "ok");
  assert.match(r.value, /transport connected/);
  assert.match(r.value, /round trip unverified/);
});
test("tunnel: a REST-only ping is a loud problem with a fix, even if the DID document advertises messaging", () => {
  const r = messagingRow({ mode: "tunnel", services: both, protocols: ["rest"], haveDidDoc: true });
  assert.equal(r.pill, "bad");
  assert.match(r.value, /MESSAGING DEGRADED: didcomm and tsp/);
  assert.match(r.fix!, /tunnel:probe/);
});
test("tunnel: no ping result falls back to the DID document and never claims a live connection", () => {
  const adv = messagingRow({ mode: "tunnel", services: both, haveDidDoc: true, pingError: "boom" });
  assert.equal(adv.pill, "warn");
  assert.match(adv.value, /live state not checked/);
  assert.match(adv.note!, /boom/);
  assert.equal(messagingRow({ mode: "tunnel", services: [svc("rest")], haveDidDoc: true }).pill, "bad");
  assert.equal(messagingRow({ mode: "tunnel", services: [], haveDidDoc: false }).pill, "bad");
});
test("local and farm: messaging is informational, never a failure", () => {
  assert.equal(messagingRow({ mode: "local", services: [svc("rest")], haveDidDoc: true }).pill, "info");
  assert.match(messagingRow({ mode: "local", services: [], haveDidDoc: true }).value, /off \(REST only\)/);
  assert.equal(messagingRow({ mode: "local", services: [], protocols: ["rest"], haveDidDoc: true }).pill, "info");
  assert.equal(messagingRow({ mode: "farm", services: both, haveDidDoc: true }).pill, "info");
});
test("ping payload shapes", () => {
  assert.deepEqual(protocolsOf({ protocols: ["tsp"] }), ["tsp"]);
  assert.deepEqual(protocolsOf(["didcomm"]), ["didcomm"]);
  assert.equal(protocolsOf("x"), undefined);
});
test("custody card warns about public exposure in tunnel mode only", () => {
  const base = { credentialPresent: true, vtaUrl: "https://x.example.test" };
  assert.equal(custodyRows({ ...base, mode: "tunnel" }).find((r) => r.label === "Exposure")!.pill, "warn");
  assert.equal(custodyRows({ ...base, mode: "local" }).find((r) => r.label === "Exposure"), undefined);
});
