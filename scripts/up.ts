// One entry point for all modes: `npm run up`, `npm run down`.
//   MODE=local   keygen + docker compose up (VTA) + provision   [+ VTC with WITH_VTC=1]
//   MODE=tunnel  keygen, 3 public quick tunnels, mediator, VTA, VTC (default; WITH_VTC=0 to skip), provision, probe
//   MODE=farm    mint the admin key and print the portal steps; once VTA_URL is in
//                .env, provision.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { devBanner, tunnelBanner } from "./banner.js";
import { die, env, mode, removeEnv, updateEnv } from "./env.js";
import {
  clearStackFiles, dc, existingStackVolumes, have, imageLabel, readStackMode, readTunnel, sleep, startTunnel, stopTunnels, waitFor200,
  writeStackMode, writeTunnel,
} from "./lib/compose.js";
import { composeEnv, tunnelUrls, TUNNEL_FILE, volumeGuard, type TunnelState } from "./lib/tunnel.js";
import { pins } from "./pins.js";

const run = (cmd: string, args: string[], extraEnv: Record<string, string> = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, DEV_BANNER_SHOWN: "1", ...extraEnv } });
  if (r.status !== 0) die(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.status}).`);
};
const npm = (s: string, extraEnv: Record<string, string> = {}) => run("npm", ["run", "--silent", s], extraEnv);
const guard = (want: "local" | "tunnel") => {
  const g = volumeGuard({ want, marker: readStackMode(), volumes: existingStackVolumes() });
  if (!g.ok) die(g.message);
};
/** Tunnel-mode variables that keys in .env would otherwise carry over from a dead stack. */
const TUNNEL_ENV_KEYS = ["VTA_URL", "VTA_DID", "VTA_CONTEXT", "APP_DID", "VTA_CREDENTIAL", "VTC_URL", "VTC_DID"];

async function tunnelUp(): Promise<void> {
  tunnelBanner();
  const p = pins();
  if (!have("cloudflared")) die("MODE=tunnel needs the `cloudflared` binary on PATH (quick tunnels, no account). Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ . Validated with " + p.messaging.cloudflared.validated + ".");
  const withVtc = process.env.WITH_VTC !== "0";
  const missing = [
    [process.env.VTA_IMAGE ?? "vta-buildathon:local", "npm run images:build vta"],
    ...(withVtc ? [[process.env.VTC_IMAGE ?? "vtc-buildathon:local", "npm run images:build vtc"]] : []),
    [process.env.MEDIATOR_IMAGE ?? "mediator-buildathon:local", "npm run images:build mediator   (about 15 min, see docs/MODES.md)"],
  ].filter(([img]) => spawnSync("docker", ["image", "inspect", img!], { stdio: "ignore" }).status !== 0);
  if (missing.length) die(`missing image(s): ${missing.map(([i, how]) => `${i} (${how})`).join("; ")}.`);
  const features = imageLabel(process.env.VTA_IMAGE ?? "vta-buildathon:local", "org.buildathon.vta-features");
  if (features !== undefined && features !== "" && !features.split(",").includes("tsp")) {
    die(`the VTA image was built without \`tsp\` (features: ${features}); MODE=tunnel needs it. Rebuild: npm run images:build vta.`);
  }
  guard("tunnel");
  if (readTunnel()) die(`${TUNNEL_FILE} exists: a tunnel stack was started and not taken down. Run MODE=tunnel npm run down first.`);

  npm("vta:keygen");
  removeEnv(TUNNEL_ENV_KEYS);
  console.log("starting 3 quick tunnels (about 15 s)...");
  const state: TunnelState = { vtaHost: "", vtcHost: "", medHost: "", startedAt: new Date().toISOString(), pids: [] };
  try {
    // 1. tunnels first: every DID and config below names these hostnames.
    const wanted: ["vtaHost" | "medHost" | "vtcHost", string, number][] = [["vtaHost", "vta", 8100], ["medHost", "mediator", 7037]];
    if (withVtc) wanted.push(["vtcHost", "vtc", 8200]);
    for (const [key, name, port] of wanted) {
      const t = await startTunnel(name, Number(process.env[`${name.toUpperCase()}_PORT`] ?? port));
      state[key] = t.host;
      state.pids.push(t.pid);
    }
    writeTunnel(state);
    const urls = tunnelUrls(state);
    // 2. mediator (needs only its own host), then read its DID for the VTA and VTC configs.
    console.log("starting redis + mediator...");
    let r = dc("tunnel", withVtc, ["up", "-d", "--wait", "--no-build", "redis", "mediator"], { inherit: true });
    if (r.status !== 0) throw new Error("the mediator did not become healthy; see `docker compose --profile messaging logs mediator`.");
    const line = dc("tunnel", withVtc, ["exec", "-T", "mediator", "grep", "-m1", "^mediator_did", "/conf/mediator.toml"]).stdout;
    state.mediatorDid = /did:peer:[A-Za-z0-9._%=:-]+/.exec(line ?? "")?.[0];
    if (!state.mediatorDid) throw new Error("could not read the mediator DID from its config.");
    writeTunnel(state);
    if (!(await waitFor200(`${urls.mediator}/mediator/v1/livez`, 90_000))) throw new Error(`the mediator is up but ${urls.mediator} does not answer through the tunnel (DNS can lag; try the probe again in a minute).`);
    // 3. VTA, then check its did:webvh resolves at the public host before anything else needs it.
    console.log("starting the VTA...");
    r = dc("tunnel", withVtc, ["up", "-d", "--wait", "vta"], { inherit: true });
    if (r.status !== 0) throw new Error("the VTA did not become healthy; see `docker compose logs vta`.");
    if (!(await waitFor200(`${urls.vta}/.well-known/did.jsonl`, 90_000))) throw new Error(`the VTA DID log is not reachable at ${urls.vta}.`);
    writeStackMode("tunnel");
    updateEnv({ VTA_URL: urls.vta, ...(urls.vtc ? { VTC_URL: urls.vtc } : {}) });
    npm("vta:provision", { VTA_URL: urls.vta });
    if (withVtc) {
      npm("vtc:up", { VTA_URL: urls.vta, ...composeEnv(state) });
      if (!(await waitFor200(`${urls.vtc}/health`, 120_000))) throw new Error(`the VTC does not answer at ${urls.vtc}; see \`docker compose --profile vtc logs vtc\`.`);
    }
  } catch (e) {
    console.error(`\n${(e as Error).message}\nThe stack is left running for inspection. Tear it down with: MODE=tunnel npm run down`);
    process.exit(1);
  }
  await sleep(1000);
  console.log("\nrunning the tunnel probe:");
  const probe = spawnSync("npm", ["run", "--silent", "tunnel:probe"], { stdio: "inherit", env: { ...process.env, DEV_BANNER_SHOWN: "1", MODE: "tunnel" } });
  if (probe.status !== 0) die("the tunnel probe found a problem (above). The stack is left running; fix it or tear it down with MODE=tunnel npm run down.");
  console.log(`\nVTA ${tunnelUrls(state).vta}\n${withVtc ? `VTC ${tunnelUrls(state).vtc}\n` : ""}These URLs are public and die with this run. Tear down: MODE=tunnel npm run down.`);
}

