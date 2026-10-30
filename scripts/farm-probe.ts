// Read-only survey of BOTH VTA Farms side by side: versions, DID host, CORS, Trust Task door.
// GET, HEAD and OPTIONS only. Never POSTs, signs up, authenticates or sends a Trust Task.
// The Farm changes often (near-daily): run it the day before and on the day of an
// event, and read the stamped table, not an old copy of it. See docs/FARM.md.
//   npm run farm:probe                      # both farms from scripts/farm-hosts.json
//   FARM=firstperson npm run farm:probe     # one farm only (FARM unset = both)
//   FARM_HOSTS=my-hosts.json npm run farm:probe
//   FARM_AGENT=<your-agent-name> VTC_URL=https://<your-vtc> npm run farm:probe   # also check YOUR agent / community
//   (VTA_URL / VTC_URL, or FARM_VTA_URL / FARM_VTC_URL, work too; with none set only the hosts are probed)
//   FARM_PACE_MS=3000 ...                   # gap between requests (default 2000)
//   npm run farm:probe -- --json            # machine-readable output
import { PACE_MS, cmpVersion, probeAgent, probeDidHost, probeWeb, req, table, type Row } from "./farm-lib.js";
import { HOSTS_FILE, loadTable } from "./farm-config.js";
import { env } from "./env.js";
import { agentUrl, mediatorFromLog } from "./farm-select.js";
import { pins } from "./pins.js";

const t = loadTable();
const only = process.env.FARM?.trim().toLowerCase();
if (only && !t.farms[only]) { console.error(`FARM must be one of ${Object.keys(t.farms).join(", ")}; got "${only}".`); process.exit(2); }
const ids = only ? [only] : Object.keys(t.farms);
const one = (v: string | undefined, name: string) => (v ? [{ name, url: v }] : undefined);
const j = (s: string): any => { try { return JSON.parse(s); } catch { return undefined; } };

const stamp = new Date().toISOString();
const rows: Row[] = [];
const seen: { vta: string[]; vtc: string[] } = { vta: [], vtc: [] };
const sum: { id: string; didHost?: string; api: string; portal?: string; vtc: string[]; reachable: boolean }[] = [];

for (const id of ids) {
  const f = t.farms[id];
  const tag = (x: string) => `${id}/${x}`;
  const before = rows.length;
  const s = { id, api: "?", vtc: [] as string[], reachable: true, didHost: undefined as string | undefined, portal: undefined as string | undefined };
  // vtafarm-api: /health only says {"status":"ok"}; no version is exposed.
  const a = await req("GET", f.apiUrl.replace(/\/+$/, "") + "/health");
  s.api = a.status === 200 ? `ok${j(a.text)?.version ? " " + j(a.text).version : " (no version exposed)"}` : `HTTP ${a.status}`;
  rows.push({ host: tag("vtafarm-api"), kind: "api", check: "GET /health", result: `HTTP ${a.status} ${a.text.trim().slice(0, 60)}`, ok: a.status === 200 });
  for (const r of await probeDidHost(tag("did-host"), f.didHostUrl)) { rows.push(r); s.didHost = r.result; if (r.ok === false) s.reachable = false; }
  for (const r of await probeWeb(tag("portal"), f.portalUrl + "/")) { rows.push(r); s.portal = r.result; }
  // Only what the user configured: no agent or community is built in.
  const vtaUrl = process.env.FARM_VTA_URL ?? agentUrl(f, env("VTA_URL"), env("FARM_AGENT"));
  const vtas = one(vtaUrl, "your-agent") ?? [];
  const vtcs = one(process.env.FARM_VTC_URL ?? env("VTC_URL"), "your-vtc") ?? [];
  for (const x of vtas) { const r = await probeAgent("vta", tag(x.name), x.url, t.origins); rows.push(...r.rows); if (r.version) seen.vta.push(r.version); }
  for (const x of vtcs) {
    const r = await probeAgent("vtc", tag(x.name), x.url, t.origins); rows.push(...r.rows);
    if (r.version) { seen.vtc.push(r.version); s.vtc.push(`${x.name} ${r.version}`); }
    // Mediator DID source: the VTC's own DID log (not hardcoded anywhere in this kit).
    const l = await req("GET", x.url.replace(/\/+$/, "") + "/.well-known/did.jsonl");
    const m = l.status === 200 ? mediatorFromLog(l.text) : undefined;
    if (m) rows.push({ host: tag(x.name), kind: "vtc", check: "mediator (TSPTransport in DID log)", result: m, ok: null });
  }
  if (!vtcs.length) s.vtc.push("none configured");
  if (rows.slice(before).some((r) => r.ok === false)) s.reachable = false;
  sum.push(s);
}
for (const x of t.web) rows.push(...(await probeWeb(x.name, x.url)));

