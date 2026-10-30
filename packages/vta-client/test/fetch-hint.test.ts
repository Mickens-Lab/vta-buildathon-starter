// What a page is told when fetch fails: both causes, the origin, the URL, the fix.
import assert from "node:assert/strict";
import { test } from "node:test";
import { explainFetchFailure, TrustTaskError } from "../src/index.js";

const direct = { url: "http://localhost:8100", origin: "http://localhost:3050" };

test("a TypeError from a direct call names origin, URL, both causes and the doctor", () => {
  const m = explainFetchFailure(new TypeError("NetworkError when attempting to fetch resource."), { ...direct, origin: "http://localhost:9999" })!;
  assert.match(m, /could not reach the VTA at http:\/\/localhost:8100 from http:\/\/localhost:9999/);
  assert.match(m, /npm run doctor/);
  assert.match(m, /is NOT in the default list \(http:\/\/localhost or http:\/\/127\.0\.0\.1 on ports 3000-3009, 3050/);
  assert.match(m, /\/__vta/);
  assert.match(m, /CORS_ORIGINS_TOML to a list that includes it/);
  assert.match(m, /npm run reset && npm run up/);
});

test("an origin inside the default list says so, pointing at the stack rather than at CORS", () => {
  const m = explainFetchFailure(new TypeError("x"), direct)!;
  assert.match(m, /http:\/\/localhost:3050 is in the default list/);
});

test("the VTC and the mediator name their own override variable", () => {
  assert.match(explainFetchFailure(new TypeError("x"), { ...direct, url: "http://localhost:8200", server: "vtc" })!, /VTC_CORS_ORIGINS_TOML/);
  const med = explainFetchFailure(new TypeError("x"), { url: "ws://localhost:7037", origin: "http://localhost:3050", server: "mediator" })!;
  assert.match(med, /MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3050/);
  assert.doesNotMatch(med, /default list/);
});

test("through the dev proxy CORS is ruled out: a TypeError means the dev server is gone", () => {
  const m = explainFetchFailure(new TypeError("x"), { url: "http://localhost:5174/__vta", origin: "http://localhost:5174", proxied: true })!;
  assert.match(m, /dev server at http:\/\/localhost:5174/);
  assert.match(m, /port does not matter/);
  assert.doesNotMatch(m, /CORS_ORIGINS_TOML/);
});

test("the dev proxy's 502 (by status or by message) says the stack is down, with the real target", () => {
  const ctx = { url: "http://localhost:5174/__vta", origin: "http://localhost:5174", proxied: true, target: "http://localhost:8100" };
  for (const e of [new TrustTaskError(502, "bad gateway"), new Error("GET /.well-known/did.jsonl -> HTTP 502")]) {
    const m = explainFetchFailure(e, ctx)!;
    assert.match(m, /could not reach the VTA at http:\/\/localhost:8100/);
    assert.match(m, /npm run up/);
  }
  assert.equal(explainFetchFailure(new TrustTaskError(502, "x"), { ...ctx, proxied: false }), undefined, "a direct 502 is not ours to explain");
});

test("other errors are left alone", () => {
  assert.equal(explainFetchFailure(new Error("no VTA_CREDENTIAL"), direct), undefined);
  assert.equal(explainFetchFailure(new TrustTaskError(403, {}), direct), undefined);
  assert.equal(explainFetchFailure("string", direct), undefined);
});
