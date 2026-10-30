import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { hasGit, repoFiles, scannable } from "../lib/files.js";

test("without git, ignored and generated files are not scanned", () => {
  for (const p of ["node_modules/x/a.md", ".vta/admin.json", ".env", ".env.farm", "dist/a.js", "a/b/c.log", "k.pem", "x.passkey.json", "apps/my-app/src/a.ts", ".claude/w/a.md"]) assert.equal(scannable(p), false, p);
  for (const p of ["README.md", "scripts/up.ts", "apps/README.md", "docs/a.md", "package.json", ".gitignore"]) assert.equal(scannable(p), true, p);
});

test("repoFiles walks a folder that is not a git checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  mkdirSync(join(dir, "docs"));
  mkdirSync(join(dir, "node_modules/x"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# x");
  writeFileSync(join(dir, "docs/a.md"), "# a");
  writeFileSync(join(dir, "node_modules/x/b.md"), "# b");
  writeFileSync(join(dir, ".env"), "SECRET=1");
  assert.equal(hasGit(dir), false);
  assert.deepEqual(repoFiles(undefined, dir).sort(), ["README.md", "docs/a.md"]);
  assert.deepEqual(repoFiles(/\.md$/, dir).sort(), ["README.md", "docs/a.md"]);
});

test("check:generic and check:docs pass on a copy of the tree with no .git (a ZIP download)", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipcopy-"));
  const root = resolve(".");
  cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(node_modules|\.git|\.vta|\.claude|dist)(\/|$)/.test(p) });
  assert.equal(hasGit(dir), false);
  const run = (script: string) => execFileSync(join(root, "node_modules/.bin/tsx"), [`scripts/${script}.ts`, ...(script === "check-generic" ? ["--history"] : [])], { cwd: dir, encoding: "utf8", timeout: 120_000, env: { ...process.env, NODE_PATH: join(root, "node_modules") } });
  assert.match(run("check-generic"), /check:generic ok/);
  assert.match(run("check-generic"), /--history was skipped/);
  assert.match(run("check-docs"), /check:docs ok/);
});
