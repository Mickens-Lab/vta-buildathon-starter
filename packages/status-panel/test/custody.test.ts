import assert from "node:assert/strict";
import { test } from "node:test";
import { custodyOf, custodyRows } from "../src/custody.ts";

const base = { mode: "local" as const, credentialPresent: true, vtaUrl: "http://localhost:8100" };

test("embedded key is level 0, a warning, and points at the backend recipe", () => {
  const rows = custodyRows({ ...base, keyEmbedded: true });
  assert.equal(rows[0].pill, "warn");
  assert.match(rows[0].value, /embedded in the bundle/);
  assert.match(rows.find((r) => r.label === "Hardening level")!.value, /^L0/);
  assert.match(rows.find((r) => r.label === "Next step")!.value, /backend/);
});
test("embedded wins over a declared custody; declared backend and webcrypto are levels 1 and 2", () => {
  assert.equal(custodyOf({ ...base, keyEmbedded: true, custody: "backend" }), "page");
  assert.match(custodyRows({ ...base, custody: "backend" }).find((r) => r.label === "Hardening level")!.value, /^L1/);
  assert.match(custodyRows({ ...base, custody: "webcrypto" }).find((r) => r.label === "Hardening level")!.value, /^L2/);
});
test("no credential and unreported custody are not presented as safe or unsafe", () => {
  assert.equal(custodyOf({ ...base, credentialPresent: false }), "none");
  assert.equal(custodyOf(base), "unknown");
  assert.equal(custodyRows(base)[0].pill, "unknown");
});
test("transport and seed rows only claim what is known", () => {
  const farm = custodyRows({ ...base, mode: "farm", vtaUrl: "http://example.test", keyEmbedded: true });
  assert.equal(farm.find((r) => r.label === "Transport")!.pill, "warn");
  assert.equal(farm.find((r) => r.label === "VTA seed storage"), undefined);
  const https = custodyRows({ ...base, mode: "farm", vtaUrl: "https://example.test" });
  assert.equal(https.find((r) => r.label === "Transport")!.value, "https");
  assert.equal(custodyRows({ ...base, vtaUrl: "/__vta" }).find((r) => r.label === "Transport"), undefined);
  assert.ok(!JSON.stringify(custodyRows({ ...base, keyEmbedded: true })).includes("did:key"));
});
