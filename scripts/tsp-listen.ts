// Listen on the mediator socket as the app did:key and log every TSP frame that reaches it: `npm run tsp:listen [-- --peer <did>] [--seconds 90]`.
// Default peer is the VTC (VTC_DID). Used for the credential-push experiment in docs/MESSAGING.md: start this, then in another
// shell run `npm run vtc:join` and `npm run vtc:approve`, and see whether `credential-exchange/issue/0.1` arrives. Read-only.
import { connectTsp } from "@buildathon/tsp-client";
import { decodeCredential, seedFromMultibase } from "@buildathon/vta-client";
import { readTunnel } from "./lib/compose.js";
import { env } from "./env.js";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const state = readTunnel();
const cred = env("VTA_CREDENTIAL");
// The VTC's DID: --peer, VTC_DID, or the did:webvh its public host serves.
async function vtcDid(): Promise<string | undefined> {
  const url = env("VTC_URL");
  if (!url) return undefined;
  try { return /"id":"(did:webvh:[^"#]+)"/.exec(await (await fetch(`${url}/.well-known/did.jsonl`)).text())?.[1]; } catch { return undefined; }
}
const peer = arg("peer") ?? env("VTC_DID") ?? (await vtcDid());
if (!state?.mediatorDid || !cred || !peer) {
  console.error("tsp:listen needs a MODE=tunnel stack with a VTC (MODE=tunnel npm run up) and a provisioned app (.env).");
  process.exit(1);
}
const seconds = Number(arg("seconds") ?? 90);
const c = await connectTsp({ vtaDid: peer, mediatorDid: state.mediatorDid, seed: seedFromMultibase(decodeCredential(cred).privateKeyMultibase), log: (l) => console.log(`  ${l}`) });
c.conn.onInboundTsp(async (bytes) => {
  try {
    const m = await c.session.open(bytes);
    if (m.control) { console.log(`frame from the peer: relationship ${m.control.controlType}`); return; }
    const text = new TextDecoder().decode(m.payload);
    const doc = (JSON.parse(text) as { document?: { type?: string } }).document;
    console.log(`frame from the peer: ${doc?.type ?? "(no document type)"}`);
  } catch (e) {
    console.log(`frame (${bytes.length} bytes) that is not from the peer or not readable: ${(e as Error).message}`);
  }
});
await c.session.relate(5000).then(() => console.log("relationship accepted by the peer"), (e) => console.log(`no accept from the peer: ${(e as Error).message}`));
console.log(`listening for ${seconds} s as ${c.did} ...`);
await new Promise((r) => setTimeout(r, seconds * 1000));
c.close();
console.log("done");
process.exit(0);
