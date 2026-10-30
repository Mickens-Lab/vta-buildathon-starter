import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneCommand, DEFAULT_VTI_DIR, fetchCommand, missingCheckoutMessage, missingRefMessage, parseBuildArgs } from "../lib/build-help.js";

test("the clone command names the repo url and the directory", () => {
  assert.equal(cloneCommand("https://example.org/vti"), `git clone https://example.org/vti ${DEFAULT_VTI_DIR}`);
  assert.equal(fetchCommand("../x"), "git -C ../x fetch --tags origin");
});

test("a missing checkout prints the clone command, the fetch, the --clone shortcut and VTI_PATH", () => {
  const m = missingCheckoutMessage({ dir: "/w/vti", repoUrl: "https://example.org/vti", explicitPath: false });
  assert.match(m, /git clone https:\/\/example\.org\/vti \/w\/vti/);
  assert.match(m, /fetch --tags/);
  assert.match(m, /--clone/);
  assert.match(m, /VTI_PATH/);
  assert.match(missingCheckoutMessage({ dir: "/w/vti", repoUrl: "u", explicitPath: true }), /VTI_PATH \(\/w\/vti\)/);
});

test("a stale checkout says which ref is missing and how to fetch", () => {
  const m = missingRefMessage({ dir: "../vti", ref: "abc123", tag: "vta-service-v1" });
  assert.match(m, /abc123 \(vta-service-v1\) is not in \.\.\/vti/);
  assert.match(m, /git -C \.\.\/vti fetch --tags origin/);
});

test("--clone is a flag, the first other argument is the image", () => {
  assert.deepEqual(parseBuildArgs([]), { which: "all", clone: false });
  assert.deepEqual(parseBuildArgs(["vta", "--clone"]), { which: "vta", clone: true });
  assert.deepEqual(parseBuildArgs(["--clone", "vtc"]), { which: "vtc", clone: true });
});
