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

test("'nothing sends the member credential back' is stale now that the dashboard sends it", () => {
  assert.equal(staleHits("Nothing in this kit sends that credential back, so the flag stays false.").length, 1);
  assert.equal(staleHits("`credentialsDelivered` stays false in every case: it reports the member's own credential sent back.").length, 1);
  assert.deepEqual(staleHits("The pushed frames do not set it; the dashboard's Send my membership credential back does."), []);
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

test("the did:peer applicant is no longer blocked: the old wording is stale even when it says 'verified failure'", () => {
  for (const line of [
    "## A did:peer:2 applicant (blocked by the mediator's DID size)",
    "a `did:peer:2` applicant **does not work** with this kit's mediator: that DID is over the 1000-byte limit **[verified failure]**",
    "With this kit's mediator it stops at once: the DID would be over the resolver's 1000-byte limit (**verified failure**)",
    "and the opt-in `did:peer:2` applicant (`VTC_APPLICANT=did:peer`, ...; blocked live)",
    "`vtc:join --did-peer` and `tsp:listen --did-peer` stop with that message",
    "the did:key stays the default in every mode",
    "/** The mediator's DID (did:peer:2, in .vta/tunnel.json). */",
    "[MESSAGING.md](MESSAGING.md#a-didpeer2-applicant-blocked-by-the-mediators-did-size)",
  ]) assert.equal(staleHits(line).length, 1, line);
});

test("current did:peer wording and history of the old mediator DID pass", () => {
  for (const line of [
    "## Tunnel mode delivers the credential to the applicant",
    "The kit's mediator used to mint a `did:peer:2` of about 725 bytes, which made the applicant about 1115 bytes",
    "A lean `did:peer:2` mediator DID was tried and cannot fit",
    "`--did-peer` is gone: tunnel mode applies as the did:peer by default",
    "in `tunnel` the page applies as a `did:peer:2` naming the mediator; `VTC_APPLICANT=did:key` keeps the did:key",
  ]) assert.deepEqual(staleHits(line), [], line);
});
