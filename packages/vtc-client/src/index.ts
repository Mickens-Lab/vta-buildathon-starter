// Trust Task client for a VTC. Plain fetch plus @openvtc/trust-tasks-proof, so
// it works in Node and browsers.
//
// Wire facts (from vtc-service and vtc-client in verifiable-trust-infrastructure):
//  - Every Trust Task is a signed document POSTed to `{vtc}/v1/trust-tasks`
//    (the VTA's door is `/trust-tasks`, with no /v1).
//  - The document's `recipient` is the VTC's own DID, read from
//    `{vtc}/.well-known/did.jsonl`. A document for another community is refused.
//  - A signed document is its own authentication. The VTC reads the signer's
//    ACL/member entry for authority; there is no bearer on this route.
//  - An applicant is not a member yet, so it cannot `authenticate`. It reads
//    the manifest (public), submits, and polls status, all as signed documents.
import { signTrustTask } from "@openvtc/trust-tasks-proof";
import { TASK as VTA_TASK, TT, TrustTaskError, emitTrace, fetchVtaDid, siopIdToken, type Identity } from "@buildathon/vta-client";

export { TrustTaskError };

export const VTC_TASK = {
  challenge: VTA_TASK.challenge,
  authenticate: VTA_TASK.authenticate, // VTC serves 0.2 and 0.3
  whoami: VTA_TASK.whoami,
  manifestV04: `${TT}/vtc/join-requests/manifest/0.4`,
  manifestV03: `${TT}/vtc/join-requests/manifest/0.3`,
  joinSubmit: `${TT}/vtc/join-requests/submit/0.3`,
  joinStatus: `${TT}/vtc/join-requests/status/0.1`,
  // Admin verbs: the signer must hold an admin ACL entry at the VTC.
  // list moved 0.1 -> 0.2 in vtc-service 0.14.0 (0.2 filters before paging and fills totalEstimate);
  // the 0.1 types are kept only as a fallback for a VTC older than 0.14.
  membersList: `${TT}/vtc/members/list/0.2`,
  joinList: `${TT}/vtc/join-requests/list/0.2`,
  membersListV01: `${TT}/vtc/members/list/0.1`,
  joinListV01: `${TT}/vtc/join-requests/list/0.1`,
  joinDecide: `${TT}/vtc/join-requests/decide/0.1`,
  // Applicant/member tasks: authority is the signer's own request or membership, no session.
  joinWithdraw: `${TT}/vtc/join-requests/withdraw/0.1`,
  joinSupplement: `${TT}/vtc/join-requests/supplement/0.1`,
  membersRenew: `${TT}/vtc/members/renew/0.1`,
  membersSelfRemove: `${TT}/vtc/members/self-remove/0.1`,
  // The member's own MembershipCredential sent back to the community (the reciprocal half). It is what sets
  // `credentialsDelivered` in the join status; see `sendMembershipCredential`.
  membersVmc: `${TT}/vtc/members/vmc/0.1`,
  // Community reads: any signer the community holds an entry for (applicants are refused, see docs/VTC-SURFACE.md).
  profileShow: `${TT}/vtc/community/profile/show/0.1`,
  brandingShow: `${TT}/vtc/community/branding/show/0.1`,
  themeShow: `${TT}/vtc/community/theme/show/0.1`,
  joinDiscoveryShow: `${TT}/vtc/community/join-discovery/show/0.1`,
  requestedAttributesShow: `${TT}/vtc/community/requested-attributes/show/0.1`,
  ceremoniesList: `${TT}/vtc/ceremonies/list/0.1`,
  // Member directory.
  directoryDisclosure: `${TT}/vtc/directory/disclosure/0.1`,
  directoryFieldsList: `${TT}/vtc/directory/fields/list/0.1`,
  directoryEntriesList: `${TT}/vtc/directory/entries/list/0.2`,
  directoryEntriesShow: `${TT}/vtc/directory/entries/show/0.1`,
  directoryQuery: `${TT}/vtc/directory/query/0.1`,
  directoryCardShow: `${TT}/vtc/directory/card/show/0.1`,
  directoryCardUpdate: `${TT}/vtc/directory/card/update/0.1`,
  directoryCardPublic: `${TT}/vtc/directory/card/public/0.1`,
  // Groups.
  groupsList: `${TT}/vtc/groups/list/0.2`,
  groupsShow: `${TT}/vtc/groups/show/0.1`,
  groupsJoin: `${TT}/vtc/groups/join/0.1`,
  groupsLeave: `${TT}/vtc/groups/leave/0.1`,
  groupsMembersList: `${TT}/vtc/groups/members/list/0.2`,
  // Trust graph (VRC edges).
  relationshipsList: `${TT}/vtc/relationships/list/0.3`,
  // Rooms offered to the member.
  roomsOffersList: `${TT}/vtc/rooms/offers/list/0.4`,
  roomsMembershipsList: `${TT}/vtc/rooms/memberships/list/0.1`,
} as const;