// Read-only evidence of health for AGENT CREATION is limited: a farm is "reachable" when its API,
// DID host and portal answer. Creation itself can only be proven by creating (portal login + POST),
// so known issues recorded in farm-hosts.json are printed next to the verdict.
const p = pins();
const verdict = ids.map((id) => {
  const s = sum.find((x) => x.id === id)!, f = t.farms[id];
  const status = !s.reachable ? "UNREACHABLE" : f.issues.length ? "REACHABLE, KNOWN ISSUE" : "REACHABLE, no known issue";
  return { farm: id, preferred: f.preferred, status, api: s.api, didHost: s.didHost, portal: s.portal, vtc: s.vtc, issues: f.issues };
});
const best = verdict.filter((v) => v.status === "REACHABLE, no known issue").sort((a, b) => Number(b.preferred) - Number(a.preferred))[0];
const summary = {
  probedAt: stamp,
  vta: [...new Set(seen.vta)].map((v) => ({ version: v, vsPin: `${cmpVersion(v, p.vti.vta.version)} (${p.vti.vta.version})` })),
  vtc: [...new Set(seen.vtc)].map((v) => ({ version: v, vsPin: `${cmpVersion(v, p.vti.vtc.version)} (${p.vti.vtc.version})` })),
  farms: verdict, useFarm: best?.farm ?? "none (fall back to local mode)",
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...summary, rows }, null, 2));
} else {
  console.log(`VTA Farm probe at ${stamp}  (read-only; ${PACE_MS} ms between requests; hosts: scripts/farm-hosts.json)\n`);
  console.log(table(rows));
  console.log("\nSide by side:");
  const w = (s: string, n: number) => s.padEnd(n);
  console.log(`  ${w("farm", 12)} ${w("api", 22)} ${w("did-hosting-control", 40)} ${w("portal", 52)} vtc`);
  for (const v of verdict) console.log(`  ${w(v.farm + (v.preferred ? "*" : ""), 12)} ${w(v.api, 22)} ${w(v.didHost ?? "?", 40)} ${w(v.portal ?? "?", 52)} ${v.vtc.join(", ")}`);
  console.log("  (* = preferred)");
  console.log("\nHealth for agent creation, from read-only evidence only:");
  for (const v of verdict) console.log(`  ${v.farm}: ${v.status}${v.issues.length ? "\n    " + v.issues.join("\n    ") : ""}`);
  console.log(`  => use: ${summary.useFarm}  (order: ic3, firstperson, local mode)`);
  console.log("\nVersions seen vs pins.json:");
  for (const s of summary.vta) console.log(`  vta-service ${s.version}: ${s.vsPin}`);
  for (const s of summary.vtc) console.log(`  vtc-service ${s.version}: ${s.vsPin}`);
  if (!summary.vta.length) console.log("  no agent configured, version not checked (set FARM_AGENT or VTA_URL)");
  if (!summary.vtc.length) console.log("  no VTC configured (set VTC_URL to check one)");
  console.log(`\nNot checkable without an account: agent creation itself (portal login + POST), the VTC join manifest/criteria, joinPolicy.
Record this table in docs/FARM.md ("Farm versions observed") when it differs from the last one.
Where a VTC is newer than the pin, check the VTI CHANGELOG for dropped Trust Task versions (docs/FARM.md).`);
}
process.exit(rows.some((r) => r.ok === false) ? 1 : 0);
