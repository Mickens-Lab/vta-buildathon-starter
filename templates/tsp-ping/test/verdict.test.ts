import assert from "node:assert/strict";
import { test } from "node:test";
import { noPongText } from "../src/verdict.ts";

const ORIGIN = "http://localhost:3000";
const MED = "did:webvh:QmScid:med.example.test";
// What the did:webvh resolver throws in the browser when the mediator's did.jsonl is blocked (no MEDIATOR_CORS_ALLOW_ORIGIN).
const RESOLVE = new Error("did:webvh resolve failed: invalidDid — Failed to fetch");

test("a blocked did.jsonl fetch names the exact MEDIATOR_CORS_ALLOW_ORIGIN line and the recreate command", () => {
  const t = noPongText(RESOLVE, ORIGIN, MED);
  assert.ok(t.startsWith("No pong: did:webvh resolve failed: invalidDid — Failed to fetch\n\n"));
  assert.match(t, /^MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3000$/m);
  assert.match(t, /https:\/\/med\.example\.test\/\.well-known\/did\.jsonl \(its DID document\)/);
  assert.match(t, /`MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3000 npm run up -- --tunnel`/);
  assert.match(t, /`MEDIATOR_PUBLIC_HOST=med\.example\.test MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3000 docker compose --profile messaging up -d mediator`/);
});

test("the origin in the line is this page's, whatever port it runs on", () => {
  assert.match(noPongText(RESOLVE, "http://localhost:3050", MED), /^MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3050$/m);
});

test("without a did:webvh mediator DID the line is still named, but no recreate command is invented", () => {
  const t = noPongText(RESOLVE, ORIGIN, "");
  assert.match(t, /^MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3000$/m);
  assert.doesNotMatch(t, /MEDIATOR_PUBLIC_HOST/);
  assert.match(t, /its URL \(from its DID document\)/);
});

test("a refused socket gets the same explanation", () => {
  const t = noPongText(new Error("websocket error"), ORIGIN, MED);
  assert.match(t, /^MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:3000$/m);
  assert.match(t, /its tunnel host med\.example\.test/);
});

test("an error with an answer (the VTA refusing a throwaway did:key, a timeout) gets no CORS hint", () => {
  assert.equal(noPongText(new Error("HTTP 403 Forbidden"), ORIGIN, MED), "No pong: HTTP 403 Forbidden");
  assert.equal(noPongText(new Error("timed out awaiting reply frame"), ORIGIN, MED), "No pong: timed out awaiting reply frame");
  assert.equal(noPongText("plain", ORIGIN, MED), "No pong: plain");
});
