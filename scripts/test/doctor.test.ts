import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blocking, cloudflaredCheck, devPortCheck, dockerCheck, formatChecks, imageChecks, imagesNeeded, mediatorPortCheck, memoryCheck, modeCheck, nodeCheck,
  stackPortCheck, summary, vtiCheckout,
} from "../lib/doctor.js";

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

test("images needed per mode, honouring overrides", () => {
  assert.deepEqual(imagesNeeded("farm", true), []);
  assert.deepEqual(imagesNeeded("local", false).map((n) => n.image), ["vta-buildathon:local"]);
  assert.deepEqual(imagesNeeded("local", true, { VTC_IMAGE: "mine/vtc:1" }).map((n) => n.image), ["vta-buildathon:local", "mine/vtc:1"]);
  assert.equal(imagesNeeded("tunnel", true).length, 3);
});

test("a missing image says no images are published and gives the exact build command", () => {
  const cs = imageChecks(imagesNeeded("local", true), (i) => i.startsWith("vta"));
  assert.equal(cs[0].level, "ok");
  assert.equal(cs[1].level, "fail");
  assert.match(cs[1].detail, /no images are published/);
  assert.match(cs[1].fix!, /^npm run images:build vtc/);
  assert.doesNotMatch(formatChecks(cs), /pull access denied/);
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
  assert.match(modeCheck("local", ".env", false).fix!, /--tunnel/);
});

test("a server port (inbox-verifier) gets its own command and no CORS note", () => {
  const c = devPortCheck({ port: 4000, what: "inbox-verifier", busy: true, ownStack: false, server: true, use: (p) => `INBOX_PORT=${p} npm start -w @buildathon/inbox-verifier` }, 4001);
  assert.match(c.fix!, /INBOX_PORT=4001/);
  assert.doesNotMatch(c.fix!, /CORS/);
});
