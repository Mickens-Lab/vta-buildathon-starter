import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blocking, cloudflaredCheck, devPortCheck, dockerCheck, formatChecks, imageChecks, imagesNeeded, mediatorPortCheck, memoryCheck, nodeCheck,
  stackPortCheck, summary, vtiCheckout,
} from "../lib/doctor.js";
import { imageSpecs, imageStatus, type Docker, type ImageKind } from "../lib/images.js";
import { pins } from "../pins.js";

test("node: old versions fail with a fix, new ones pass", () => {
  assert.equal(nodeCheck("v22.3.0").level, "ok");
  const c = nodeCheck("v18.19.0");
  assert.equal(c.level, "fail");
  assert.match(c.fix!, /Node 20/);
});

test("docker: each missing piece has its own message", () => {
  assert.match(dockerCheck({ cli: false, daemon: false, compose: false }).detail, /not found/);
  assert.match(dockerCheck({ cli: true, daemon: false, compose: false }).detail, /daemon/);
  assert.match(dockerCheck({ cli: true, daemon: true, compose: false }).detail, /\(v2\) is missing/);
  assert.equal(dockerCheck({ cli: true, daemon: true, compose: true }).level, "ok");
});

test("memory warns, never blocks", () => {
  assert.equal(memoryCheck(2 * 1024 * 1024, 4, "an image build").level, "warn");
  assert.equal(memoryCheck(16 * 1024 * 1024, 4, "x").level, "ok");
  assert.equal(memoryCheck(undefined, 4, "x").level, "ok");
});

test("a busy stack port fails with the env override and a free port, unless this stack holds it", () => {
  const busy = { port: 8100, what: "VTA", env: "VTA_PORT", busy: true, ownStack: false };
  const c = stackPortCheck(busy, 8101);
  assert.equal(c.level, "fail");
  assert.match(c.fix!, /VTA_PORT=8101 npm run up/);
  assert.match(c.fix!, /lsof -i :8100/);
  assert.equal(stackPortCheck({ ...busy, ownStack: true }, 8101).level, "ok");
  assert.equal(stackPortCheck({ ...busy, busy: false }, undefined).level, "ok");
});

test("a busy template port only warns and suggests an allowed origin", () => {
  const c = devPortCheck({ port: 5173, what: "Vite", busy: true, ownStack: false }, 3000);
  assert.equal(c.level, "warn");
  assert.match(c.fix!, /--port 3000/);
  assert.doesNotMatch(c.fix!, /CORS change/);
  assert.match(devPortCheck({ port: 5173, what: "x", busy: true, ownStack: false }, 8200).fix!, /CORS change/);
});

test("mediator port and cloudflared", () => {
  assert.equal(mediatorPortCheck(true).level, "fail");
  assert.equal(mediatorPortCheck(false).level, "ok");
  assert.equal(cloudflaredCheck(false).level, "fail");
});

const specs = imageSpecs(pins());
/** A fake Docker holding `present`; pulls are never needed (imageStatus does not pull). */
const dockerWith = (present: string[]): Docker => ({ has: (r) => present.includes(r), pull: () => ({ ok: false, stderr: "" }) });
const rowsFor = (mode: "auto" | "local" | "registry", present: string[], kinds: ImageKind[] = ["vta", "vtc"]) => imageStatus(specs, dockerWith(present), mode, kinds);

test("images needed per mode", () => {
  assert.deepEqual(imagesNeeded("farm", true), []);
  assert.deepEqual(imagesNeeded("local", false), ["vta"]);
  assert.deepEqual(imagesNeeded("local", true), ["vta", "vtc"]);
  assert.deepEqual(imagesNeeded("tunnel", true), ["vta", "vtc", "mediator"]);
});

test("a missing prebuilt image warns: images:pull first, the local build second; up will pull it", () => {
  const cs = imageChecks(rowsFor("auto", [specs.vta.pinned]), specs);
  assert.equal(cs[0].level, "ok");
  assert.equal(cs[1].level, "warn");
  assert.match(cs[1].detail, /up\` will pull/);
  assert.match(cs[1].fix!, /^npm run images:pull vtc/);
  assert.ok(cs[1].fix!.indexOf("images:pull") < cs[1].fix!.indexOf("images:build vtc"));
  assert.equal(blocking(cs).length, 0);
  assert.doesNotMatch(formatChecks(cs), /pull access denied/);
});

test("a local build counts as present in auto mode", () => {
  const cs = imageChecks(rowsFor("auto", [specs.vta.local, specs.vtc.local]), specs);
  assert.deepEqual(cs.map((c) => c.level), ["ok", "ok"]);
  assert.match(cs[0].detail, /local build/);
});

test("IMAGES=local with no local build blocks, and says to build or unset IMAGES", () => {
  const cs = imageChecks(rowsFor("local", [specs.vta.local]), specs);
  assert.equal(cs[1].level, "fail");
  assert.match(cs[1].fix!, /images:build vtc/);
  assert.match(cs[1].fix!, /unset IMAGES/);
});

test("the default-on VTC image is optional: a warning, not a failure", () => {
  const cs = imageChecks(rowsFor("local", [specs.vta.local]), specs, true);
  assert.equal(cs[1].level, "warn");
  assert.match(cs[1].detail, /left out/);
  assert.match(cs[1].fix!, /WITH_VTC=0/);
  assert.equal(blocking(cs).length, 0);
});

test("VTI checkout missing is a warning with the clone command", () => {
  const c = vtiCheckout({ exists: false, dir: "../vti", repoUrl: "https://example.org/vti" });
  assert.equal(c.level, "warn");
  assert.match(c.fix!, /git clone https:\/\/example\.org\/vti/);
  assert.equal(vtiCheckout({ exists: true, dir: "../vti", repoUrl: "u" }).level, "ok");
});

test("formatting and the summary", () => {
  const cs = [nodeCheck("v22.0.0"), dockerCheck({ cli: true, daemon: false, compose: true })];
  const text = formatChecks(cs);
  assert.match(text, /ok {4}Node/);
  assert.match(text, /FAIL {2}Docker[^\n]*\n {8}-> start Docker/);
  assert.equal(blocking(cs).length, 1);
  assert.match(summary(cs), /1 problem\(s\) block/);
  assert.equal(summary([nodeCheck("v22.0.0")]), "All good.");
});

test("a server port (inbox-verifier) gets its own command and no CORS note", () => {
  const c = devPortCheck({ port: 4000, what: "inbox-verifier", busy: true, ownStack: false, server: true, use: (p) => `INBOX_PORT=${p} npm start -w @buildathon/inbox-verifier` }, 4001);
  assert.match(c.fix!, /INBOX_PORT=4001/);
  assert.doesNotMatch(c.fix!, /CORS/);
});
