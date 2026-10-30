// TSP ping: a throwaway did:key logs in to the mediator, resolves the VTA's DID, and sends a signed
// messaging/ping/0.1 Trust Task to the VTA over TSP; the VTA's sealed answer is the "pong".
// Built on @openvtc/pnm-core (mediator login, DID -> TSP keys, TspChannel) and @openvtc/vti-tsp-js (the wire format).
import {
  Identity, asTaskSigner, buildTrustTask, connectMediatorSession, didcommKeyAgreementFromSigning, generateSigningIdentity, resolveVtaTspEndpoint, signingIdentityFromSecret, signOutboundTask,
  type MediatorConnection, type WebSocketCtor,
} from "@openvtc/pnm-core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { TspSession } from "./session.js";

export const PING_TYPE = "https://trusttasks.org/spec/messaging/ping/0.1";
export const PING_RESPONSE_TYPE = `${PING_TYPE}#response`;

export interface PingOptions {
  /** The VTA's DID (did:webvh at its tunnel host). */
  vtaDid: string;
  /** The mediator's DID (did:peer:2, in .vta/tunnel.json). */
  mediatorDid: string;
  /**
   * Ed25519 seed of the did:key to log in as. Omit for a throwaway did:key. The VTA only answers DIDs on its ACL,
   * so use the app identity from VTA_CREDENTIAL (the starter's `application` DID) unless you grant the throwaway.
   */
  seed?: Uint8Array;
  /** Reply timeout in ms (default 20000). */
  timeoutMs?: number;
  /** Allow ws:// and http:// mediator endpoints (never needed for the https tunnel). */
  allowInsecure?: boolean;
  /** WebSocket constructor; defaults to the global one (Node 22+ and browsers). */
  webSocketImpl?: WebSocketCtor;
  /** Progress callback, one line per step. */
  log?: (line: string) => void;
}

export interface PingResult {
  /** The throwaway client DID that logged in. */
  clientDid: string;
  nonce: string;
  /** The VTA's pong payload (serverTime, status, protocols, nonce echo). */
  pong: PongPayload;
  elapsedMs: number;
}

export interface PongPayload {
  serverTime?: string;
  status?: string;
  protocols?: string[];
  nonce?: string;
  [k: string]: unknown;
}

/** True only for a genuine pong: the nonce we sent comes back and the status is ok or degraded. */
export function isPong(p: unknown, nonce: string): p is PongPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as PongPayload;
  return o.nonce === nonce && (o.status === "ok" || o.status === "degraded");
}

/** One line a human can read from a pong. */
export function describePong(r: PingResult): string {
  const p = r.pong;
  return `pong from the VTA in ${r.elapsedMs} ms: status ${p.status}, protocols [${(p.protocols ?? []).join(", ")}], nonce echoed, server time ${p.serverTime}`;
}

export interface TspClient {
  /** The did:key that logged in. */
  did: string;
  conn: MediatorConnection;
  session: TspSession;
  signing: ReturnType<typeof generateSigningIdentity>;
  close(): void;
}

/** Log in to the mediator as a did:key, open the socket and resolve the peer and the mediator to TSP keys. */
export async function connectTsp(opts: Pick<PingOptions, "vtaDid" | "mediatorDid" | "seed" | "allowInsecure" | "webSocketImpl" | "log">): Promise<TspClient> {
  const log = opts.log ?? (() => {});
  const signing = opts.seed ? signingIdentityFromSecret(opts.seed) : generateSigningIdentity();
  const ka = didcommKeyAgreementFromSigning(signing);
  const holder = Identity.fromSecretJwk({ did: signing.did, kid: ka.keyAgreementKid, jwk: ka.secretJwk });
  log(`client DID (did:key): ${signing.did}`);
  log("logging in to the mediator and opening the socket");
  const conn = await connectMediatorSession({
    holder, mediatorDid: opts.mediatorDid, vtaDid: opts.vtaDid,
    ...(opts.allowInsecure ? { allowInsecure: true } : {}),
    ...(opts.webSocketImpl ? { webSocketImpl: opts.webSocketImpl } : {}),
  });
  try {
    log("resolving the peer DID to its TSP keys");
    const peer = await resolveVtaTspEndpoint(opts.vtaDid);
    log("resolving the mediator DID to its TSP keys");
    const mediator = await resolveVtaTspEndpoint(opts.mediatorDid);
    const session = new TspSession(conn, { vid: signing.did, signingKey: signing.privateKey, decryptionKey: ed25519.utils.toMontgomerySecret(signing.privateKey) }, mediator, peer, log);
    return { did: signing.did, conn, session, signing, close: () => { conn.close(); holder.dispose(); } };
  } catch (e) {
    conn.close();
    holder.dispose();
    throw e;
  }
}

export async function tspPing(opts: PingOptions): Promise<PingResult> {
  const log = opts.log ?? (() => {});
  const t0 = Date.now();
  const c = await connectTsp(opts);
  try {
    const timeoutMs = opts.timeoutMs ?? 20_000;
    log("TSP relationship invite (waiting for the accept)");
    await c.session.relate(4000).catch((e) => log(`no accept seen, continuing: ${(e as Error).message}`));
    const nonce = crypto.randomUUID();
    const envelope = buildTrustTask(PING_TYPE, { nonce }, { issuer: c.did, recipient: opts.vtaDid });
    await signOutboundTask(envelope, asTaskSigner(c.signing)); // the VTA refuses an unproven document (ProofRequired)
    log("sending messaging/ping/0.1 over TSP");
    const reply = await c.session.request(envelope, timeoutMs, (d) => d.threadId === envelope.id);
    const pong = reply.payload as PongPayload;
    if (!isPong(pong, nonce)) throw new Error(`the reply was not a pong for this ping: ${JSON.stringify(pong)}`);
    return { clientDid: c.did, nonce, pong, elapsedMs: Date.now() - t0 };
  } finally {
    c.close();
  }
}