export const DEFAULT_VTC_URL = "http://localhost:8200";

export interface JoinCriterion {
  id: string;
  /** Pass this as `criterion` when submitting. */
  requirementsDigest: string;
  /** `automatic` admits on submit; `review` queues for an administrator. */
  admission: string;
  description?: string;
  invitationRequired?: boolean;
  presentationDefinition?: unknown;
  credentialIssuers?: unknown;
  vetting?: unknown;
  [k: string]: unknown;
}

export interface JoinManifest {
  communityDid: string;
  criteria: JoinCriterion[];
  requestedAttributes?: { type: string; required?: boolean; [k: string]: unknown }[];
  branding?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface JoinStatus {
  requestId: string;
  /** e.g. pending, approved, rejected; the exact set is the community's. */
  status: string;
  [k: string]: unknown;
}

/**
 * The first criterion an app with an empty VP can meet: no invitation, no required
 * credentials, no vetting. (A fresh VTC lists `invited` and `member-credential`
 * before `review`, so taking criteria[0] would submit against one it cannot satisfy.)
 */
export function pickCriterion(m: JoinManifest): JoinCriterion | undefined {
  return m.criteria.find((c) => !c.invitationRequired && !c.presentationDefinition && !c.vetting);
}

/** Page options shared by the paged reads. */
export interface PageOpts {
  [k: string]: unknown;
  cursor?: string;
  limit?: number;
}

/**
 * One call the client made, reported to {@link VtcClient.onCall} after it settles. Optional, for tools that
 * show or log traffic (the community dashboard's "Under the hood" panel). Nothing in it is a secret:
 * `request` is the signed document exactly as sent (a signature, never a key).
 */
export interface CallEvent {
  /** Trust Task type URI, or `GET <path>` / `POST <path>` for the member-portal REST calls (those carry no signed document). */
  type: string;
  /** Who signed (the client's own DID). */
  issuer: string;
  startedAt: string;
  durationMs: number;
  /** HTTP status; absent when the request never got a response (network error). */
  status?: number;
  ok: boolean;
  /** The refusal code from the error document, or `network` when nothing answered. */
  code?: string;
  /** The payload that was signed (empty object for REST calls). */
  payload: Record<string, unknown>;
  /** The full signed document as POSTed. Absent for REST calls. */
  request?: unknown;
}

/** The refusal code carried by an error body, e.g. `...:notFound`, or undefined. */
export function refusalCode(body: unknown): string | undefined {
  const c = (body as any)?.payload?.code ?? (body as any)?.code;
  return typeof c === "string" ? c : undefined;
}

// --- the member's own membership credential (vtc/members/vmc/0.1) ------------------------------
//
// Wire facts (vtc-service at the pinned VTC): the payload is `{ vc, requestId? }`. The VTC refuses a `vc` whose `issuer` is not
// the proof signer, whose `credentialSubject.id` is not the community's DID (`subjectMismatch`), that is not a DTG
// MembershipCredential under the v2 + DTG contexts declaring an `issuerScope`, that has no top-level `id`, or whose
// eddsa-jcs-2022 proof does not verify for assertionMethod (`invalidCredential`); a signer with no active member row gets
// `notAMember`. Re-sending the same `id` is a no-op; a different `id` replaces the stored one. With no
// `credentialSubject.digestMultibase` the VTC stores it UNBOUND to the grant it issued: `credentialsDelivered` turns true, but
// the membership pair stays incomplete.

/** The two `@context` entries a DTG credential carries, in this order. */
export const DTG_CONTEXTS = ["https://www.w3.org/ns/credentials/v2", "https://registry.trustoverip.org/dtg/context/v1"] as const;

export interface MemberVmcOpts {
  /** The member, who issues and signs it. */
  memberDid: string;
  /** The community's DID: the credential's subject. */
  communityDid: string;
  /** `urn:uuid:...`; a fresh one by default. The VTC's idempotency key. */
  id?: string;
  validFrom?: Date;
  issuerScope?: "pairwise" | "directed" | "public";
}

/** RFC 3339, UTC, no fraction when it is all zeros (the form the Rust side writes). */
const rfc3339 = (d: Date) => d.toISOString().replace(/\.000Z$/, "Z");

/** The member's MembershipCredential naming the community, unsigned and with no digest (so unbound to the community's grant). */
export function memberVmc(o: MemberVmcOpts): Record<string, unknown> {
  return {
    "@context": [...DTG_CONTEXTS],
    type: ["VerifiableCredential", "DTGCredential", "MembershipCredential"],
    id: o.id ?? `urn:uuid:${globalThis.crypto.randomUUID()}`,
    issuer: o.memberDid,
    issuerScope: o.issuerScope ?? "directed",
    validFrom: rfc3339(o.validFrom ?? new Date()),
    credentialSubject: { id: o.communityDid },
  };
}

/** Sign a credential as `signer` (eddsa-jcs-2022, assertionMethod): the same proof the client puts on every Trust Task. */
export function signCredential(vc: Record<string, unknown>, signer: Identity["signer"]): Record<string, unknown> {
  return signTrustTask(vc as any, signer) as unknown as Record<string, unknown>;
}

/** The VTC's answer to `vtc/members/vmc/0.1`. `status` is `"stored"` on success. */
export interface MemberVmcReceipt {
  memberDid: string;
  vmcId: string;
  status: string;
  /** Echoed only when the submission named an approved join request. */
  requestId?: string;
}

/** The member portal's session (`/v1/member/*`), see {@link VtcClient.portalSignIn}. */
export interface PortalSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

/** `GET /v1/member/me`: the one identity proof a member can get from the VTC. */
export interface PortalMe {
  did: string;
  sessionId: string;
  accessExpiresAt: number;
  amr: string[];
  joinedAt: string;
  role: string;
  personhood: boolean;
  canManagePasskeys: boolean;
  community: { name: string | null; logoUrl: string | null; did: string | null };
}

export class VtcClient {
  /** `{baseUrl}/v1` by default. Override `mount` if the community moved its API mount. */
  readonly apiBase: string;
  token?: string;
  /** Optional observer, called once per call after it settles (success or failure). Must not throw; errors in it are swallowed. */
  onCall?: (e: CallEvent) => void;

