import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseMode } from "../env.js";
import {
  composeEnv, composeProject, existingVolumes, hostFromLog, memoryWarning, messagingVerdict, profileArgs, protocolsOf, tunnelUrls,
  vtcMessagingVerdict, volumeGuard, type TunnelState,
} from "../lib/tunnel.js";
import { pins } from "../pins.js";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const state: TunnelState = { vtaHost: "vta-x.trycloudflare.com", vtcHost: "vtc-x.trycloudflare.com", medHost: "med-x.trycloudflare.com", mediatorDid: "did:peer:2.fake", startedAt: "t", pids: [1] };

test("mode selection accepts exactly local, tunnel, farm; default local", () => {
  assert.equal(parseMode(undefined), "local");
  assert.equal(parseMode(" tunnel "), "tunnel");
  assert.equal(parseMode("farm"), "farm");
  for (const bad of ["messaging", "Tunnel", "", "local,tunnel"]) assert.throws(() => parseMode(bad), /MODE must be "local", "tunnel" or "farm"/);
});

test("hostFromLog finds the quick-tunnel host and ignores the control plane", () => {
  const log = [
    "2026-01-01T00:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...",
    "ERR failed to request quick Tunnel: Post \"https://api.trycloudflare.com/tunnel\": EOF",
    "|  https://pretty-sample-words-here.trycloudflare.com  |",
  ].join("\n");
  assert.equal(hostFromLog(log), "pretty-sample-words-here.trycloudflare.com");
  assert.equal(hostFromLog("only https://api.trycloudflare.com/tunnel"), undefined);
  assert.equal(hostFromLog(""), undefined);
});

test("compose environment names the hosts, the mediator DID and turns the loopback allowance off", () => {
  assert.deepEqual(composeEnv(state), {
    VTA_PUBLIC_HOST: "vta-x.trycloudflare.com", VTC_PUBLIC_HOST: "vtc-x.trycloudflare.com", MEDIATOR_PUBLIC_HOST: "med-x.trycloudflare.com",
    MEDIATOR_DID: "did:peer:2.fake", VTA_ALLOW_PRIVATE_ENDPOINTS: "0",
  });
  assert.equal(composeEnv({ ...state, mediatorDid: undefined }).MEDIATOR_DID, "");
  assert.deepEqual(tunnelUrls({ ...state, vtcHost: "" }), { vta: "https://vta-x.trycloudflare.com", vtc: undefined, mediator: "https://med-x.trycloudflare.com" });
});

test("profiles: tunnel always adds messaging and vtc; local adds vtc only on request", () => {
  assert.deepEqual(profileArgs("local", false), []);
  assert.deepEqual(profileArgs("local", true), ["--profile", "vtc"]);
  assert.deepEqual(profileArgs("tunnel", false), ["--profile", "vtc", "--profile", "messaging"]);
});

test("volumes are matched by compose project name", () => {
  assert.equal(composeProject("/x/Vta-Buildathon-Starter", ""), "vta-buildathon-starter");
  assert.equal(composeProject("/x/y", "custom"), "custom");
  const all = ["p_vta-data", "p_mediator-data", "other_vta-data", "p_unrelated"];
  assert.deepEqual(existingVolumes(all, "p"), ["vta-data", "mediator-data"]);
  assert.deepEqual(existingVolumes(all, "q"), []);
});

test("stale-volume refusal: no volumes is always fine", () => {
  assert.deepEqual(volumeGuard({ want: "tunnel", marker: null, volumes: [] }), { ok: true });
  assert.deepEqual(volumeGuard({ want: "local", marker: "tunnel", volumes: [] }), { ok: true });
});
test("stale-volume refusal: local data is never reused by tunnel, and says how to reset", () => {
  for (const marker of ["local", null] as const) {
    const g = volumeGuard({ want: "tunnel", marker, volumes: ["vta-data"] });
    assert.equal(g.ok, false);
    assert.match((g as any).message, /MODE=local run/);
    assert.match((g as any).message, /npm run vta:reset/);
  }
});
test("stale-volume refusal: every tunnel run needs fresh volumes, even after another tunnel run", () => {
  const g = volumeGuard({ want: "tunnel", marker: "tunnel", volumes: ["vta-data", "mediator-data"] });
  assert.equal(g.ok, false);
  assert.match((g as any).message, /new hostnames and therefore new DIDs/);
  assert.match((g as any).message, /MODE=tunnel npm run down/);
});
test("stale-volume refusal: tunnel leftovers never reach local mode, with or without the marker", () => {
  for (const marker of ["tunnel", null] as const) {
    const g = volumeGuard({ want: "local", marker, volumes: ["vta-data", "mediator-data"] });
    assert.equal(g.ok, false);
    assert.match((g as any).message, /MODE=tunnel npm run down/);
  }
});
test("local to local keeps its volumes, including a legacy local volume with no marker", () => {
  assert.deepEqual(volumeGuard({ want: "local", marker: "local", volumes: ["vta-data", "vtc-data"] }), { ok: true });
  assert.deepEqual(volumeGuard({ want: "local", marker: null, volumes: ["vta-data"] }), { ok: true });
});

