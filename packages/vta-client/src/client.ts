// Trust Task client for a VTA: POST signed envelopes to {baseUrl}/trust-tasks.
// Plain fetch plus @openvtc/trust-tasks-proof, so it works in Node and browsers.
import { signTrustTask } from "@openvtc/trust-tasks-proof";
import {
  decodeCredential,
  identityFromCredential,
  type CredentialBundle,
  type Identity,
} from "./identity.js";
import { emitTrace } from "./trace.js";

export const TT = "https://trusttasks.org/spec";
export const TASK = {
  discovery: `${TT}/trust-task-discovery/0.1`,
  challenge: `${TT}/auth/challenge/0.1`,
  authenticate: `${TT}/auth/authenticate/0.3`,
  whoami: `${TT}/auth/whoami/0.1`,
  contextsCreate: `${TT}/vta/contexts/create/1.0`,
  contextsList: `${TT}/vta/contexts/list/1.0`,
  aclGrant: `${TT}/acl/grant/0.1`,
  contextsUpdate: `${TT}/vta/contexts/update/1.0`,
} as const;

export const DEFAULT_URL = "http://localhost:8100";

export class TrustTaskError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Trust Task failed (HTTP ${status}): ${JSON.stringify(body)}`);
  }
}

/** The VTA's DID, read from its self-hosted did:webvh log (last log entry). */
export async function fetchVtaDid(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${baseUrl}/.well-known/did.jsonl`);
  if (!res.ok) throw new Error(`GET /.well-known/did.jsonl -> HTTP ${res.status}`);
  const lines = (await res.text()).trim().split("\n");
  const did = JSON.parse(lines[lines.length - 1])?.state?.id;
  if (typeof did !== "string") throw new Error("did.jsonl has no state.id");
  return did;
}

/** One call the client made, reported to {@link VtaClient.onCall} after it settles. */
export interface CallEvent {
  /** Trust Task type URI. */
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
  /** The payload that was signed. */
  payload: Record<string, unknown>;
  /** The full signed document as POSTed. */
  request?: unknown;
}

export interface Whoami {
  roles?: string[];
  scopes?: string[];
  capabilities?: string[];
  [k: string]: unknown;
}

export class VtaClient {
  token?: string;

