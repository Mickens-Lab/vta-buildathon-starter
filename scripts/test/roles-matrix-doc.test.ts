// Keeps the live role matrix (scripts/lib/live-matrix.ts, used by `npm run test:roles`) tied to docs/VTC-SURFACE.md:
// every probed task must be named there in the "all tasks served" table as `slug@version`, and every row must give
// all four personas an expectation. No network.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { MATRIX } from "../lib/live-matrix.ts";

const doc = readFileSync(new URL("../../docs/VTC-SURFACE.md", import.meta.url), "utf8");

test("every probed task appears in docs/VTC-SURFACE.md", () => {
  for (const r of MATRIX) {
    const m = /^vtc\/(.+)\/(\d+\.\d+)$/.exec(r.task);
    assert.ok(m, `bad task name ${r.task}`);
    assert.ok(doc.includes(`${m[1]}@${m[2]}`), `${r.task} is not listed in docs/VTC-SURFACE.md as ${m[1]}@${m[2]}`);
  }
});

test("every row expects an outcome for all four personas, and rows are unique", () => {
  const seen = new Set<string>();
  for (const r of MATRIX) {
    assert.ok(!seen.has(r.task), `duplicate ${r.task}`);
    seen.add(r.task);
    for (const p of ["stranger", "applicant", "member", "admin"] as const) assert.ok(r.expect[p]?.length, `${r.task} has no expectation for ${p}`);
  }
});

test("admin-only and member-only rows agree with the doc's who-column", () => {
  const line = (slug: string) => doc.split("\n").find((l) => l.startsWith("| ") && new RegExp(`[ ,]${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|\\s*\\|)`).test(l)) ?? "";
  for (const slug of ["members/list@0.2", "join-requests/list@0.2"]) assert.match(line(slug), /^\| admin/, `${slug} should be listed under admin`);
  for (const slug of ["directory/fields/list@0.1", "groups/list@0.2"]) assert.match(line(slug), /^\| active member/, `${slug} should be listed under active member`);
});
