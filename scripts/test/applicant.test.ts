import assert from "node:assert/strict";
import { test } from "node:test";
import { tspMediatorOf } from "@buildathon/tsp-client";
import { applicant, applicantKind } from "../lib/applicant.js";

const seed = Uint8Array.from({ length: 32 }, (_, i) => 32 - i);
const MEDIATOR = "did:example:mediator";

test("applicantKind: --did-peer, then VTC_APPLICANT, default did:key; a typo is refused", () => {
  assert.equal(applicantKind([], undefined), "did:key");
  assert.equal(applicantKind(["--did-peer"], "did:key"), "did:peer");
  assert.equal(applicantKind([], "did:peer"), "did:peer");
  assert.equal(applicantKind([], " Peer "), "did:peer");
  assert.equal(applicantKind([], "did:key"), "did:key");
  assert.throws(() => applicantKind([], "did:web"), /did:key or did:peer/);
});

test("did:key stays the default in every mode, with a mode-aware note", () => {
  const local = applicant("did:key", seed, { mode: "local" });
  assert.match(local.identity.did, /^did:key:z6Mk/);
  assert.equal(local.requestIdKey, "VTC_REQUEST_ID");
  assert.match(local.note, /not pushed/);
  assert.match(applicant("did:key", seed, { mode: "tunnel", mediatorDid: MEDIATOR }).note, /spoke TSP to it recently/);
});

test("did:peer names the mediator, keeps its own request id, and needs MODE=tunnel with a mediator", () => {
  const p = applicant("did:peer", seed, { mode: "tunnel", mediatorDid: MEDIATOR });
  assert.match(p.identity.did, /^did:peer:2\./);
  assert.equal(tspMediatorOf(p.identity.did), MEDIATOR);
  assert.equal(p.requestIdKey, "VTC_PEER_REQUEST_ID");
  assert.equal(p.identity.signer.did, p.identity.did);
  assert.throws(() => applicant("did:peer", seed, { mode: "local", mediatorDid: MEDIATOR }), /needs MODE=tunnel/);
  assert.throws(() => applicant("did:peer", seed, { mode: "tunnel" }), /no mediator DID/);
  assert.throws(() => applicant("did:peer", seed, { mode: "tunnel", mediatorDid: "did:peer:2." + "x".repeat(700) }), /1000-byte limit/);
});
