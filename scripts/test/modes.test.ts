import assert from "node:assert/strict";
import { test } from "node:test";
import { modeLine, parseModeFlags, resolveMode, resolveVtc, validMode } from "../lib/modes.js";

test("mode precedence: flag, environment, .env, running stack, default", () => {
  assert.deepEqual(resolveMode({ flag: "tunnel", env: "local", dotenv: "farm", marker: "local" }), { mode: "tunnel", source: "flag" });
  assert.deepEqual(resolveMode({ env: "local", dotenv: "farm", marker: "tunnel" }), { mode: "local", source: "environment" });
  assert.deepEqual(resolveMode({ dotenv: "farm", marker: "tunnel" }), { mode: "farm", source: ".env" });
  assert.deepEqual(resolveMode({ marker: "tunnel" }), { mode: "tunnel", source: "running stack" });
  assert.deepEqual(resolveMode({ marker: null }), { mode: "local", source: "default" });
});

test("an invalid MODE names the file to edit", () => {
  assert.throws(() => validMode("cloud", ".env.x"), /"local", "tunnel" or "farm", got "cloud"\. Edit \.env\.x/);
  assert.throws(() => resolveMode({ dotenv: "nope" }), /Edit \.env/);
});

test("flags are pulled out of argv and two modes conflict", () => {
  assert.deepEqual(parseModeFlags(["--tunnel", "down"]), { mode: "tunnel", rest: ["down"] });
  assert.deepEqual(parseModeFlags(["--no-vtc"]), { vtc: false, rest: [] });
  assert.equal(parseModeFlags(["--vtc"]).vtc, true);
  assert.match(parseModeFlags(["--local", "--tunnel"]).error!, /conflicts with --local/);
  assert.equal(parseModeFlags(["--local", "--local"]).error, undefined);
});

test("the VTC default is on in every mode; WITH_VTC and flags make it explicit", () => {
  assert.deepEqual(resolveVtc({}), { on: true, explicit: false });
  assert.deepEqual(resolveVtc({ env: "0" }), { on: false, explicit: true });
  assert.deepEqual(resolveVtc({ env: "1" }), { on: true, explicit: true });
  assert.deepEqual(resolveVtc({ env: "1", flag: false }), { on: false, explicit: true });
});

test("the mode line says which mode, why, and the VTC", () => {
  assert.equal(modeLine("tunnel", "flag", true), "mode: tunnel (from the flag, this run only), community (VTC) on");
  assert.match(modeLine("local", "running stack", false), /the stack that is already there\), community \(VTC\) off/);
  assert.equal(modeLine("farm", ".env", true), "mode: farm (from .env)");
});
