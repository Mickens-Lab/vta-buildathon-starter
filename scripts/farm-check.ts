// Read-only: probe the VTA/VTC named in .env with the same checks as farm:probe
// (shared scripts/farm-lib.ts). Sends no Trust Task and no credentials.
// To survey the Farm's own public hosts instead, run `npm run farm:probe`.
import { ENV_FILE, env } from "./env.js";
import { resolveFarmAgent } from "./farm-config.js";
import { WALLET_EXTENSION_ORIGIN, cmpVersion, probeAgent, table, vtaMismatchWarning, type Row } from "./farm-lib.js";
import { farmImageTag, pins } from "./pins.js";

const sel = await resolveFarmAgent();
console.log(`farm ${sel.id} (${sel.farm.name}); ${sel.farm.issues.length ? "KNOWN ISSUE: " + sel.farm.issues.join(" ") : "no known issues"}`);
for (const n of sel.notes) console.log(n);
const vta = env("VTA_URL");
const vtc = env("VTC_URL");
if (!vta && !vtc) {
  console.error(`Set VTA_URL (and VTC_URL for a community) in ${ENV_FILE} (or FARM_AGENT=<name>) first. Run \`npm run farm:setup\` for the steps.`);
  process.exit(1);
}
const origins = ["http://localhost:5173", WALLET_EXTENSION_ORIGIN];
const rows: Row[] = [];
const p = pins();
if (vta) {
  const r = await probeAgent("vta", "VTA_URL", vta, origins);
  rows.push(...r.rows);
  console.log(`vta-service ${r.version ?? "unknown"}: ${cmpVersion(r.version, p.vti.vta.version)} (${p.vti.vta.version})`);
  const warn = vtaMismatchWarning(r.version, p.vti.vta.version, farmImageTag(p));
  if (warn.length) console.log(`\n${warn.join("\n")}\n`);
}
if (vtc) {
  const r = await probeAgent("vtc", "VTC_URL", vtc, origins);
  rows.push(...r.rows);
  console.log(`vtc-service ${r.version ?? "unknown"}: ${cmpVersion(r.version, p.vti.vtc.version)} (${p.vti.vtc.version})`);
}
console.log(`\nchecked ${new Date().toISOString()}\n${table(rows)}`);
if (!env("VTA_DID") && vta) console.log("\nnote: VTA_DID is not set; copy it from the portal.");
process.exit(rows.some((r) => r.ok === false) ? 1 : 0);
