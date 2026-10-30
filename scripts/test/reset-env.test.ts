import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "reset-env-"));
process.env.ENV_FILE = join(dir, ".env");
const { clearGeneratedEnv, GENERATED_ENV_KEYS } = await import("../env.js");

test("reset removes the kit's keys and keeps lines the user added", () => {
  writeFileSync(process.env.ENV_FILE!, "# my notes\nMODE=tunnel\nVTA_URL=http://x\nVTA_CREDENTIAL=abc\nMY_API_KEY=secret\nWITH_VTC=1\n");
  const kept = clearGeneratedEnv();
  assert.deepEqual(kept, ["# my notes", "MY_API_KEY", "WITH_VTC"].map((k) => k.split("=")[0]));
  assert.equal(readFileSync(process.env.ENV_FILE!, "utf8"), "# my notes\nMY_API_KEY=secret\nWITH_VTC=1\n");
});

test("when only generated keys exist the file is deleted", () => {
  writeFileSync(process.env.ENV_FILE!, GENERATED_ENV_KEYS.map((k) => `${k}=v`).join("\n") + "\n");
  assert.deepEqual(clearGeneratedEnv(), []);
  assert.equal(existsSync(process.env.ENV_FILE!), false);
});

test("a missing file is fine", () => {
  assert.deepEqual(clearGeneratedEnv(), []);
});
