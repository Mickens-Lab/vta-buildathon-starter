import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyTally, ISSUE_TYPE, record, verdict } from "../lib/listen.js";

test("frames are tallied by kind", () => {
  let t = emptyTally();
  for (const f of [{ control: "invite" }, { documentType: ISSUE_TYPE }, { documentType: ISSUE_TYPE }, { documentType: "x" }, { unreadable: "bad sig" }]) t = record(t, f);
  assert.deepEqual(t, { invites: 1, accepts: 0, issues: 2, other: ["x"], unreadable: 1 });
});

test("the verdict separates frame arrival from credentialsDelivered", () => {
  const got = record(emptyTally(), { documentType: ISSUE_TYPE });
  const v = verdict(got, { method: "did:peer", related: false });
  assert.match(v, /^RECEIVED 1 .* as the did:peer with no TSP contact first/);
  assert.match(v, /credentialsDelivered: false until the member sends its own credential back/);
  assert.match(verdict(emptyTally(), { method: "did:peer", related: false }), /same DID string/);
  assert.match(verdict(emptyTally(), { method: "did:key", related: true }), /VTC_APPLICANT=did:peer/);
});