function tunnelDown(): void {
  const t = readTunnel();
  dc("tunnel", true, ["down", "-v", "--remove-orphans"], { inherit: true });
  const n = stopTunnels(t?.pids ?? []);
  clearStackFiles();
  removeEnv(TUNNEL_ENV_KEYS);
  console.log(`stopped ${n} tunnel(s); deleted the tunnel volumes (their DIDs were bound to hosts that are gone) and the tunnel keys in .env.`);
}

const down = process.argv[2] === "down";
if (!down) devBanner();
const m = mode();
if (down && (m === "tunnel" || existsSync(TUNNEL_FILE))) {
  tunnelDown();
} else if (m === "tunnel") {
  if (down) die("unreachable");
  await tunnelUp();
} else if (m === "local") {
  if (down) {
    run("docker", ["compose", "--profile", "vtc", "down"]);
  } else {
    guard("local");
    npm("vta:keygen");
    run("docker", ["compose", ...(process.env.WITH_VTC === "1" ? ["--profile", "vtc"] : []), "up", "-d", "--wait"]);
    writeStackMode("local");
    npm("vta:provision");
    if (process.env.WITH_VTC === "1") npm("vtc:up");
  }
} else if (down) {
  console.log("MODE=farm: nothing runs locally. Delete the agent in the VTA Farm portal if you are done.");
} else if (env("VTA_URL")?.startsWith("https://")) {
  npm("vta:keygen");
  npm("vta:provision");
} else {
  npm("farm:setup");
}
