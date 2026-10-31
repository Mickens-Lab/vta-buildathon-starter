import assert from "node:assert/strict";
import { test } from "node:test";
import { TUNNEL_LIFETIME, tunnelBanner } from "../src/index.ts";

test("tunnel mode has a banner naming every host and DID that dies at npm run down, and the next up", () => {
  const b = tunnelBanner("tunnel")!;
  assert.equal(b.title, "Tunnel mode: these hosts and DIDs last only for this run.");
  for (const s of ["the VTA, the VTC and the mediator", "applicant did:peer:2 that names the mediator", "die at `npm run down`", "`npm run up -- --tunnel`", "Do not bookmark or share"]) assert.ok(b.text.includes(s), s);
  // What scripts/up.ts tunnelDown() does, stated exactly.
  assert.match(b.text, /stops the tunnels, deletes the tunnel volumes and removes the tunnel keys/);
});

test("local and farm mode have no banner", () => {
  assert.equal(tunnelBanner("local"), undefined);
  assert.equal(tunnelBanner("farm"), undefined);
});

test("the short form for the panel's Mode note uses the same words", () => {
  assert.ok(TUNNEL_LIFETIME.includes("die at `npm run down`"));
  assert.ok(tunnelBanner("tunnel")!.text.includes("die at `npm run down`"));
  assert.ok(TUNNEL_LIFETIME.endsWith("`npm run up -- --tunnel`"));
});

test("the banner matches what npm run down does in scripts/up.ts", async () => {
  const { readFileSync } = await import("node:fs");
  const up = readFileSync(new URL("../../../scripts/up.ts", import.meta.url), "utf8");
  const down = /function tunnelDown\(\)[^]*?\n}\n/.exec(up)?.[0] ?? "";
  assert.match(down, /"down", "-v"/, "deletes the volumes");
  assert.match(down, /stopTunnels/, "stops the tunnels");
  assert.match(down, /removeEnv\(TUNNEL_ENV_KEYS\)/, "removes the tunnel keys");
  assert.match(up, /TUNNEL_ENV_KEYS = \[[^\]]*"VTA_CREDENTIAL"/, "the app credential is one of them");
});
