// Live probe of a running MODE=tunnel stack: `npm run tunnel:probe` (not part of `npm test`).
// Read-only. Checks the public hosts, the VTA's DID at its tunnel host, and the messaging state, loudly:
// a VTA whose mediator connection failed keeps serving REST and only logs a warning.
// "messaging ok" means the transport is connected. It does NOT prove an app-level DIDComm/TSP round trip.
import { VtaClient, TT } from "@buildathon/vta-client";
import { env, loadAdmin } from "./env.js";
import { readTunnel } from "./lib/compose.js";
import { messagingVerdict, protocolsOf, tunnelUrls, vtcMessagingVerdict } from "./lib/tunnel.js";

type Level = "ok" | "FAIL" | "info";
const rows: [Level, string, string][] = [];
const add = (l: Level, what: string, detail: string) => { rows.push([l, what, detail]); };
const get = async (url: string) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String((e as Error).message) };
  }
};

const state = readTunnel();
if (!state) {
  console.error("no .vta/tunnel.json: there is no tunnel stack started by `MODE=tunnel npm run up`.");
  process.exit(1);
}
const u = tunnelUrls(state);

// 1. mediator, through its public host
const livez = await get(`${u.mediator}/mediator/v1/livez`);
add(livez.status === 200 ? "ok" : "FAIL", "mediator livez (public)", `HTTP ${livez.status} at ${u.mediator}`);

// 2. VTA health and DID at the tunnel host
const health = await get(`${u.vta}/health`);
add(health.status === 200 ? "ok" : "FAIL", "VTA /health (public)", `HTTP ${health.status} at ${u.vta}`);
const log = await get(`${u.vta}/.well-known/did.jsonl`);
const did = /"id":"(did:webvh:[^"#]+)"/.exec(log.text)?.[1];
add(did?.endsWith(`:${state.vtaHost}`) ? "ok" : "FAIL", "VTA did:webvh resolves at the tunnel host",
  log.status !== 200 ? `HTTP ${log.status}` : did ? (did.endsWith(`:${state.vtaHost}`) ? "DID is bound to the current tunnel host" : "DID names a different host: this volume is stale, reset with `MODE=tunnel npm run down`") : "no DID in the log");
const advertises = ["DIDCommMessaging", "TSPTransport"].filter((t) => log.text.includes(t));
add(advertises.length === 2 ? "ok" : "FAIL", "DID document advertises messaging", advertises.length ? advertises.join(", ") : "neither DIDCommMessaging nor TSPTransport");

// 3. the VTA's own account of its protocols (a silent REST-only fallback shows up here)
try {
  const admin = await VtaClient.connect(u.vta, loadAdmin(), undefined);
  await admin.authenticate();
  const ping = await admin.call(`${TT}/messaging/ping/0.1`, {});
  const v = messagingVerdict(protocolsOf(ping));
  add(v.state === "ok" ? "ok" : "FAIL", "VTA messaging (messaging/ping/0.1)", v.text);
} catch (e) {
  add("FAIL", "VTA messaging (messaging/ping/0.1)", `call failed: ${String((e as Error).message).slice(0, 200)}`);
}

// 4. VTC, if one runs
if (u.vtc) {
  const vh = await get(`${u.vtc}/health`);
  add(vh.status === 200 ? "ok" : "FAIL", "VTC /health (public)", `HTTP ${vh.status} at ${u.vtc}`);
  const pp = await get(`${u.vtc}/v1/community/public-profile`);
  let profile: unknown;
  try { profile = JSON.parse(pp.text); } catch { /* reported below */ }
  const v = vtcMessagingVerdict(profile);
  add(pp.status === 200 && v.state === "ok" ? "ok" : "FAIL", "VTC advertises messaging (public-profile)", pp.status === 200 ? v.text : `HTTP ${pp.status}`);
}

// 5. what this probe does not establish
add("info", "mediator ACL", "OPEN by design (any DID may register and relay): demo data only");
add("info", "DIDComm/TSP round trip", "transport connected, round trip unverified (this kit has no peer client yet)");

for (const [l, w, d] of rows) console.log(`${l === "ok" ? "ok  " : l === "FAIL" ? "FAIL" : "info"} ${w.padEnd(44)} ${d}`);
const failed = rows.filter((r) => r[0] === "FAIL").length;
console.log(failed ? `\n${failed} check(s) failed. See docs/MODES.md (troubleshooting).` : "\nall checks passed (VTA url: " + (env("VTA_URL") ?? u.vta) + ").");
process.exit(failed ? 1 : 0);
