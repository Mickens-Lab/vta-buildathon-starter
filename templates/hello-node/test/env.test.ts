import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnv } from "../src/env.js";

test("parseEnv reads KEY=value lines and ignores comments and blanks", () => {
  assert.deepEqual(parseEnv("# note\nVTA_URL=http://localhost:8100\n\nVTA_CONTEXT=my-app\nbad line\n"), { VTA_URL: "http://localhost:8100", VTA_CONTEXT: "my-app" });
});

test("a value may contain =", () => {
  assert.equal(parseEnv("VTA_CREDENTIAL=abc==").VTA_CREDENTIAL, "abc==");
});
