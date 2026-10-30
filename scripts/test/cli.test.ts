import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { helpText, parseJsonArg, wantsHelp } from "../lib/cli.js";

test("helpText returns the leading comment block only", () => {
  assert.equal(helpText("// One line.\n//   npm run x -- --flag\nimport a from 'a';\n// later comment\n"), "One line.\n  npm run x -- --flag");
  assert.equal(helpText("#!/usr/bin/env tsx\n// After shebang\nconst x = 1;"), "After shebang");
  assert.equal(helpText("const x = 1;"), "");
});

test("wantsHelp", () => {
  assert.equal(wantsHelp(["--help"]), true);
  assert.equal(wantsHelp(["-h"]), true);
  assert.equal(wantsHelp(["vta/x", "{}"]), false);
});

test("parseJsonArg explains bad JSON instead of throwing", () => {
  assert.deepEqual(parseJsonArg('{"a":1}'), { ok: true, value: { a: 1 } });
  const bad = parseJsonArg("{key: value}", "the payload");
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.message, /the payload is not valid JSON/);
    assert.match(bad.message, /single quotes/);
    assert.match(bad.message, /\{key: value\}/);
  }
});

test("every runnable script imports the shared cli helper first", () => {
  const skip = new Set(["banner", "env", "farm-config", "farm-lib", "farm-select", "pins"]);
  const missing = readdirSync("scripts").filter((f) => f.endsWith(".ts") && !skip.has(f.slice(0, -3)))
    .filter((f) => !/^import "\.\/lib\/cli\.js";$/m.test(readFileSync(`scripts/${f}`, "utf8")));
  assert.deepEqual(missing, []);
});

test("--help prints a script's header and does not run it", () => {
  const r = spawnSync("npx", ["tsx", "scripts/hello.ts", "--help"], { encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /The checkpoint/);
  assert.doesNotMatch(r.stdout + r.stderr, /VTA_CREDENTIAL/);
});
