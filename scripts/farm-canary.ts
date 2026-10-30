// Go/no-go canary for MODE=farm. Run it against ONE throwaway agent you created in the portal
// (docs/FARM.md "Canary") with its VTA_URL / VTA_DID in .env.farm:
//
//   ENV_FILE=.env.farm npm run farm:canary      (ENV_FILE defaults to .env.farm here)
//
// It runs the same three steps a participant would, each in its own process, and prints a
// pass/fail summary plus a verdict: farm:check (read-only GETs), vta:provision (creates a
// context and an app identity over the Trust Task API, as the Admin DID) and hello (a signed
// round trip). Creating the agent in the portal is manual (passkey); this script cannot do it.
// It writes only to ENV_FILE and .vta/, like a participant's own run.
import { spawnSync } from "node:child_process";
import { req, vtaMismatchWarning } from "./farm-lib.js";
import { farmImageTag, pins } from "./pins.js";

const envFile = (process.env.ENV_FILE ??= ".env.farm"); // before env.ts is imported
const { loadTable, resolveFarmAgent } = await import("./farm-config.js");
const childEnv = { ...process.env, ENV_FILE: envFile, MODE: "farm" };

const steps: { name: string; script: string; why: string }[] = [
  { name: "farm:check", script: "farm:check", why: "agent unreachable, wrong URL, CORS/door missing, or version far from the pin" },
  { name: "provision", script: "vta:provision", why: "the Admin DID was not imported, or the VTA does not serve the task versions this kit sends (unsupportedVersion/Type)" },
  { name: "hello", script: "hello", why: "the signed round trip failed (auth or app-identity problem)" },
];

console.log(`farm canary, ${new Date().toISOString()}, ENV_FILE=${envFile}\n`);

// Version gate: which VTA release did the portal actually deploy? (read-only GET)
const pin = pins();
// FARM=ic3|firstperson picks the farm; FARM_AGENT=<name> derives VTA_URL/VTA_DID (explicit ones win).
const sel = await resolveFarmAgent();
console.log(`farm ${sel.id} (${sel.farm.name}${sel.farm.preferred ? ", preferred" : ""})`);
if (sel.farm.issues.length) console.log(`KNOWN ISSUE: ${sel.farm.issues.join(" ")}`);
for (const n of sel.notes) console.log(n);
const vtaUrl = process.env.VTA_URL?.replace(/\/+$/, "");
let deployed: string | undefined;
if (vtaUrl) {
  try { deployed = JSON.parse((await req("GET", `${vtaUrl}/openapi.json`)).text)?.info?.version; } catch { /* unreadable */ }
}
const versionWarning = vtaMismatchWarning(deployed, pin.vti.vta.version, farmImageTag(pin));
if (versionWarning.length) console.log(`${versionWarning.join("\n")}\n`);
else console.log(`deployed vta-service ${deployed} equals the pin.\n`);
const results: { name: string; ok: boolean; why: string; code: number | null }[] = [];
for (const s of steps) {
  console.log(`--- ${s.name} ---`);
  const r = spawnSync("npm", ["run", "--silent", s.script], { stdio: "inherit", env: childEnv });
  const ok = r.status === 0;
  results.push({ name: s.name, ok, why: s.why, code: r.status });
  if (!ok) break; // later steps depend on earlier ones
}
const skipped = steps.slice(results.length).map((s) => s.name);

console.log("\n=== canary summary ===");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  (exit ${r.code}; likely: ${r.why})`}`);
for (const n of skipped) console.log(`SKIP  ${n}`);
if (versionWarning.length) { console.log(""); console.log(versionWarning.join("\n")); }
const pass = results.length === steps.length && results.every((r) => r.ok);
if (pass) {
  console.log("\nVERDICT: GO. The Farm path worked end to end just now. Repeat on the day of the event; keep local mode as the fallback.");
} else {
  const others = Object.keys(loadTable().farms).filter((k) => k !== sel.id);
  console.log(`\nVERDICT: NO-GO for farm "${sel.id}". Order of preference: ic3, then firstperson, then local mode.`);
  if (others.length) console.log(`Try the other farm: ${others.map((k) => `FARM=${k}`).join(" or ")} with an agent created there (docs/FARM.md).`);
  console.log("If no farm passes, SWITCH TO LOCAL MODE for everyone (MODE=local, `npm run vta:up`, README prerequisites).");
  console.log("If the agent could not be created at all (portal step failed), that is also NO-GO: record the portal's error text for the operators.");
}
process.exit(pass ? 0 : 1);
