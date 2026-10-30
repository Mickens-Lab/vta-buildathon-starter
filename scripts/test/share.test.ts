import assert from "node:assert/strict";
import { test } from "node:test";
import { imageSpecs } from "../lib/images.js";
import { archWarning, exportRefs, loadArgs, loadedRefs, saveArgs, SHARE_TRUST_NOTE } from "../lib/share.js";
import { pins } from "../pins.js";

const specs = imageSpecs(pins());

test("export saves the :local tags, in order, with -o (no shell pipe)", () => {
  assert.deepEqual(exportRefs(specs, ["vta", "vtc"]), [specs.vta.local, specs.vtc.local]);
  assert.deepEqual(saveArgs(["a:local", "b:local"], "x.tar"), ["save", "-o", "x.tar", "a:local", "b:local"]);
  assert.deepEqual(loadArgs("x.tar"), ["load", "-i", "x.tar"]);
});

test("import: loaded tags are read from docker's output", () => {
  assert.deepEqual(loadedRefs("Loaded image: vta-buildathon:local\nLoaded image: vtc-buildathon:local\n"), ["vta-buildathon:local", "vtc-buildathon:local"]);
  assert.deepEqual(loadedRefs("Loaded image ID: sha256:abc\n"), []);
});

test("architecture mismatch warns and names the way out; same arch (any spelling) does not", () => {
  assert.match(archWarning("v:local", "arm64", "amd64")!, /npm run setup/);
  assert.equal(archWarning("v:local", "amd64", "x86_64"), undefined);
  assert.equal(archWarning("v:local", "arm64", "aarch64"), undefined);
});

test("the trust note says a tar is unsigned", () => {
  assert.match(SHARE_TRUST_NOTE, /only as trustworthy/);
});
