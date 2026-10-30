import assert from "node:assert/strict";
import { test } from "node:test";
import { describePong } from "../src/index.js";

test("describePong reads like a human sentence and names the protocols", () => {
  const line = describePong({ clientDid: "did:key:x", nonce: "n", elapsedMs: 42, pong: { status: "ok", protocols: ["tsp", "didcomm"], serverTime: "2026-01-01T00:00:00Z", nonce: "n" } });
  assert.match(line, /pong from the VTA in 42 ms/);
  assert.match(line, /\[tsp, didcomm\]/);
});
