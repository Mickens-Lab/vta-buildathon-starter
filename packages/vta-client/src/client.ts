// Trust Task client for a VTA: POST signed envelopes to {baseUrl}/trust-tasks.
// Plain fetch plus @openvtc/trust-tasks-proof, so it works in Node and browsers.
import { signTrustTask } from "@openvtc/trust-tasks-proof";
import {
  decodeCredential,
  identityFromCredential,
  type CredentialBundle,
  type Identity,
} from "./identity.js";

export const TT = "https://trusttasks.org/spec";
export const TASK = {
  discovery: `${TT}/trust-task-discovery/0.1`,
  challenge: `${TT}/auth/challenge/0.1`,
  authenticate: `${TT}/auth/authenticate/0.3`,
  whoami: `${TT}/auth/whoami/0.1`,
  contextsCreate: `${TT}/vta/contexts/create/1.0`,
  contextsList: `${TT}/vta/contexts/list/1.0`,
  aclGrant: `${TT}/acl/grant/0.1`,
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
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.bearer !== false && this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await this.fetchImpl(`${this.baseUrl}/trust-tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify(doc),
    });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new TrustTaskError(res.status, text);
    }
    if (!res.ok || String(body?.type ?? "").includes("trust-task-error")) {
      throw new TrustTaskError(res.status, body);
    }
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
