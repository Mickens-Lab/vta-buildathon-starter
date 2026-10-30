// A minimal TSP client session over the mediator socket: relationship invite, then routed Trust Task documents
// in the TSP binding envelope. Wire format: @openvtc/vti-tsp-js. Login, DID resolution and the socket: @openvtc/pnm-core.
import { pack, packInvite, packRouted, unpack, type PackKeys } from "@openvtc/vti-tsp-js";
import type { MediatorConnection, TspRemoteEndpoint } from "@openvtc/pnm-core";

/** The envelope type the VTA's TSP binding expects; a bare Trust Task document is refused. */
export const TSP_BINDING_TYPE = "https://trusttasks.org/binding/tsp/0.1/envelope";

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export interface TspKeys {
  vid: string;
  /** Ed25519 private key (signs the outer frame). */
  signingKey: Uint8Array;
  /** X25519 private key (opens frames sealed to us). */
  decryptionKey: Uint8Array;
}

export function wrapEnvelope(document: unknown, type = TSP_BINDING_TYPE): Uint8Array {
  return utf8.encode(JSON.stringify({ type, document }));
}

export function openEnvelope(payload: Uint8Array, type = TSP_BINDING_TYPE): Record<string, unknown> {
  const env = JSON.parse(fromUtf8.decode(payload)) as { type?: unknown; document?: unknown };
  if (env.type !== type) throw new Error(`TSP payload is not a ${type} envelope (got ${JSON.stringify(env.type)})`);
  if (!env.document || typeof env.document !== "object") throw new Error("TSP envelope carries no document");
  return env.document as Record<string, unknown>;
}

export class TspSession {
  constructor(
    private readonly conn: Pick<MediatorConnection, "sendBinary" | "awaitTspFrame">,
    private readonly me: TspKeys,
    private readonly mediator: TspRemoteEndpoint,
    private readonly peer: TspRemoteEndpoint,
    private readonly log: (line: string) => void = () => {},
  ) {}

  private packKeys(to: TspRemoteEndpoint): PackKeys {
    return { senderSigningKey: this.me.signingKey, receiverEncryptionKey: to.encryptionPublicKey };
  }

  /** Seal `inner` (already sealed to the peer) to the mediator with the peer as the remaining hop. */
  private async viaMediator(inner: Uint8Array): Promise<Uint8Array> {
    const keys = this.packKeys(this.mediator);
    return (await packRouted(inner, [this.peer.vid], this.me.vid, this.mediator.vid, keys)).bytes;
  }

  /** Open an inbound frame: it must be sealed to us and proven to come from the peer. */
  async open(bytes: Uint8Array) {
    const m = await unpack(bytes, { receiverDecryptionKey: this.me.decryptionKey, senderSigningKey: this.peer.signingPublicKey });
    if (m.sender !== this.peer.vid) throw new Error(`sealed by ${m.sender}, not the peer`);
    return m;
  }

  /** §7.2.2: the peer drops application messages from a VID it has no relationship with, so invite first. */
  async relate(timeoutMs: number): Promise<void> {
    const invite = await packInvite(this.me.vid, this.peer.vid, this.packKeys(this.peer), { route: [this.mediator.vid, this.me.vid] });
    const wait = this.conn.awaitTspFrame(timeoutMs, async (b) => {
      try {
        const m = await this.open(b);
        return m.control?.controlType === "accept" && eq(m.control.inReplyTo, invite.threadDigest);
      } catch (e) {
        this.log(`(frame not the accept: ${(e as Error).message})`);
        return false;
      }
    });
    this.conn.sendBinary(await this.viaMediator(invite.bytes));
    try {
      await wait;
    } catch (e) {
      throw new Error(`no relationship accept from the peer within ${timeoutMs} ms (${(e as Error).message})`);
    }
  }

  /** Send a Trust Task document in the binding envelope and return the correlated reply document. */
  async request(doc: { id: string }, timeoutMs: number, correlates: (reply: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
    const inner = await pack(wrapEnvelope(doc), this.me.vid, this.peer.vid, this.packKeys(this.peer));
    let found: Record<string, unknown> | undefined;
    const wait = this.conn.awaitTspFrame(timeoutMs, async (b) => {
      try {
        const m = await this.open(b);
        if (m.control) return false;
        const reply = openEnvelope(m.payload);
        if (!correlates(reply)) return false;
        found = reply;
        return true;
      } catch (e) {
        this.log(`(frame not the reply: ${(e as Error).message})`);
        return false;
      }
    });
    this.conn.sendBinary(await this.viaMediator(inner.bytes));
    await wait;
    if (!found) throw new Error("reply resolved with no document");
    return found;
  }
}

function eq(a: Uint8Array | undefined, b: Uint8Array): boolean {
  return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
}
