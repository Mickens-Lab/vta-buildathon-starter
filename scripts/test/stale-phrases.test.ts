import assert from "node:assert/strict";
import { test } from "node:test";
import { staleHits } from "../lib/stale-phrases.js";

test("flags the stale TSP and image statements", () => {
  assert.equal(staleHits("the pong does not come back yet").length, 1);
  assert.equal(staleHits("(the mediator pin refuses TSP 1.0 replies)").length, 1);
  assert.equal(staleHits("an organiser usually hands them out", true).length, 1);
  assert.equal(staleHits("No images are published; you build them locally.", true).length, 1);
  assert.equal(staleHits("Setup: `docker load`, `npm i`, `npm run up`").length, 1);
});

test("passes current wording and clearly historical lines", () => {
  assert.deepEqual(staleHits("the pong comes back, verified with mediator 0.45.0"), []);
  assert.deepEqual(staleHits("The earlier pin meant the pong does not come back."), []);
  assert.deepEqual(staleHits("Prebuilt images from ghcr.io/mickens-lab by default, local build as the fallback.", true), []);
});

test("reports the line number", () => {
  assert.match(staleHits("ok\nnobody should build\n", true)[0], /^line 2:/);
});

test("while prebuilt images are unavailable, 'prebuilt by default' wording is stale; the old 'everyone builds locally' rule is not", () => {
  for (const line of [
    "Prebuilt images are the default, local builds the fallback.",
    "By default `npm run up` uses prebuilt images from ghcr.io.",
    "`npm run up` pulls images by default.",
    "Run `images:pull` first, the build second.",
    "the local build is the fallback",
  ]) assert.equal(staleHits(line, false).length, 1, line);
  assert.deepEqual(staleHits("Everyone builds locally; prebuilt images are not yet available.", false), []);
});

test("clearly future or absent statements about prebuilt images are allowed", () => {
  assert.deepEqual(staleHits("Once images.available is true, prebuilt images are the default.", false), []);
  assert.deepEqual(staleHits("Prebuilt by default is the future design; they are not yet available.", false), []);
  assert.deepEqual(staleHits("If the organisation ever allows it, `npm run up` would pull by default.", false), []);
});

test("when prebuilt images are available, the unavailable rule stops and the old fallback rule applies again", () => {
  assert.deepEqual(staleHits("Prebuilt images are the default, local builds the fallback.", true), []);
  assert.equal(staleHits("everyone builds locally", true).length, 1);
});
