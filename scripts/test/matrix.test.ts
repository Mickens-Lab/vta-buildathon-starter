import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classify, formatMatrix, parseMatrix } from "../lib/matrix.js";

const doc = readFileSync(new URL("../../docs/VTC-SURFACE.md", import.meta.url), "utf8");

test("the real doc parses into the four persona columns", () => {
  const rows = parseMatrix(doc);
  assert.ok(rows.length >= 20);
  const disc = rows.find((r) => r.operation.startsWith("trust-task-discovery"))!;
  for (const p of ["stranger", "applicant", "member", "admin"] as const) assert.equal(disc.cells[p].outcome, "OK");
  const profile = rows.find((r) => r.operation.startsWith("community/profile"))!;
  assert.equal(profile.cells.stranger.outcome, "refused");
  assert.equal(profile.cells.member.outcome, "OK");
  const authn = rows.find((r) => r.operation.startsWith("auth/authenticate"))!;
  assert.equal(authn.cells.member.outcome, "refused");
  assert.equal(authn.cells.admin.outcome, "OK");
});
test("pipes inside backticks do not split a cell, and bad shapes throw", () => {
  const md = "## Who-can-call-what\n\n| Operation | stranger | applicant | member | admin |\n|---|---|---|---|---|\n| `a|b` | OK | - | refused (x) | notFound |\n";
  const [r] = parseMatrix(md);
  assert.equal(r.operation, "a|b");
  assert.deepEqual(["stranger", "applicant", "member", "admin"].map((p) => r.cells[p as "admin"].outcome), ["OK", "-", "refused", "notFound"]);
  assert.throws(() => parseMatrix("# nothing"), /heading/);
  assert.throws(() => parseMatrix(md.replace("stranger", "visitor")), /should be "stranger"/);
  assert.throws(() => parseMatrix(md.replace("| notFound |", "| notFound | extra |")), /columns/);
});
test("classify", () => {
  assert.equal(classify("OK (second open request)"), "OK");
  assert.equal(classify("not tried"), "untried");
  assert.equal(classify("notAMember"), "notMember");
  assert.equal(classify("`noKeyHolder`: x"), "other");
  assert.match(formatMatrix(parseMatrix(doc)), /operation\s+stranger\s+applicant\s+member\s+admin/);
});
