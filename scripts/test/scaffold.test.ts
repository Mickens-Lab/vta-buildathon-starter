import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseNewArgs, renamePackage, scaffold, STARTERS, validName } from "../lib/scaffold.js";

test("names", () => {
  assert.equal(validName("my-app"), undefined);
  assert.match(validName("My App")!, /not a usable name/);
  assert.match(validName("../x")!, /not a usable name/);
  assert.match(validName(undefined)!, /give the new app a name/);
});

test("arguments", () => {
  assert.deepEqual(parseNewArgs(["my-app", "--from", "hello-web"]), { name: "my-app", from: "hello-web" });
  assert.deepEqual(parseNewArgs(["--from", "hello-node", "x"]), { name: "x", from: "hello-node" });
  assert.deepEqual(parseNewArgs([]), { name: undefined, from: undefined });
});

test("renamePackage keeps dependencies and scripts", () => {
  const out = JSON.parse(renamePackage('{"name":"@buildathon/hello-web","version":"0.1.0","scripts":{"dev":"vite"},"dependencies":{"a":"*"}}', "my-app"));
  assert.equal(out.name, "@apps/my-app");
  assert.equal(out.scripts.dev, "vite");
  assert.deepEqual(out.dependencies, { a: "*" });
});

test("every starter exists as a template folder and names a run command", () => {
  for (const [k, v] of Object.entries(STARTERS)) {
    assert.ok(existsSync(join("templates", k, "package.json")), k);
    assert.match(v.run("@apps/x"), /-w @apps\/x/);
  }
});

test("scaffold copies without node_modules, renames, and refuses an existing folder", () => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-"));
  mkdirSync(join(root, "templates/t/src"), { recursive: true });
  mkdirSync(join(root, "templates/t/node_modules/x"), { recursive: true });
  writeFileSync(join(root, "templates/t/package.json"), '{"name":"@buildathon/t","version":"1.0.0"}');
  writeFileSync(join(root, "templates/t/src/a.ts"), "export {};");
  mkdirSync(join(root, "apps"));
  assert.equal(scaffold(root, "t", "demo"), "@apps/demo");
  assert.equal(JSON.parse(readFileSync(join(root, "apps/demo/package.json"), "utf8")).name, "@apps/demo");
  assert.ok(existsSync(join(root, "apps/demo/src/a.ts")));
  assert.equal(existsSync(join(root, "apps/demo/node_modules")), false);
  assert.throws(() => scaffold(root, "t", "demo"), /already exists/);
  assert.throws(() => scaffold(root, "nope", "other"), /no template/);
});
