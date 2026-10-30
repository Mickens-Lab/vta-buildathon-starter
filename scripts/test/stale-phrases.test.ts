import assert from "node:assert/strict";
import { test } from "node:test";
import { staleHits } from "../lib/stale-phrases.js";

test("flags the stale TSP and image statements", () => {
  assert.equal(staleHits("the pong does not come back yet").length, 1);
  assert.equal(staleHits("(the mediator pin refuses TSP 1.0 replies)").length, 1);
  assert.equal(staleHits("an organiser usually hands them out").length, 1);
  assert.equal(staleHits("No images are published; you build them locally.").length, 1);
  assert.equal(staleHits("Setup: `docker load`, `npm i`, `npm run up`").length, 1);
});

test("passes current wording and clearly historical lines", () => {
  assert.deepEqual(staleHits("the pong comes back, verified with mediator 0.45.0"), []);
  assert.deepEqual(staleHits("The earlier pin meant the pong does not come back."), []);
  assert.deepEqual(staleHits("Prebuilt images from ghcr.io/mickens-lab by default, local build as the fallback."), []);
});

test("reports the line number", () => {
  assert.match(staleHits("ok\nnobody should build\n")[0], /^line 2:/);
});
