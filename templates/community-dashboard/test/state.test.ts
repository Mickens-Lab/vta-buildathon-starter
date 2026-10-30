import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveState, isInferred, journeyStep, needsMemberRead, type Probe, type StatusValue } from "../src/state.ts";

const st = (status: string, requestId = "req-1"): Probe<StatusValue> => ({ ok: true, value: { status, requestId } });
const notFound: Probe<StatusValue> = { ok: false, status: 404, code: "urn:example:error:notFound" };
const refused: Probe = { ok: false, status: 403, code: "urn:example:error:permissionDenied", message: "the signer holds no entry in this community" };
const yes: Probe = { ok: true, value: {} };

test("no request and nothing remembered is a visitor", () => {
  assert.equal(deriveState({ status: notFound }).kind, "visitor");
});
test("no request but this browser applied before is inferred as left", () => {
  const s = deriveState({ status: notFound, hadRequest: true });
  assert.deepEqual(s, { kind: "left", inferredFrom: "request-gone" });
  assert.equal(isInferred(s), true);
});
test("pending, case and separators are forgiven", () => {
  for (const v of ["pending", "Pending", "in_review"]) assert.equal(deriveState({ status: st(v) }).kind, "pending");
  assert.equal(isInferred(deriveState({ status: st("pending") })), false);
});
test("deferred stays open and is labelled inferred", () => {
  const s = deriveState({ status: st("deferred") });
  assert.equal(s.kind, "pending");
  assert.equal(isInferred(s), true);
});
test("approved plus a successful member read is a member", () => {
  const s = deriveState({ status: st("approved"), memberRead: yes });
  assert.equal(s.kind, "member");
  assert.equal(isInferred(s), false);
});
test("approved but the member read is refused is left (inferred); approved with no member read is an error", () => {
  assert.deepEqual(deriveState({ status: st("approved"), memberRead: refused }), { kind: "left", inferredFrom: "approved-but-not-member" });
  assert.equal(deriveState({ status: st("approved") }).kind, "error");
});
test("approved and the member read hits a network error is an error, not left", () => {
  const s = deriveState({ status: st("approved"), memberRead: { ok: false, network: true, message: "down" } });
  assert.equal(s.kind, "error");
});
test("withdrawn, rejected and needs-more-information", () => {
  assert.equal(deriveState({ status: st("withdrawn") }).kind, "withdrawn");
  assert.equal(deriveState({ status: st("rejected") }).kind, "rejected");
  assert.equal(deriveState({ status: st("needs-more-information") }).kind, "needs-info");
  assert.equal(deriveState({ status: st("awaitingEvidence") }).kind, "needs-info");
});
test("an unknown status becomes a generic other state carrying the raw value", () => {
  const s = deriveState({ status: st("quantum-flux") });
  assert.deepEqual(s, { kind: "other", status: "quantum-flux", requestId: "req-1" });
  assert.equal(journeyStep(s), "review");
  assert.equal(deriveState({ status: { ok: true, value: {} as StatusValue } }).kind, "other");
  assert.equal(deriveState({ status: { ok: true, value: { status: 5 as any } } }).kind, "other");
});
test("network failure and unexpected refusals are errors with their detail", () => {
  assert.deepEqual(deriveState({ status: { ok: false, network: true, message: "fetch failed" } }), { kind: "error", message: "fetch failed", code: "network" });
  const e = deriveState({ status: { ok: false, status: 500, code: "internal" } });
  assert.equal(e.kind, "error");
  assert.equal((e as any).httpStatus, 500);
});
test("needsMemberRead only for approved", () => {
  assert.equal(needsMemberRead(st("approved")), true);
  assert.equal(needsMemberRead(st("pending")), false);
  assert.equal(needsMemberRead(notFound), false);
});
test("journey step per state", () => {
  assert.equal(journeyStep({ kind: "visitor" }), "apply");
  assert.equal(journeyStep({ kind: "pending", status: "pending", deferred: false }), "review");
  assert.equal(journeyStep({ kind: "member" }), "member");
  assert.equal(journeyStep({ kind: "error", message: "x" }), "visit");
});

test("a rate limit is an error that says to wait, not a refusal about membership", () => {
  const limited: Probe = { ok: false, status: 429, code: "rateLimited", message: "too many unauthenticated requests" };
  const a = deriveState({ status: limited });
  assert.equal(a.kind, "error");
  assert.match((a as any).message, /rate-limiting/);
  const b = deriveState({ status: st("approved"), memberRead: limited });
  assert.equal(b.kind, "error"); // not "left": the member check never answered
  assert.equal((b as any).httpStatus, 429);
});
