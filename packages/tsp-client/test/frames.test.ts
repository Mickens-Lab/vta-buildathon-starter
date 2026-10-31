import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyTally, frameOf, ISSUE_TYPE, record } from "../src/index.js";

const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

test("frameOf reads the control type, else the document type, and never the credential", () => {
  assert.deepEqual(frameOf({ control: { controlType: "invite" } }), { control: "invite" });
  assert.deepEqual(frameOf({ payload: json({ document: { type: ISSUE_TYPE, payload: { credential: "opaque" } } }) }), { documentType: ISSUE_TYPE });
  assert.deepEqual(frameOf({ payload: json({ document: {} }) }), { documentType: undefined });
  assert.deepEqual(frameOf({ payload: json({ document: { type: 7 } }) }), { documentType: undefined });
  const bad = frameOf({ payload: new TextEncoder().encode("not json") });
  assert.ok("unreadable" in bad && /not JSON/.test(bad.unreadable));
});

test("record counts each kind without mutating the tally", () => {
  const t0 = emptyTally();
  const t = [{ control: "accept" }, { control: "close" }, { documentType: undefined }].reduce(record, t0);
  assert.deepEqual(t, { invites: 0, accepts: 1, issues: 0, other: ["control close", "(no document type)"], unreadable: 0 });
  assert.deepEqual(t0, emptyTally());
});
