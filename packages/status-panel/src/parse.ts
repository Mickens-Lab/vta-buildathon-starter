// Pure helpers behind the status panel. No DOM, no network: easy to unit test.

export interface DidService { id: string; type: string; endpoints: string[]; kind: "rest" | "didcomm" | "tsp" | "mediator" | "other" }

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Endpoint strings from a service's serviceEndpoint (string, object with uri/accept, or an array of either). */
function endpointStrings(se: unknown): string[] {
  const out: string[] = [];
  for (const e of asArray(se as unknown)) {
    if (typeof e === "string") out.push(e);
    else if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      if (typeof o.uri === "string") out.push(o.uri);
      else if (typeof o.url === "string") out.push(o.url);
      else out.push(JSON.stringify(o));
    }
  }
  return out;
}

export function classifyService(type: string, id: string): DidService["kind"] {
  const t = `${type} ${id}`.toLowerCase();
  if (t.includes("mediator")) return "mediator";
  if (t.includes("didcomm")) return "didcomm";
  if (t.includes("tsp")) return "tsp";
  if (t.includes("rest") || t.includes("vtarest")) return "rest";
  return "other";
}

/** Service entries of a DID document (or a did:webvh log entry's `state`). */
export function parseDidDocServices(doc: unknown): DidService[] {
  const d = doc as { service?: unknown } | null;
  const out: DidService[] = [];
  for (const s of asArray(d?.service as unknown[])) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const type = asArray(o.type as string | string[]).join(", ") || "unknown";
    const id = typeof o.id === "string" ? o.id : "";
    out.push({ id, type, endpoints: endpointStrings(o.serviceEndpoint), kind: classifyService(type, id) });
  }
  return out;
}

/** The mediator DID, if a DIDComm service routes through one (`routingKeys`, `accept`, or a did: endpoint uri). */
export function mediatorDid(doc: unknown): string | undefined {
  const d = doc as { service?: unknown } | null;
  for (const s of asArray(d?.service as unknown[])) {
    const o = (s ?? {}) as Record<string, unknown>;
    for (const e of asArray(o.serviceEndpoint as unknown)) {
      const uri = typeof e === "string" ? e : (e as { uri?: unknown } | null)?.uri;
      if (typeof uri === "string" && uri.startsWith("did:")) return uri.split("#")[0];
      for (const k of asArray((e as { routingKeys?: string[] } | null)?.routingKeys)) if (typeof k === "string" && k.startsWith("did:")) return k.split("#")[0];
    }
    for (const k of asArray(o.routingKeys as string[])) if (typeof k === "string" && k.startsWith("did:")) return k.split("#")[0];
    if (/mediator/i.test(String(o.type ?? ""))) for (const e of endpointStrings(o.serviceEndpoint)) if (e.startsWith("did:")) return e;
  }
  return undefined;
}

/** The DID document out of a did.jsonl body (last log entry's `state`). */
export function didDocFromLog(text: string): { id: string; doc: Record<string, unknown> } {
  const lines = text.trim().split("\n").filter(Boolean);
  const state = JSON.parse(lines[lines.length - 1])?.state;
  if (!state || typeof state.id !== "string") throw new Error("did.jsonl has no state.id");
  return { id: state.id, doc: state };
}

// --- versions -------------------------------------------------------------

export type VersionVerdict = "match" | "older" | "newer" | "different" | "unknown";

const parseVer = (v: string): [number, number, number] | undefined => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
};

/** Compare the version a VTA reports with the version this kit is pinned to. */
export function compareVersions(observed: string | undefined | null, pinned: string): VersionVerdict {
  if (!observed) return "unknown";
  if (observed.trim().replace(/^v/, "") === pinned.replace(/^v/, "")) return "match";
  const a = parseVer(observed);
  const b = parseVer(pinned);
  if (!a || !b) return "different";
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? "older" : "newer";
  return "different"; // same numbers, differing suffix (e.g. a pre-release)
}

