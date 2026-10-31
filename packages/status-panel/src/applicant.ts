// "Applicant and messaging" card for the status panel: which identity applies to the community in this mode, whether the
// mediator's DID (and the applicant's) fits the resolver's 1000-byte limit, and whether the mediator's did:webvh resolves at
// its tunnel host. Pure (no DOM, no network) so it is unit-tested; the panel does the one fetch and passes the result in.
//
// The applicant rule is the one in scripts/lib/applicant.ts and templates/community-dashboard/src/delivery.ts (applicantChoice):
// MODE=tunnel -> a did:peer:2 whose TSPTransport service names the stack's mediator, unless VTC_APPLICANT=did:key, or there is no
// mediator DID, or the did:peer:2 would be over 1000 bytes (then the did:key, with the reason). local and farm -> the did:key.
// This package does not depend on tsp-client: the host page passes what it knows (PanelOptions.applicant). docs/MESSAGING.md.
import { didDocFromLog } from "./parse.ts";

export type ApplicantKind = "did:key" | "did:peer";
export type ApplicantPill = "ok" | "warn" | "bad" | "unknown" | "info";
export interface ApplicantRow { pill: ApplicantPill; label: string; value: string; note?: string; fix?: string }
type Mode = "local" | "tunnel" | "farm";

/** What the host page knows about the applicant. A programmatic panel option, not a setting. */
export interface ApplicantInfo {
  kind: ApplicantKind;
  /** The applicant DID, when the page built it. */
  did?: string;
  /** Set when MODE=tunnel wanted the did:peer:2 but fell back to the did:key: why. */
  why?: string;
  /** The stack's mediator DID (.vta/tunnel.json); null when there is none. */
  mediatorDid?: string | null;
  /** Who applies with this identity, when it is not this page (e.g. "`npm run vtc:join` and the community dashboard"). */
  appliesAs?: string;
}

/**
 * The largest DID the affinidi DID resolver parses (`DIDCacheClient`, `max_did_size_in_bytes`, default 1000). The mediator and
 * the VTC both use it and refuse a longer DID before parsing it, without saying why. Same value as tsp-client's MAX_DID_BYTES.
 */
export const MAX_DID_BYTES = 1000;
/** From this size on a DID is reported as near the limit. */
export const NEAR_DID_BYTES = 900;

/** UTF-8 byte length (what the resolver counts), not string length. */
export const didBytes = (did: string): number => new TextEncoder().encode(did).length;

/**
 * The applicant rule without the size check (that needs tsp-client): for a page that does not build the did:peer itself.
 * `fits` (e.g. tsp-client's didPeerFits) adds the size check when the host has it.
 */
export function applicantRule(mode: Mode, override: ApplicantKind | "" | undefined, mediatorDid: string | null | undefined, fits?: (mediatorDid: string) => boolean): { kind: ApplicantKind; why?: string } {
  if (mode !== "tunnel" || override === "did:key") return { kind: "did:key" };
  if (!mediatorDid) return { kind: "did:key", why: ".vta/tunnel.json has no mediator DID (is the tunnel stack up?)" };
  if (fits && !fits(mediatorDid)) return { kind: "did:key", why: `a did:peer:2 naming this mediator would exceed the ${MAX_DID_BYTES}-byte DID limit` };
  return { kind: "did:peer" };
}

const LIMIT_NOTE = `The affinidi DID resolver the mediator and the VTC use (\`DIDCacheClient\`, \`max_did_size_in_bytes\`, default ${MAX_DID_BYTES}) refuses a longer DID before parsing it, and says nothing useful when it does (docs/MESSAGING.md).`;

/** "Mediator DID size" / "Applicant DID size": bytes against the resolver's limit. */
export function didSizeRow(label: string, did: string, extra?: string): ApplicantRow {
  const n = didBytes(did);
  const note = extra ? `${LIMIT_NOTE} ${extra}` : LIMIT_NOTE;
  if (n > MAX_DID_BYTES) return { pill: "bad", label, value: `${n} bytes: over the ${MAX_DID_BYTES}-byte limit`, note, fix: "The tunnel mediator mints a short did:webvh (about 105 bytes); `npm run down` then `npm run up -- --tunnel` gives a fresh one." };
  if (n >= NEAR_DID_BYTES) return { pill: "warn", label, value: `${n} of ${MAX_DID_BYTES} bytes: near the limit`, note };
  return { pill: "ok", label, value: `${n} of ${MAX_DID_BYTES} bytes`, note };
}

/**
 * Where a did:webvh's log lives: `did:webvh:<scid>:<host>[:<path>...]` -> `https://<host>/.well-known/did.jsonl`, or
 * `https://<host>/<path>/did.jsonl` with a path. The host may carry a percent-encoded port (`example.test%3A8443`).
 * undefined for anything that is not a well-formed did:webvh.
 */
