// Read-only probes of a VTA Farm host. GET, HEAD and OPTIONS only: no Trust Task,
// no POST, no credentials. Shared by farm-probe.ts and farm-check.ts.
export const WALLET_EXTENSION_ORIGIN = "chrome-extension://dbjgfkjlgfamanmbiihldgncpjeknphl"; // vtafarm-api internal/setup/templates.go

export interface Res { status: number | string; headers: Headers | undefined; text: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
/** Pace requests so a probe never hammers the Farm. */
export const PACE_MS = Number(process.env.FARM_PACE_MS ?? 2000);

export async function req(method: "GET" | "HEAD" | "OPTIONS", url: string, headers: Record<string, string> = {}): Promise<Res> {
  const wait = last + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    const r = await fetch(url, { method, headers, signal: AbortSignal.timeout(15_000) });
    return { status: r.status, headers: r.headers, text: method === "GET" ? await r.text() : "" };
  } catch (e) {
    return { status: String((e as any)?.cause?.code ?? (e as Error).message), headers: undefined, text: "" };
  }
}

const j = (t: string): any => { try { return JSON.parse(t); } catch { return undefined; } };
const strip = (u: string) => u.replace(/\/+$/, "");

export interface Row { host: string; kind: string; check: string; result: string; ok: boolean | null }

/** CORS: what a browser at `origin` would be told for a POST to the Trust Task door. */
async function cors(base: string, path: string, origin: string): Promise<string> {
  const r = await req("OPTIONS", base + path, {
    origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type",
  });
  if (!r.headers) return `error ${r.status}`;
  const allow = r.headers.get("access-control-allow-origin");
  return `HTTP ${r.status}, allow-origin ${allow ?? "(none: browser blocks)"}`;
}

/** Probe one agent. `kind` selects the paths (a VTC mounts under /v1). */
export async function probeAgent(kind: "vta" | "vtc", name: string, url: string, origins: string[]): Promise<{ rows: Row[]; version?: string }> {
  const base = strip(url), mount = kind === "vtc" ? "/v1" : "";
  const rows: Row[] = [];
  const add = (check: string, result: string, ok: boolean | null) => rows.push({ host: name, kind, check, result, ok });
  let version: string | undefined;

  const h = await req("GET", base + "/health");
  const hb = j(h.text);
  add("GET /health", `HTTP ${h.status}${hb?.version ? `, version ${hb.version}` : ""}${hb?.status ? `, status ${hb.status}` : ""}`, h.status === 200);
  version = hb?.version;
  if (hb?.vtc_did) add("health vtc_did", hb.vtc_did, null);

  // A VTA's /health has no version; its OpenAPI document's info.version is the service version.
  const o = await req("GET", base + "/openapi.json");
  const ob = j(o.text);
  if (ob?.info?.version) {
    version ??= ob.info.version;
    add("GET /openapi.json", `HTTP ${o.status}, info.version ${ob.info.version}, ${o.text.length} bytes`, true);
  } else add("GET /openapi.json", `HTTP ${o.status} (no version)`, null);

  const d = await req("GET", base + "/.well-known/did.jsonl");
  add("GET /.well-known/did.jsonl", `HTTP ${d.status}${d.status === 404 ? " (DID log is on the DID host)" : ""}`, d.status === 200 ? true : null);

  if (kind === "vtc") {
    const p = await req("GET", base + "/v1/community/public-profile");
    const pb = j(p.text);
    add("GET /v1/community/public-profile", p.status === 200 && pb ? `HTTP 200, "${pb.name}", mediator ${pb.mediatorDid ?? "-"}` : `HTTP ${p.status}`, p.status === 200);
  }

  // The Trust Task door. HEAD must not run it: 405 means "path exists, POST only"; 404 means no door.
  const door = `${mount}/trust-tasks`;
  const t = await req("HEAD", base + door);
  add(`HEAD ${door}`, `HTTP ${t.status}${t.status === 405 ? " (exists, POST only)" : ""}`, t.status === 405 || t.status === 200);
  for (const origin of origins) add(`OPTIONS ${door} Origin ${origin}`, await cors(base, door, origin), null);
  return { rows, version };
}

export async function probeDidHost(name: string, url: string): Promise<Row[]> {
  const r = await req("GET", strip(url) + "/api/health");
  const b = j(r.text);
  return [{ host: name, kind: "did-host", check: "GET /api/health", result: `HTTP ${r.status}${b?.version ? `, ${b.service ?? "service"} ${b.version}` : ""}`, ok: r.status === 200 }];
}

export async function probeWeb(name: string, url: string): Promise<Row[]> {
  const r = await req("GET", url);
  const lm = r.headers?.get("last-modified");
  return [{ host: name, kind: "web", check: "GET /", result: `HTTP ${r.status}${lm ? `, last-modified ${lm}` : ""}`, ok: r.status === 200 }];
}

export function table(rows: Row[]): string {
  const cols = ["host", "check", "result"] as const;
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (r: Record<string, string>) => cols.map((c, i) => r[c].padEnd(w[i])).join("  ");
  return [line({ host: "host", check: "check", result: "result" }), w.map((n) => "-".repeat(n)).join("  "),
    ...rows.map((r) => `${r.ok === false ? "FAIL " : ""}${line(r as any)}`)].join("\n");
}

/** Compare an observed version with the pin. Same major.minor is compatible; newer or older is flagged. */
export function cmpVersion(observed: string | undefined, pin: string): string {
  if (!observed) return "unknown";
  const a = observed.split(".").map(Number), b = pin.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? "NEWER than pin" : "OLDER than pin";
  return "equals pin";
}

/**
 * The loud warning when a deployed Farm VTA is not the release this kit is pinned to.
 * Returns lines to print (empty when the version equals the pin). `imageTag` is what a
 * participant must choose in the portal's image selector.
 */
export function vtaMismatchWarning(observed: string | undefined, pin: string, imageTag: string): string[] {
  if (observed === pin) return [];
  const bar = "!".repeat(72);
  return [
    bar,
    `WARNING: this VTA reports vta-service ${observed ?? "unknown (could not read /openapi.json)"}, but this kit is pinned to ${pin}.`,
    `In the Farm portal's image selector pick the VTA image "${imageTag}" when creating the agent.`,
    `Do NOT keep the portal's default image (it was 0.56.0, which this kit is not expected to work with:`,
    "it predates the Trust Task versions this kit sends). If this agent already exists, delete it and create a new one",
    `with "${imageTag}". See docs/FARM.md.`,
    bar,
  ];
}
