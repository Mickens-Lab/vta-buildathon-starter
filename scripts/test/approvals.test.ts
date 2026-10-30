import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRequest } from "../lib/approvals.js";

const base = { matchCode: "a1b2c3", expiresAt: "2099-01-01T00:00:00Z", effects: [] as string[], document: {}, payload: { taskType: "https://example/task/1.0", subject: "ctx", sideEffects: "mutating", requester: "did:key:z6MkReq", approverSet: "set", minApprovals: 1, excludeRequester: true } };

test("describeRequest shows the code and says plainly when the VTA gave no effects", () => {
  const t = describeRequest(base as any);
  assert.match(t, /MATCH CODE\s+a1b2c3/);
  assert.match(t, /NOT DETERMINED/);
  assert.match(t, /requester excluded/);
});

test("describeRequest lists effects and labels a requester note as untrusted", () => {
  const t = describeRequest({ ...base, effects: ["Renames ctx"], payload: { ...base.payload, note: "please" } } as any);
  assert.match(t, /- Renames ctx/);
  assert.doesNotMatch(t, /NOT DETERMINED/);
  assert.match(t, /untrusted/);
});
