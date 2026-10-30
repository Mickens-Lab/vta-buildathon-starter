// Loads the farm table and resolves the selected farm and agent for the farm:* scripts.
import { readFileSync } from "node:fs";
import { env } from "./env.js";
import { agentUrl, didFromLog, didLogUrl, farmId, type FarmEntry, type FarmTable } from "./farm-select.js";
import { req } from "./farm-lib.js";

export const HOSTS_FILE = process.env.FARM_HOSTS ?? new URL("./farm-hosts.json", import.meta.url).pathname;
export const loadTable = (): FarmTable => JSON.parse(readFileSync(HOSTS_FILE, "utf8"));

/** The selected farm (FARM in the environment or the env file; default from the table). */
export function selectedFarm(t: FarmTable = loadTable()): { id: string; farm: FarmEntry } {
  const id = farmId(t, env("FARM"));
  return { id, farm: t.farms[id] };
}

/**
 * Fill VTA_URL / VTA_DID into process.env from FARM_AGENT when they are not given.
 * Explicit VTA_URL / VTA_DID (environment or env file) always win. The DID is read from
 * the agent's DID log on the farm's DID host (GET only); if unreadable it stays unset.
 */
export async function resolveFarmAgent(): Promise<{ id: string; farm: FarmEntry; agent?: string; notes: string[] }> {
  const { id, farm } = selectedFarm();
  const agent = env("FARM_AGENT")?.trim() || undefined;
  const notes: string[] = [];
  const url = agentUrl(farm, env("VTA_URL"), agent);
  if (url && !env("VTA_URL")) { process.env.VTA_URL = url; notes.push(`VTA_URL=${url} (from FARM=${id} FARM_AGENT=${agent})`); }
  if (agent && !env("VTA_DID")) {
    const r = await req("GET", didLogUrl(farm, agent));
    const did = r.status === 200 ? didFromLog(r.text) : undefined;
    if (did) { process.env.VTA_DID = did; notes.push(`VTA_DID=${did} (from ${didLogUrl(farm, agent)})`); }
    else notes.push(`VTA_DID not set: could not read ${didLogUrl(farm, agent)} (HTTP ${r.status}); copy it from the portal.`);
  }
  return { id, farm, agent, notes };
}
