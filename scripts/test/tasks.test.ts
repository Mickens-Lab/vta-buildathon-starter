import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPayloadInterfaces, parseCallArgs, searchTasks, slugOf, taskType } from "../lib/tasks.js";

const TYPES = ["https://trusttasks.org/spec/vta/memory/put/0.1", "https://trusttasks.org/spec/vta/memory/list/0.1", "https://trusttasks.org/spec/acl/list/0.1"];

test("slugs and types round trip", () => {
  assert.equal(taskType("vta/memory/put/0.1"), TYPES[0]);
  assert.equal(taskType("https://example.org/x/1"), "https://example.org/x/1");
  assert.equal(slugOf(TYPES[2]), "acl/list/0.1");
});

test("search needs every word, ignores case", () => {
  assert.deepEqual(searchTasks(TYPES, "memory").length, 2);
  assert.deepEqual(searchTasks(TYPES, "MEMORY put"), [TYPES[0]]);
  assert.deepEqual(searchTasks(TYPES, "nothing"), []);
  assert.equal(searchTasks(TYPES, "").length, 3);
});

test("argument parsing: positional task and json, --search, --schema", () => {
  assert.deepEqual(parseCallArgs(["vta/x/0.1", '{"a":1}']), { slug: "vta/x/0.1", json: '{"a":1}' });
  assert.equal(parseCallArgs(["--search", "memory"]).search, "memory");
  assert.equal(parseCallArgs(["--schema", "vta/memory/put/0.1"]).schema, "vta/memory/put/0.1");
  assert.match(parseCallArgs(["--search"]).error!, /needs a value/);
});

test("extractPayloadInterfaces keeps the interfaces and drops header and constants", () => {
  const src = "/** Generated */\nimport type { Ext } from 'x';\n\nexport interface A {\n  k: string;\n}\n\n/** Shared definitions this spec references */\nexport type { Ext };\nexport const TYPE_URI = 'u';\n";
  assert.equal(extractPayloadInterfaces(src), "export interface A {\n  k: string;\n}");
  assert.equal(extractPayloadInterfaces("const x = 1;"), undefined);
});