  constructor(
    public readonly baseUrl: string,
    public readonly vtaDid: string,
    public readonly me: Identity,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** Resolve the VTA DID, then build a client. Does not authenticate. */
  static async connect(
    baseUrl: string,
    me: Identity,
    fetchImpl: typeof fetch = (...a) => fetch(...a),
    /** A DID you already know (e.g. `VTA_DID` from the VTA Farm portal): skips the
     *  `/.well-known/did.jsonl` fetch. A hosted VTA may publish its log elsewhere. */
    knownDid?: string,
  ) {
    return new VtaClient(baseUrl, knownDid ?? (await fetchVtaDid(baseUrl, fetchImpl)), me, fetchImpl);
  }

  /** From a `VTA_CREDENTIAL` value (base64url bundle). Does not authenticate. */
  static async fromCredential(
    credential: string | CredentialBundle,
    baseUrl?: string,
    fetchImpl?: typeof fetch,
    opts: { resolveDid?: boolean } = {},
  ) {
    const c = typeof credential === "string" ? decodeCredential(credential) : credential;
    const url = baseUrl ?? c.vtaUrl ?? DEFAULT_URL;
    // resolveDid:false trusts the DID recorded in the credential (farm mode).
    const client = await VtaClient.connect(
      url,
      identityFromCredential(c),
      fetchImpl,
      opts.resolveDid === false ? c.vtaDid : undefined,
    );
    if (client.vtaDid !== c.vtaDid) {
      throw new Error(`VTA DID changed (${client.vtaDid}); re-run \`npm run vta:provision\``);
    }
    return client;
  }

  /** Optional observer, called once per call after it settles (success or failure). Errors in it are swallowed. */
  onCall?: (e: CallEvent) => void;

  /** Build, sign and POST one Trust Task; returns the response payload. */
  async call<R = any>(
    type: string,
    payload: Record<string, unknown> = {},
    opts: { bearer?: boolean } = {},
  ): Promise<R> {
    const doc = signTrustTask(
      {
        id: globalThis.crypto.randomUUID(),
        type,
        issuer: this.me.did,
        recipient: this.vtaDid,
        issuedAt: new Date().toISOString(),
        payload,
      } as any,
      this.me.signer,
    );
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const done: CallEvent = { type, issuer: this.me.did, startedAt, durationMs: 0, ok: false, payload, request: doc };
    const report = (e: Partial<CallEvent>) => {
      const ev = { ...done, durationMs: Date.now() - t0, ...e };
      try { this.onCall?.(ev); } catch { /* an observer must never break a call */ }
      emitTrace({ ts: startedAt, source: "vta", transport: "rest", type, id: (doc as any).id, from: this.me.did, to: this.vtaDid, status: ev.status, ok: ev.ok, code: ev.code, ms: ev.durationMs });
    };
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.bearer !== false && this.token) headers.authorization = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/trust-tasks`, { method: "POST", headers, body: JSON.stringify(doc) });
    } catch (e) {
      report({ ok: false, code: "network" });
      throw e;
    }
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      report({ status: res.status, ok: false, code: "unreadable" });
      throw new TrustTaskError(res.status, text);
    }
    if (!res.ok || String(body?.type ?? "").includes("trust-task-error")) {
      report({ status: res.status, ok: false, code: body?.payload?.code });
      throw new TrustTaskError(res.status, body);
    }
    report({ status: res.status, ok: true });
    return body.payload as R;
  }

  /** auth/challenge then auth/authenticate; stores the bearer in `token`. */
  async authenticate(): Promise<string> {
    const ch = await this.call<{ challenge: string; sessionId: string }>(
      TASK.challenge,
      { subject: this.me.did },
      { bearer: false },
    );
    const auth = await this.call<{ tokens: { accessToken: string } }>(
      TASK.authenticate,
      { challenge: ch.challenge, sessionId: ch.sessionId },
      { bearer: false },
    );
    this.token = auth.tokens.accessToken;
    return this.token;
  }

  // --- typed helpers -------------------------------------------------------

  /** Trust Tasks this VTA serves (answers authenticated callers only). */
  async discover(): Promise<string[]> {
    const r = await this.call<{ supportedTypes: unknown[] }>(TASK.discovery, {});
    return r.supportedTypes.map((t) => (typeof t === "string" ? t : JSON.stringify(t)));
  }

  whoami(): Promise<Whoami> {
    return this.call<Whoami>(TASK.whoami, {});
  }

  /** Admin only. Idempotent: an existing context is reported as `false`. */
  async createContext(id: string, name = id): Promise<boolean> {
    return this.idempotent(() => this.call(TASK.contextsCreate, { id, name }));
  }

  /** Admin only. Grants `subject` a role scoped to one context. */
  async grantAcl(subject: string, context: string, role = "application", label = `${context} app`): Promise<boolean> {
    return this.idempotent(() =>
      this.call(TASK.aclGrant, {
        entry: { subject, role, scopes: [context], label },
        reason: "buildathon provisioning",
      }),
    );
  }

  /**
   * Admin only. Grants `subject` an admin entry scoped to one context with the
   * one-time hand-off marker (`ext["org.openvtc.handoff"]`, VTI-ACL-054) and a
   * short expiry. This is what `vtc setup` needs for its ephemeral setup did:key:
   * the VTA refuses the setup DID's one rollover to a long-term admin without it.
   * The marker can only be set when the entry is created.
   */
  async grantHandoff(subject: string, context: string, expiresInMs = 3600_000, label = `${context} setup`): Promise<boolean> {
    return this.idempotent(() =>
      this.call(TASK.aclGrant, {
        entry: {
          subject,
          role: "admin",
          scopes: [context],
          label,
          expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
          ext: { "org.openvtc.handoff": true },
        },
        reason: "VTC setup hand-off",
      }),
    );
  }

  /**
   * Admin only. Gives `subject` a `monitor` entry with no contexts: enough to open a REST session and answer a consent
   * request, not enough to do anything else. Over messaging an approver needs no entry at all; over REST it needs this.
   */
  async grantApprover(subject: string, label = "approver"): Promise<boolean> {
    return this.idempotent(() => this.call(TASK.aclGrant, { entry: { subject, role: "monitor", scopes: [], label }, reason: "approvals demo" }));
  }

  private async idempotent(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof TrustTaskError && /exist|conflict|already/i.test(JSON.stringify(e.body))) return false;
      throw e;
    }
  }
}