export function webvhLocation(did: string): { host: string; url: string } | undefined {
  const m = /^did:webvh:([A-Za-z0-9]+):([^:#?/]+)((?::[^:#?/]+)*)$/.exec(did.split(/[#?]/)[0]);
  if (!m) return undefined;
  let host: string;
  let path: string[];
  try {
    host = decodeURIComponent(m[2]).toLowerCase();
    path = m[3] ? m[3].slice(1).split(":").map((s) => decodeURIComponent(s)) : [];
  } catch { return undefined; }
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(host)) return undefined;
  if (path.some((s) => !s || s === "." || s === ".." || /[/\\?#]/.test(s))) return undefined;
  const tail = path.length ? `/${path.map(encodeURIComponent).join("/")}/did.jsonl` : "/.well-known/did.jsonl";
  return { host, url: `https://${host}${tail}` };
}

/** Does a did.jsonl body's last log entry name `did`? */
export function logNames(body: string, did: string): { ok: boolean; id?: string; error?: string } {
  try {
    const { id } = didDocFromLog(body);
    return { ok: id === did, id };
  } catch (e) { return { ok: false, error: String((e as Error)?.message ?? e) }; }
}

/** The browser fetch of the mediator's did.jsonl (the panel's probe() result). */
export interface LogProbe { ok: boolean; status?: number; body?: string; error?: string; corsBlocked?: boolean }

export const RESOLVES_LABEL = "Mediator did:webvh resolves at its tunnel host";

/** The resolve row for a tunnel-mode mediator DID, given what the browser's fetch of its did.jsonl returned. */
export function resolveRow(mediatorDid: string, probe: LogProbe | undefined, origin: string): ApplicantRow {
  const label = RESOLVES_LABEL;
  const loc = webvhLocation(mediatorDid);
  if (!loc) {
    return { pill: "info", label, value: "not checked: the mediator DID is not a did:webvh", note: mediatorDid.startsWith("did:webvh:") ? "It starts with did:webvh but has no host this panel can read." : "Only a did:webvh is resolved through a host; this one is not, so there is nothing to fetch." };
  }
  const nodeCheck = "`npm run tunnel:probe` checks it from Node.";
  if (!probe) return { pill: "unknown", label, value: "not checked", note: `Would read ${loc.url}. ${nodeCheck}` };
  if (probe.ok) {
    const r = logNames(probe.body ?? "", mediatorDid);
    if (r.ok) return { pill: "ok", label, value: `yes: ${loc.host} serves its log`, note: `The last entry of ${loc.url} names this DID (read by this page). Resolvers (VTA, VTC, clients) fetch the same file.` };
    return r.id
      ? { pill: "bad", label, value: "no: the log at its host names a different DID", note: `${loc.url} names ${r.id}. The mediator's volume is stale or the tunnel host moved.`, fix: "Run `npm run tunnel:probe`; to start clean, `npm run down` then `npm run up -- --tunnel`." }
      : { pill: "bad", label, value: "no: the host answered, but not with a did:webvh log", note: `${loc.url}: ${r.error ?? "unreadable"}.`, fix: "Run `npm run tunnel:probe` and check `docker compose logs mediator`." };
  }
  if (probe.status) {
    return { pill: "bad", label, value: `no: HTTP ${probe.status} from its host`, note: `${loc.url} answered HTTP ${probe.status}, so resolvers cannot read the mediator's DID.`, fix: "Run `npm run tunnel:probe` and check `docker compose logs mediator`; is the tunnel up (`npm run doctor`)?" };
  }
  if (probe.corsBlocked) {
    return { pill: "info", label, value: "the host answers but this page cannot read it (CORS)", note: `${loc.host} is up, but the mediator does not allow this page's origin (${origin}), so the browser hides the body. This is a browser limit, not a fault of the stack. ${nodeCheck}`,
      fix: `Optional, only if you want this page to read it (pages that talk to the mediator, like templates/tsp-ping, need it): start the stack with \`MEDIATOR_CORS_ALLOW_ORIGIN=${origin}\` (docs/MODES.md).` };
  }
  return { pill: "bad", label, value: "no answer from its host", note: `Nothing answered at ${loc.url} (${probe.error ?? "no answer"}). Quick-tunnel hosts change every run and die at \`npm run down\`.`, fix: `${nodeCheck} If the tunnel is gone, \`npm run down\` then \`npm run up -- --tunnel\`.` };
}

export interface ApplicantCardInput {
  mode: Mode;
  /** From PanelOptions.applicant; undefined when the host page passed nothing. */
  applicant?: ApplicantInfo;
  /** The mediator the VTA's DID document advertises (fallback when the host passes no mediatorDid). */
  advertisedMediator?: string;
  /** The browser's fetch of the mediator's did.jsonl (tunnel mode, did:webvh only). */
  probe?: LogProbe;
  origin: string;
}

/** The mediator DID the card checks: the host's (.vta/tunnel.json) first, else the one the VTA advertises. Tunnel mode only. */
export function cardMediator(i: Pick<ApplicantCardInput, "mode" | "applicant" | "advertisedMediator">): string | undefined {
  if (i.mode !== "tunnel") return undefined;
  return i.applicant?.mediatorDid || i.advertisedMediator || undefined;
}

const KEY_TUNNEL = "Its DID names no mediator, so the VTC pushes the credential to it over TSP only after it spoke TSP to the VTC (`npm run tsp:listen` does that first), otherwise over DIDComm.";

function applicantRow(i: ApplicantCardInput): ApplicantRow {
  const a = i.applicant;
  const label = "Applicant";
  const who = a?.appliesAs ? ` Who applies with it: ${a.appliesAs}.` : "";
  const didNote = a?.did ? ` DID: \`${a.did}\`.` : "";
  if (!a) return { pill: "unknown", label, value: "not reported by this page", note: `The rule: tunnel mode applies as a did:peer:2 naming the mediator (unless VTC_APPLICANT=did:key); local and farm as the did:key (docs/MESSAGING.md).` };
  if (i.mode !== "tunnel") {
    return { pill: "info", label, value: "did:key", note: `No mediator to name: MODE=${i.mode} has no messaging stack here, so the credential is not pushed (the admin's decide response carries it).${who}${didNote}` };
  }
  if (a.kind === "did:peer") {
    const size = a.did ? "" : " Its size is not checked by this page; `npm run vtc:join` refuses one over 1000 bytes and says why.";
    return { pill: "ok", label, value: "did:peer:2 naming the stack's mediator", note: `Its TSPTransport service names the mediator, so the VTC can push the credential over TSP with no earlier contact. This panel does not watch delivery: \`npm run tsp:listen\` shows the frames.${size}${who}${didNote}` };
  }
  if (a.why) return { pill: "warn", label, value: "did:key (fallback from did:peer:2)", note: `Tunnel mode wanted the did:peer:2. Why not: ${a.why.trim().replace(/\.$/, "")}. ${KEY_TUNNEL}${who}${didNote}`, fix: a.mediatorDid ? undefined : "Start the tunnel stack (`npm run up -- --tunnel`) and restart the dev server." };
  return { pill: "info", label, value: "did:key (VTC_APPLICANT=did:key)", note: `Kept by the override in .env. ${KEY_TUNNEL}${who}${didNote}` };
}

/** All rows of the "Applicant and messaging" card. The card is advisory: it never moves the overall status. */
export function applicantCardRows(i: ApplicantCardInput): ApplicantRow[] {
  const rows: ApplicantRow[] = [];
  if (i.mode === "local") {
    rows.push({ pill: "info", label: "Messaging", value: "off: local mode has no mediator", note: "Nothing is fetched for this card. `npm run up -- --tunnel` adds a mediator (docs/MODES.md)." });
    rows.push(applicantRow(i));
    return rows;
  }
  rows.push(applicantRow(i));
  if (i.mode === "farm") {
    rows.push({ pill: "info", label: "Mediator", value: "not checked", note: "Farm mode: this kit runs no mediator here, and a hosted one is not checked by this panel." });
    return rows;
  }
  if (i.applicant?.did && i.applicant.kind === "did:peer") rows.push(didSizeRow("Applicant DID size", i.applicant.did, "A did:peer:2 carries the mediator's whole DID inside it."));
  const med = cardMediator(i);
  if (!med) {
    rows.push({ pill: "warn", label: "Mediator DID", value: "unknown", note: "No mediator DID from .vta/tunnel.json, and the VTA's DID document names none.", fix: "Is the tunnel stack up? `npm run up -- --tunnel`, then restart the dev server." });
    return rows;
  }
  const source = i.applicant?.mediatorDid ? "From .vta/tunnel.json (the running stack)." : "Advertised in the VTA's DID document (the page passed no mediator DID).";
  const differs = i.applicant?.mediatorDid && i.advertisedMediator && i.advertisedMediator !== i.applicant.mediatorDid ? ` The VTA's DID document names a different mediator (${i.advertisedMediator}).` : "";
  rows.push({ pill: differs ? "warn" : "info", label: "Mediator DID", value: `\`${med}\``, note: source + differs });
  rows.push(didSizeRow("Mediator DID size", med, "A did:peer:2 applicant carries this whole DID inside its own (base64url-encoded), so the applicant is larger still."));
  rows.push(resolveRow(med, i.probe, i.origin));
  return rows;
}
