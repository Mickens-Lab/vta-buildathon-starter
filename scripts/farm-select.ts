// Pure helpers: which Farm (FARM=ic3|firstperson), and what URLs follow from an agent name.
// No I/O, so vite.config.ts and the unit tests can import it. The mediator DID is never
// hardcoded: it is read from the agent's DID log (see mediatorFromLog).
export interface FarmEntry {
  name: string; preferred: boolean; domain: string; portalUrl: string; apiUrl: string; didHostUrl: string;
  restUrlTemplate: string; issues: string[];
}
export interface FarmTable { defaultFarm: string; farms: Record<string, FarmEntry>; web: { name: string; url: string }[]; origins: string[] }

const strip = (u: string) => u.replace(/\/+$/, "");

/** The selected farm id: FARM, else the table default. Throws on an unknown id. */
export function farmId(t: FarmTable, selected?: string): string {
  const id = (selected ?? "").trim().toLowerCase() || t.defaultFarm;
  if (!t.farms[id]) throw new Error(`FARM must be one of ${Object.keys(t.farms).join(", ")}; got "${id}".`);
  return id;
}

/** Agent names are DNS labels. */
export function checkAgentName(name: string): string {
  const n = name.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n)) throw new Error(`agent name "${name}" must be a DNS label: lowercase letters, digits, hyphens.`);
  return n;
}

/** `https://vta-<name>.<domain>` for an agent name. */
export function restUrl(f: FarmEntry, agent: string): string {
  return strip(f.restUrlTemplate.replace("<name>", checkAgentName(agent)));
}
/** Where the farm's DID host publishes the agent's log: `<didhost>/<name>-vta/did.jsonl`. */
export function didLogUrl(f: FarmEntry, agent: string): string {
  return `${strip(f.didHostUrl)}/${checkAgentName(agent)}-vta/did.jsonl`;
}
/** The DID of the newest entry of a did:webvh log (`state.id` of the last line), or undefined. */
export function didFromLog(text: string): string | undefined {
  const last = text.trim().split("\n").filter(Boolean).pop();
  try { const id = JSON.parse(last ?? "")?.state?.id; return typeof id === "string" ? id : undefined; } catch { return undefined; }
}
/** The mediator DID named by the log's TSPTransport service endpoint, or undefined. */
export function mediatorFromLog(text: string): string | undefined {
  const last = text.trim().split("\n").filter(Boolean).pop();
  try {
    const svc = (JSON.parse(last ?? "")?.state?.service ?? []).find((s: any) => s?.type === "TSPTransport");
    return typeof svc?.serviceEndpoint === "string" ? svc.serviceEndpoint : undefined;
  } catch { return undefined; }
}
/** Explicit VTA_URL wins; else derive from FARM_AGENT; else undefined. */
export function agentUrl(f: FarmEntry, explicit: string | undefined, agent: string | undefined): string | undefined {
  if (explicit) return strip(explicit);
  return agent ? restUrl(f, agent) : undefined;
}