  constructor(
    public readonly baseUrl: string,
    public readonly vtcDid: string,
    public readonly me: Identity,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    mount = "/v1",
  ) {
    this.apiBase = baseUrl.replace(/\/+$/, "") + mount;
  }

  /** Resolve the VTC's DID from its self-hosted did:webvh log, or use `knownDid`
   *  (e.g. `VTC_DID` from the VTA Farm portal). Does not authenticate. */
  static async connect(
    baseUrl: string,
    me: Identity,
    fetchImpl: typeof fetch = (...a) => fetch(...a),
    knownDid?: string,
  ) {
    const base = baseUrl.replace(/\/+$/, "");
    return new VtcClient(base, knownDid ?? (await fetchVtaDid(base, fetchImpl)), me, fetchImpl);
  }

  private report(e: CallEvent) {
    try { this.onCall?.(e); } catch { /* an observer must never break a call */ }
    const req = e.request as { id?: string; recipient?: string } | undefined;
    emitTrace({ ts: e.startedAt, source: "vtc", transport: "rest", type: e.type, id: req?.id, from: e.issuer, to: req?.recipient ?? this.vtcDid, status: e.status, ok: e.ok, code: e.code, ms: e.durationMs });
  }

  /** Build, sign and POST one Trust Task document; returns the response payload. */
  async call<R = any>(type: string, payload: Record<string, unknown> = {}): Promise<R> {
    const doc = signTrustTask(
      {
        id: globalThis.crypto.randomUUID(),
        type,
        issuer: this.me.did,
        recipient: this.vtcDid,
        issuedAt: new Date().toISOString(),
        payload,
      } as any,
      this.me.signer,
    );
    const startedAt = new Date();
    const t0 = Date.now();
    const base = { type, issuer: this.me.did, startedAt: startedAt.toISOString(), payload, request: doc };
    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(`${this.apiBase}/trust-tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      text = await res.text();
    } catch (e) {
      this.report({ ...base, durationMs: Date.now() - t0, ok: false, code: "network" });
      throw e;
    }
    const done = { ...base, durationMs: Date.now() - t0, status: res.status };
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      this.report({ ...done, ok: false, code: "unreadable" });
      throw new TrustTaskError(res.status, text);
    }
    if (!res.ok || String(body?.type ?? "").includes("trust-task-error")) {
      this.report({ ...done, ok: false, code: refusalCode(body) });
      throw new TrustTaskError(res.status, body);
    }
    this.report({ ...done, ok: true });
    return body.payload as R;
  }

  // --- applicant side (works before you are a member) ----------------------

  /** The community's join criteria. Public read. Tries manifest 0.4, then 0.3. */
  async manifest(): Promise<JoinManifest> {
    try {
      return await this.call<JoinManifest>(VTC_TASK.manifestV04, {});
    } catch (e) {
      if (e instanceof TrustTaskError && /unsupported|version/i.test(JSON.stringify(e.body))) {
        return this.call<JoinManifest>(VTC_TASK.manifestV03, {});
      }
      throw e;
    }
  }

  /**
   * Apply to join as `me`. The VP carries no credentials, which meets a
   * criterion that requires none; a criterion that needs credentials,
   * vetting or an invitation needs a richer `vp` (pass your own).
   * `criterion` is a criterion's `requirementsDigest`; omit it to let the
   * community pick the first criterion the submission meets.
   * Returns `{ requestId, verdict }`.
   */
  submitJoin(
    opts: {
      criterion?: string;
      attributes?: { type: string; value: unknown }[];
      registryConsent?: boolean;
      vp?: Record<string, unknown>;
      extensions?: Record<string, unknown>;
    } = {},
  ): Promise<{ requestId: string; verdict: any }> {
    return this.call(VTC_TASK.joinSubmit, this.joinPayload(opts));
  }

  /** The payload `submitJoin` would sign for these options, without sending anything (for a "preview before you sign" step). */
  joinPayload(opts: Parameters<VtcClient["submitJoin"]>[0] = {}): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      vp: opts.vp ?? { type: "VerifiablePresentation", holder: this.me.did },
      registryConsent: opts.registryConsent ?? false,
    };
    if (opts.criterion) payload.criterion = opts.criterion;
    if (opts.attributes?.length) payload.attributes = opts.attributes;
    if (opts.extensions) payload.extensions = opts.extensions;
    return payload;
  }

  /** Poll one request, or (no id) the signer's own latest request. */
  joinStatus(requestId?: string): Promise<JoinStatus> {
    return this.call<JoinStatus>(VTC_TASK.joinStatus, requestId ? { requestId } : {});
  }

  // --- member side (needs an ACL/member entry at the VTC) ------------------

  /**
   * auth/challenge then auth/authenticate. At the VTC only an ADMINISTRATOR ACL
   * entry gets a session; a member (or applicant) is refused "authentication
   * failed" by design (vtc-service `resolve_auth_role`). The session is bound to
   * `sessionKey` (default: the signer's own did:key), which is what lets
   * `whoami` answer: it identifies the session by the key that signs it.
   */
  async authenticate(sessionKey: string | undefined = this.me.did.startsWith("did:key:z6Mk") ? this.me.did : undefined): Promise<string> {
    const ch = await this.call<{ challenge: string; sessionId: string }>(VTC_TASK.challenge, { subject: this.me.did });
    const auth = await this.call<{ tokens: { accessToken: string } }>(VTC_TASK.authenticate, {
      challenge: ch.challenge,
      sessionId: ch.sessionId,
      ...(sessionKey ? { sessionKey } : {}),
    });
    this.token = auth.tokens.accessToken;
    return this.token;
  }

  whoami(): Promise<Record<string, unknown>> {
    return this.call(VTC_TASK.whoami, {});
  }

  // --- admin side ----------------------------------------------------------

  /** Call the 0.2 list; if the VTC predates it (< 0.14.0), retry once at 0.1. */
  private async listWithFallback<R>(v02: string, v01: string, opts: Record<string, unknown>): Promise<R> {
    try {
      return await this.call<R>(v02, opts);
    } catch (e) {
      if (e instanceof TrustTaskError && /unsupportedVersion|unsupportedType/.test(JSON.stringify(e.body))) {
        return this.call<R>(v01, opts);
      }
      throw e;
    }
  }

  /** Admin only. One page; pass the previous `nextCursor` to continue (absent or null on the last page). */
  listMembers(opts: { role?: string; cursor?: string; limit?: number } = {}) {
    return this.listWithFallback<{ items: any[]; nextCursor?: string | null; totalEstimate?: number }>(VTC_TASK.membersList, VTC_TASK.membersListV01, opts);
  }

  /** Admin only. `status` is pending|deferred|approved|rejected|withdrawn. */
  listJoinRequests(opts: { status?: string; cursor?: string; limit?: number } = {}) {
    return this.listWithFallback<{ items: any[]; nextCursor?: string | null; totalEstimate?: number }>(VTC_TASK.joinList, VTC_TASK.joinListV01, opts);
  }

  /** Admin only. `id` is the request id; approving admits the applicant as a member. */
  decideJoin(id: string, decision: "approved" | "rejected", reason?: string) {
    return this.call(VTC_TASK.joinDecide, { id, decision, ...(reason ? { reason } : {}) });
  }

  // --- applicant: withdraw / supplement (signed; the request's owner is the only authority) ----

  /** Withdraw the signer's open join request (`requestId` optional: the open one). */
  withdrawJoin(opts: { requestId?: string; reason?: string } = {}) {
    return this.call(VTC_TASK.joinWithdraw, { ...(opts.requestId ? { requestId: opts.requestId } : {}), ...(opts.reason ? { reason: opts.reason } : {}) });
  }

  /** Answer the community's request for more evidence on the signer's open request. Same response as `submitJoin`. */
  supplementJoin(opts: { vp: Record<string, unknown>; requestId?: string; extensions?: Record<string, unknown> }) {
    return this.call(VTC_TASK.joinSupplement, { vp: opts.vp, ...(opts.requestId ? { requestId: opts.requestId } : {}), ...(opts.extensions ? { extensions: opts.extensions } : {}) });
  }

  // --- member: own membership ----------------------------------------------------------------

  /** Renew the signer's own membership. Refused for a non-member. */
  renewMembership() {
    return this.call(VTC_TASK.membersRenew, {});
  }

  /**
   * LEAVE the community. Takes effect immediately and an empty payload is enough, so a plain
   * `call()` of this task would remove you: this helper therefore demands `{ confirm: true }`.
   * `disposition` is the spec's (e.g. `tombstone`); omit for the community's default.
   */
  leaveCommunity(opts: { confirm: boolean; disposition?: string }) {
    if (opts.confirm !== true) throw new Error("leaveCommunity removes the signer from the community immediately; pass { confirm: true }");
    return this.call(VTC_TASK.membersSelfRemove, opts.disposition ? { disposition: opts.disposition } : {});
  }

  /**
   * Send the signer's own MembershipCredential back to the community (`vtc/members/vmc/0.1`): built by {@link memberVmc},
   * signed by this client's signer, carried as `{ vc }` (plus `requestId` when given: it must name this member's APPROVED
   * join request, or the whole delivery is refused). It carries no digest, so the VTC stores it unbound to the grant: the
   * join status's `credentialsDelivered` turns true while the membership pair stays incomplete. Plain REST, like every call.
   */
  sendMembershipCredential(opts: { id?: string; validFrom?: Date; requestId?: string } = {}): Promise<MemberVmcReceipt> {
    const vc = signCredential(memberVmc({ memberDid: this.me.did, communityDid: this.vtcDid, id: opts.id, validFrom: opts.validFrom }), this.me.signer);
    return this.call<MemberVmcReceipt>(VTC_TASK.membersVmc, { vc, ...(opts.requestId ? { requestId: opts.requestId } : {}) });
  }

  // --- member: community reads (any signer the community has an entry for) --------------------

  communityProfile() { return this.call(VTC_TASK.profileShow, {}); }
  communityBranding() { return this.call(VTC_TASK.brandingShow, {}); }
  communityTheme() { return this.call(VTC_TASK.themeShow, {}); }
  joinDiscovery() { return this.call(VTC_TASK.joinDiscoveryShow, {}); }
  requestedAttributes() { return this.call(VTC_TASK.requestedAttributesShow, {}); }
  ceremonies() { return this.call(VTC_TASK.ceremoniesList, {}); }

  // --- member: directory ----------------------------------------------------------------------

  /** The directory's disclosure statement (what the community does with cards). */
  directoryDisclosure() { return this.call(VTC_TASK.directoryDisclosure, {}); }
  directoryFields(opts: { includeRetired?: boolean } = {}) { return this.call(VTC_TASK.directoryFieldsList, opts); }
  /** Active member or administrator. Entries are projected for the caller. */
  directoryEntries(opts: PageOpts & { query?: string; filters?: unknown[]; group?: unknown } = {}) { return this.call(VTC_TASK.directoryEntriesList, opts); }
  directoryEntry(opts: { entryId?: string; did?: string }) { return this.call(VTC_TASK.directoryEntriesShow, opts); }
  /** Another member's card as the directory policy projects it for you. `subject` is a DID. */
  directoryQuery(subject: string, fields?: string) { return this.call(VTC_TASK.directoryQuery, { subject, ...(fields ? { fields } : {}) }); }
  /** The signer's own card (members only). */
  myCard() { return this.call(VTC_TASK.directoryCardShow, {}); }
  /** Edit the signer's own card. Pass `expectedRevision` from `myCard()` to avoid a lost update. Fields must exist in `directoryFields()`. */
  updateMyCard(patch: { values?: Record<string, unknown>; visibility?: Record<string, unknown>; discoverability?: Record<string, unknown>; introductions?: unknown; groupAudience?: unknown[] | null; expectedRevision?: number }) {
    return this.call(VTC_TASK.directoryCardUpdate, patch);
  }
  /** A card its member published beyond the community. No proof of membership needed. */
  publicCard(entryId: string) { return this.call(VTC_TASK.directoryCardPublic, { entryId }); }

  // --- member: groups -------------------------------------------------------------------------

  groups(opts: PageOpts & { mine?: boolean; joinable?: boolean } = {}) { return this.call(VTC_TASK.groupsList, opts); }
  group(groupId: string) { return this.call(VTC_TASK.groupsShow, { groupId }); }
  joinGroup(groupId: string, message?: unknown) { return this.call(VTC_TASK.groupsJoin, { groupId, ...(message ? { message } : {}) }); }
  leaveGroup(groupId: string) { return this.call(VTC_TASK.groupsLeave, { groupId }); }
  groupMembers(groupId: string, opts: PageOpts = {}) { return this.call(VTC_TASK.groupsMembersList, { groupId, ...opts }); }

  // --- member: trust graph and rooms ----------------------------------------------------------

  relationships(opts: Record<string, unknown> = {}) { return this.call(VTC_TASK.relationshipsList, opts); }
  roomOffers(opts: Record<string, unknown> = {}) { return this.call(VTC_TASK.roomsOffersList, opts); }
  roomMemberships(opts: Record<string, unknown> = {}) { return this.call(VTC_TASK.roomsMembershipsList, opts); }

  // --- member: the portal session (the only member session there is) -------------------------

  /**
   * Sign in to the member portal with a self-issued SIOPv2 id_token minted by `me`'s own did:key
   * (`/v1/member/wallet/auth/*`, marked deprecated upstream in favour of the wallet `auth/oob/*`
   * flow). Only an ACTIVE member gets a session; the result serves `/v1/member/me` and
   * `/v1/member/passkeys*` and nothing else: it unlocks no Trust Task. Use it as a membership
   * proof (`portalMe`), not as a general session.
   */
  async portalSignIn(): Promise<PortalSession> {
    const post = (path: string, body: unknown) => this.rest("POST", path, { "content-type": "application/json" }, JSON.stringify(body));
    const ch = await post("/member/wallet/auth/challenge", { did: this.me.did });
    const idToken = siopIdToken(this.me, this.vtcDid, ch.challenge);
    const auth = await post("/member/wallet/auth/", {
      type: VTC_TASK.authenticate,
      payload: { id_token: idToken, session_id: ch.sessionId },
    });
    return { accessToken: auth.tokens.accessToken, refreshToken: auth.tokens.refreshToken, expiresAt: auth.session?.expiresAt };
  }

  /** `GET /v1/member/me` with a portal token: did, role, joinedAt, personhood, community. 403 when not an active member. */
  async portalMe(session: PortalSession): Promise<PortalMe> {
    return this.rest("GET", "/member/me", { authorization: `Bearer ${session.accessToken}` }) as Promise<PortalMe>;
  }

  /** One member-portal REST call (no signed document); reports to `onCall` without the bearer or the request body. */
  private async rest(method: string, path: string, headers: Record<string, string>, body?: string): Promise<any> {
    const t0 = Date.now();
    const base = { type: `${method} /v1${path}`, issuer: this.me.did, startedAt: new Date(t0).toISOString(), payload: {} };
    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(this.apiBase + path, { method, headers, ...(body !== undefined ? { body } : {}) });
      text = await res.text();
    } catch (e) {
      this.report({ ...base, durationMs: Date.now() - t0, ok: false, code: "network" });
      throw e;
    }
    const done = { ...base, durationMs: Date.now() - t0, status: res.status };
    let json: any;
    try { json = JSON.parse(text); } catch { this.report({ ...done, ok: false, code: "unreadable" }); throw new TrustTaskError(res.status, text); }
    if (!res.ok) { this.report({ ...done, ok: false, code: refusalCode(json) }); throw new TrustTaskError(res.status, json); }
    this.report({ ...done, ok: true });
    return json;
  }

  /** `portalSignIn` then `portalMe`: "am I an active member right now, and as what?" Throws for a non-member. */
  async memberProof(): Promise<PortalMe> {
    return this.portalMe(await this.portalSignIn());
  }
}
