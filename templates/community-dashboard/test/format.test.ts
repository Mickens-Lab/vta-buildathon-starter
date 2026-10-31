import assert from "node:assert/strict";
import { test } from "node:test";
import { codeTail, explainRefusal, formatDate, formatDuration, shortDid, splitTaskType, stripDids, toTypeScript } from "../src/format.ts";

test("shortDid keeps short ones and elides long ones", () => {
  assert.equal(shortDid("did:key:z6Mkabc"), "did:key:z6Mkabc");
  const long = "did:key:z6Mkfake-fake-fake-fake-ZZZZZZ";
  assert.equal(shortDid(long), "did:key:z6Mk...ZZZZZZ");
});
test("dates", () => {
  assert.equal(formatDate("2030-01-02T03:04:05Z"), "2030-01-02");
  assert.equal(formatDate("nonsense"), "nonsense");
  assert.equal(formatDate(undefined), "unknown");
});
test("durations", () => {
  assert.equal(formatDuration(12.4), "12 ms");
  assert.equal(formatDuration(1500), "1.5 s");
});
test("task type split", () => {
  assert.deepEqual(splitTaskType("https://trusttasks.org/spec/vtc/join-requests/status/0.1"), { name: "vtc/join-requests/status", version: "0.1" });
  assert.deepEqual(splitTaskType("GET /v1/member/me"), { name: "GET /v1/member/me", version: "" });
});
test("refusal wording", () => {
  assert.equal(codeTail("urn:example:error:notFound"), "notFound");
  assert.match(explainRefusal(404, "urn:example:error:notFound"), /no record/);
  assert.match(explainRefusal(403, "x:permissionDenied", "the signer holds no entry in this community"), /not a member/);
  assert.match(explainRefusal(429, undefined), /Too many/);
  assert.match(explainRefusal(undefined, "network"), /did not answer/);
  assert.match(explainRefusal(500, "weird"), /internal problem/);
  assert.match(explainRefusal(418, "teapot", "short and stout"), /short and stout/);
  assert.match(explainRefusal(409, "x:revisionConflict"), /changed this/);
  // vtc/members/vmc/0.1 refusals, by their declared codes.
  assert.match(explainRefusal(422, "vtc/members/vmc:subjectMismatch"), /different community[^]*subjectMismatch/);
  assert.match(explainRefusal(404, "vtc/members/vmc:notAMember", "no active member"), /not an active member[^]*notAMember/);
  assert.match(explainRefusal(422, "vtc/members/vmc:invalidCredential"), /could not accept the credential[^]*invalidCredential/);
});
test("stripDids removes DID-valued and DID-named fields at any depth", () => {
  const out = stripDids({ entryId: "e1", did: "did:key:zFake", values: { name: "Pat", ref: "did:web:example" }, list: [{ subject: "x", n: 1 }] });
  assert.deepEqual(out, { entryId: "e1", values: { name: "Pat" }, list: [{ n: 1 }] });
});
test("toTypeScript produces a runnable-looking snippet with the payload", () => {
  const ts = toTypeScript("https://trusttasks.org/spec/vtc/join-requests/status/0.1", { requestId: "r1" });
  assert.match(ts, /client\.call\("https:\/\/trusttasks\.org\/spec\/vtc\/join-requests\/status\/0\.1"/);
  assert.match(ts, /"requestId": "r1"/);
  assert.match(toTypeScript("GET /v1/member/me", {}), /memberProof/);
});