/** vta-service version from an OpenAPI document (`info.version`). */
export function versionFromOpenApi(doc: unknown): string | undefined {
  const v = (doc as { info?: { version?: unknown } } | null)?.info?.version;
  return typeof v === "string" && v ? v : undefined;
}

// --- Trust Task discovery ---------------------------------------------------

export interface TaskType { uri: string; family: string; name: string; version: string }

/** `https://trusttasks.org/spec/acl/grant/0.2` -> {family: acl, name: acl/grant, version: 0.2}. Null for anything else. */
export function parseTaskType(uri: string): TaskType | null {
  const m = /\/spec\/(.+)\/(\d+(?:\.\d+)*)\/?$/.exec(uri);
  if (!m) return null;
  const name = m[1];
  return { uri, family: name.split("/")[0], name, version: m[2] };
}

export interface TaskGroup { family: string; count: number; names: string[]; types: TaskType[] }

/** Group discovery results by task family; unparseable entries land in `other`. Sorted by family. */
export function groupTasks(uris: string[]): TaskGroup[] {
  const by = new Map<string, TaskGroup>();
  for (const uri of uris) {
    const t = parseTaskType(uri) ?? { uri, family: "other", name: uri, version: "" };
    let g = by.get(t.family);
    if (!g) by.set(t.family, (g = { family: t.family, count: 0, names: [], types: [] }));
    g.count++;
    g.types.push(t);
    if (!g.names.includes(t.name)) g.names.push(t.name);
  }
  return [...by.values()].sort((a, b) => (a.family === "other" ? 1 : b.family === "other" ? -1 : a.family.localeCompare(b.family)));
}

/** Versions of one task name the VTA lists, e.g. versionsOf(uris, "acl/grant") -> ["0.1","0.2"]. */
export function versionsOf(uris: string[], name: string): string[] {
  return uris
    .map(parseTaskType)
    .filter((t): t is TaskType => !!t && t.name === name)
    .map((t) => t.version)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface CompatHint { label: string; ok: boolean | undefined; text: string }

/**
 * Hints relative to what this kit's clients send: acl/grant 0.1 (vta-client default) or 0.2 (the Farm's
 * DID host insists on it), and the discovery task itself. `undefined` ok = could not be determined.
 */
export function compatHints(uris: string[] | undefined): CompatHint[] {
  if (!uris) return [{ label: "Compatibility", ok: undefined, text: "Capabilities not loaded, so compatibility cannot be checked." }];
  const grant = versionsOf(uris, "acl/grant");
  const disc = versionsOf(uris, "trust-task-discovery");
  const has = (a: string[], v: string) => a.includes(v);
  return [
    {
      label: "acl/grant",
      ok: grant.length > 0,
      text: grant.length
        ? `Lists acl/grant ${grant.join(", ")}. This kit's client sends ${has(grant, "0.1") ? "0.1 (supported)" : "0.1 (NOT listed: grant calls will fail)"}; ${has(grant, "0.2") ? "0.2 is also listed" : "0.2 is not listed"}.`
        : "acl/grant is not listed: this app cannot grant access on this VTA.",
    },
    {
      label: "trust-task-discovery",
      ok: has(disc, "0.1") || disc.length > 0,
      text: disc.length ? `Discovery versions listed: ${disc.join(", ")}. This kit's client calls 0.1${has(disc, "0.1") ? " (supported)" : " (NOT listed)"}.` : "Discovery version not listed in the result (the call itself worked).",
    },
  ];
}

// --- misc -------------------------------------------------------------------

/** "in 12 min" / "expired 3 min ago" for an ISO timestamp, relative to `now`. */
export function relativeTime(iso: string | undefined, now = Date.now()): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  const txt = abs < 90 ? `${abs} s` : abs < 5400 ? `${Math.round(abs / 60)} min` : `${Math.round(abs / 3600)} h`;
  return s >= 0 ? `in ${txt}` : `expired ${txt} ago`;
}

/** Short form of a long DID for display: did:webvh:Qm1234…:host. */
export function shortDid(did: string, max = 48): string {
  if (did.length <= max) return did;
  const head = did.slice(0, 22);
  return `${head}…${did.slice(-(max - 23))}`;
}
