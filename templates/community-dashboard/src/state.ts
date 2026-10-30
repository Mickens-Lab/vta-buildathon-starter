// Pure state detection for the dashboard. No network, no DOM: it only interprets what the signed
// calls returned. There is NO session here: a plain member cannot `auth/authenticate`, so every
// fact comes from a signed Trust Task answered by the VTC (see docs/VTC-SURFACE.md).
//
// Which facts are VERIFIED and which are INFERRED:
//  - verified (seen live against a local VTC): `status` answers notFound with no request, `pending`
//    after applying, `approved` once admitted, `withdrawn` after withdrawing; a member-only read
//    (community profile) succeeds for a member and is refused for an applicant or a stranger.
//  - inferred (read from the spec / source, not observed): `rejected`, `deferred`, a "needs more
//    information" status, and "left". The VTC's status values are the community's own set, so an
//    unrecognised value falls through to `other`, shown as a generic "status: X" screen.
//    "Left" is inferred from either (a) `approved` but the member-only read is refused, or
//    (b) `notFound` after this browser remembers having applied. A different browser holding the
//    same key cannot tell "left" from "never applied": it will see the visitor screen.

/** What one signed call returned, reduced to what state detection needs. */
export type Probe<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; status?: number; code?: string; message?: string; network?: boolean };

export interface StatusValue { status: string; requestId?: string; [k: string]: unknown }

export interface Evidence {
  /** Result of `join-requests/status` for the signer's latest request. */
  status: Probe<StatusValue>;
  /** Result of a member-only read (community profile). Only needed, and only consulted, when status is `approved`. */
  memberRead?: Probe;
  /** This browser remembers an earlier request from this identity (to tell "left" from "never applied"). */
  hadRequest?: boolean;
}

export type StepId = "visit" | "apply" | "review" | "member";

export type DashState =
  | { kind: "visitor" }
  | { kind: "pending"; requestId?: string; status: string; deferred: boolean }
  | { kind: "needs-info"; requestId?: string; status: string }
  | { kind: "member"; requestId?: string }
  | { kind: "withdrawn"; requestId?: string }
  | { kind: "rejected"; requestId?: string }
  | { kind: "left"; inferredFrom: "approved-but-not-member" | "request-gone" }
  | { kind: "other"; status: string; requestId?: string }
  | { kind: "error"; message: string; code?: string; httpStatus?: number };

/** A signer with no ACL entry shares one per-address budget (burst 10, then one call per 5 s): a visitor, an applicant, someone who left. */
export const RATE_LIMITED = "The community is rate-limiting this page (visitors and people who are not members get a short burst, then one call every 5 seconds). Wait a few seconds, then press Refresh status.";

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

export function isNotFound(p: Probe): boolean {
  return !p.ok && !p.network && (/notfound/i.test(p.code ?? "") || p.status === 404);
}

/** A refusal that says "you are not (or no longer) a member", as opposed to the VTC being broken or unreachable. */
export function isNotMember(p: Probe): boolean {
  if (p.ok || p.network) return false;
  if (p.status === 401 || p.status === 403) return true;
  return /notmember|permissiondenied|forbidden|noentry|notpermitted|unauthori[sz]ed/i.test(p.code ?? "") ||
    /holds no entry|not a member|not permitted/i.test(p.message ?? "");
}

export function deriveState(ev: Evidence): DashState {
  const s = ev.status;
  if (!s.ok) {
    if (isNotFound(s)) return ev.hadRequest ? { kind: "left", inferredFrom: "request-gone" } : { kind: "visitor" };
    if (s.network) return { kind: "error", message: s.message ?? "The community did not answer.", code: "network" };
    return { kind: "error", message: s.status === 429 ? RATE_LIMITED : s.message ?? "The community refused the status check.", code: s.code, httpStatus: s.status };
  }
  const raw = typeof s.value?.status === "string" ? s.value.status : "";
  const requestId = typeof s.value?.requestId === "string" ? s.value.requestId : undefined;
  if (!raw) return { kind: "other", status: "(none)", requestId };
  const k = norm(raw);
  if (k === "pending" || k === "submitted" || k === "inreview" || k === "received") return { kind: "pending", requestId, status: raw, deferred: false };
  if (k === "deferred") return { kind: "pending", requestId, status: raw, deferred: true }; // inferred: still open, decision postponed
  if (k === "withdrawn") return { kind: "withdrawn", requestId };
  if (k === "rejected" || k === "denied" || k === "declined") return { kind: "rejected", requestId }; // inferred
  if (/needs?(more)?info|awaiting|evidence|supplement/.test(k)) return { kind: "needs-info", requestId, status: raw }; // inferred
  if (k === "approved" || k === "admitted" || k === "accepted") {
    const m = ev.memberRead;
    if (!m) return { kind: "error", message: "Your request is approved but the member check was not run." };
    if (m.ok) return { kind: "member", requestId };
    if (isNotMember(m)) return { kind: "left", inferredFrom: "approved-but-not-member" }; // inferred
    return { kind: "error", message: !m.network && m.status === 429 ? RATE_LIMITED : m.message ?? "Could not confirm membership.", code: m.network ? "network" : m.code, httpStatus: m.network ? undefined : m.status };
  }
  return { kind: "other", status: raw, requestId };
}

/** Whether `deriveState` needs the member-only read for this status (so the caller can skip the extra call). */
export function needsMemberRead(status: Probe<StatusValue>): boolean {
  return status.ok && ["approved", "admitted", "accepted"].includes(norm(String(status.value?.status ?? "")));
}

/** Which step of Visit -> Apply -> In review -> Member to highlight. */
export function journeyStep(s: DashState): StepId {
  switch (s.kind) {
    case "visitor": case "withdrawn": case "rejected": case "left": return "apply";
    case "pending": case "needs-info": case "other": return "review";
    case "member": return "member";
    case "error": return "visit";
  }
}

/** True when the state came from an inferred (not live-verified) status: the UI labels these. */
export function isInferred(s: DashState): boolean {
  return s.kind === "rejected" || s.kind === "needs-info" || s.kind === "left" || s.kind === "other" || (s.kind === "pending" && s.deferred);
}