test("memory warning only when below the estimate; silent when unknown", () => {
  assert.equal(memoryWarning(undefined), undefined);
  assert.equal(memoryWarning(16 * 1024 * 1024), undefined);
  assert.match(memoryWarning(2 * 1024 * 1024)!, /only 2\.0 GB.*8 GB/);
});

test("messaging verdict is loud when didcomm or tsp is missing (the silent REST fallback)", () => {
  const ok = messagingVerdict(["tsp", "didcomm", "rest"]);
  assert.equal(ok.state, "ok");
  assert.match(ok.text, /transport connected.*round trip unverified/);
  for (const p of [["rest"], ["didcomm", "rest"], []]) {
    const v = messagingVerdict(p);
    assert.equal(v.state, "degraded");
    assert.match(v.text, /MESSAGING DEGRADED/);
    assert.match(v.text, /REST only/);
  }
  assert.equal(messagingVerdict(undefined).state, "unknown");
});
test("ping payload shapes", () => {
  assert.deepEqual(protocolsOf(["tsp", "rest"]), ["tsp", "rest"]);
  assert.deepEqual(protocolsOf({ protocols: ["didcomm"] }), ["didcomm"]);
  assert.equal(protocolsOf({ protocols: [1] }), undefined);
  assert.equal(protocolsOf(null), undefined);
});
test("VTC public-profile transports must be advertised AND serviceable", () => {
  const t = (protocol: string, advertised = true, serviceable = true) => ({ protocol, advertised, serviceable, endpoint: "fake" });
  assert.equal(vtcMessagingVerdict({ transports: [t("tsp"), t("didcomm"), t("rest")] }).state, "ok");
  assert.equal(vtcMessagingVerdict({ transports: [t("tsp"), t("didcomm", true, false), t("rest")] }).state, "degraded");
  assert.equal(vtcMessagingVerdict({ transports: [t("rest")] }).state, "degraded");
  assert.equal(vtcMessagingVerdict({}).state, "unknown");
});

test("pins carry the mediator, the VTA feature list with tsp, and the build files agree", () => {
  const p = pins();
  assert.match(p.messaging.mediator.ref, /^[0-9a-f]{40}$/);
  assert.equal(p.messaging.mediator.version, "0.33.1");
  assert.ok(p.messaging.mediator.features.split(",").includes("tsp"));
  assert.ok(p.vti.vta.features!.split(",").includes("tsp"));
  assert.match(read("docker/mediator.Dockerfile"), /ARG MEDIATOR_REF\b/);
  assert.ok(read("docker-compose.yml").includes(`redis:${p.messaging.redis.tag}`), "compose redis default matches pins.json");
});

test("compose: messaging profile holds redis and mediator; vta and vtc stay profile-free of messaging", () => {
  const c = read("docker-compose.yml");
  for (const svc of ["redis", "mediator"]) assert.match(c, new RegExp(`\\n  ${svc}:\\n    profiles: \\["messaging"\\]`));
  assert.doesNotMatch(c, /\n  vta:\n    profiles/);
  assert.match(c, /VTA_ALLOW_PRIVATE_ENDPOINTS: "\$\{VTA_ALLOW_PRIVATE_ENDPOINTS:-1\}"/, "local mode keeps the loopback allowance");
});

test("entrypoints are valid sh and say what tunnel mode is", () => {
  for (const f of ["vta-entrypoint.sh", "vtc-entrypoint.sh", "mediator-entrypoint.sh"]) {
    const r = spawnSync("sh", ["-n", new URL(`../../${f}`, import.meta.url).pathname], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
  const m = read("mediator-entrypoint.sh");
  assert.match(m, /OPEN/);
  assert.match(m, /explicit_deny/);
  assert.match(m, />\/tmp\/setup\.out/, "mediator-setup stdout (it prints the admin private key) is not left in container logs");
  assert.match(read("vta-entrypoint.sh"), /refusing to start: this volume was set up for/);
  // local mode must still render the old config
  assert.match(read("vta-entrypoint.sh"), /MESSAGING_TOML='kind = "skip"'/);
});
