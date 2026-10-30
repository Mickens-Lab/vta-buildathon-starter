import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("docs/COMMANDS.md mentions every root npm script", () => {
  const scripts = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).scripts);
  const doc = readFileSync("docs/COMMANDS.md", "utf8");
  const missing = scripts.filter((s) => !new RegExp("(?<![\\w:-])" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])").test(doc));
  assert.deepEqual(missing, [], "add these to docs/COMMANDS.md");
});
