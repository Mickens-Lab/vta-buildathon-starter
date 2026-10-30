import { VtaClient, decodeCredential, identityFromCredential } from "@buildathon/vta-client";
import { VtcClient } from "@buildathon/vtc-client";
import { mountStatusPanel } from "@buildathon/status-panel";

// The status panel (packages/status-panel) shows connection, identity, version, session,
// capabilities, wallet and the optional VTC link, live, with a Refresh button.
// To reuse it elsewhere: mountStatusPanel(container, { ...options }) -- see packages/status-panel/README.md.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const credential = import.meta.env.VTA_CREDENTIAL as string | undefined;
const abs = (u: string) => (u.startsWith("/") ? location.origin + u : u);
const vtaUrl = abs(__VTA_BROWSER_URL__);

// Plain fetch to /__vta on this page's own origin: Vite forwards it to the VTA (vite.config.ts), so CORS never applies.
// Farm mode trusts the DID in the credential (a hosted VTA may not serve did.jsonl at its root).
const connect = async () => {
  if (!credential) throw new Error("No VTA_CREDENTIAL");
  const c = await VtaClient.fromCredential(credential, vtaUrl, undefined, { resolveDid: !__FARM__ });
  await c.authenticate();
  return c;
};

// Optional VTC: VTC_URL (and VTC_DID in farm mode) in the repo-root .env. Read-only: the public manifest.
const vtcCfg = __VTC__;
const vtc = vtcCfg
  ? {
      url: abs(vtcCfg.browserUrl),
      displayUrl: vtcCfg.url,
      did: vtcCfg.did,
      // The manifest request is signed, so it needs the app credential; without one only /health is read.
      manifest: !credential ? undefined : async () => {
        if (!credential) throw new Error("no credential");
        const me = identityFromCredential(decodeCredential(credential));
        const c = await VtcClient.connect(abs(vtcCfg.browserUrl), me, undefined, vtcCfg.did);
        return c.manifest();
      },
    }
  : undefined;

mountStatusPanel($("status-panel"), {
  mode: __FARM__ ? "farm" : __TUNNEL__ ? "tunnel" : "local",
  vtaUrl,
  vtaDisplayUrl: __VTA_URL__,
  credentialPresent: !!credential,
  connect,
  pin: __PIN__,
  farm: __FARM_INFO__ ?? undefined,
  keyEmbedded: !!credential,
  keyNoteUrl: "/README.md",
  vtc,
  title: "VTA connection status",
  autoRefreshMs: 0,
});

// Optional: the VTA browser wallet. Feature-detect; the app works without it.
// Inject timing varies, so look once now and once on load.
const show = (v: unknown, err = false) => {
  $("out-box").hidden = false;
  $("out").textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  $("out").className = err ? "err" : "";
};
const guard = (fn: () => Promise<unknown>) => async () => {
  try {
    show(await fn());
  } catch (e) {
    show(String(e), true);
  }
};
function detectWallet() {
  const w = window.vtaWallet;
  if (!w) return;
  $("wallet-actions").hidden = false;
  $("wallet-profile").onclick = guard(() => w.walletProfile({}));
  $("wallet-sign").onclick = guard(async () => {
    const issuedAt = new Date().toISOString();
    // The wallet's holder DID signs; set recipient before signing (audience binding).
    const envelope = {
      id: crypto.randomUUID(),
      type: "https://example.org/spec/buildathon/note/0.1",
      recipient: (await connect().catch(() => undefined))?.vtaDid ?? "did:web:inbox.buildathon.example",
      issuedAt,
      payload: { title: "from the browser", body: "signed by my wallet" },
    };
    return w.signTrustTask({ envelope });
  });
}
detectWallet();
window.addEventListener("load", detectWallet);

declare global {
  interface Window {
    /** Injected by the VTA browser extension. Minimal local typing: replace
     *  with the extension's own types if you vendor them. */
    vtaWallet?: {
      walletProfile(p: Record<string, unknown>): Promise<{ did: string; entryId: string; bound: boolean }>;
      signTrustTask(p: { envelope: Record<string, unknown>; asDid?: string }): Promise<{
        signedEnvelope: Record<string, unknown>;
        holderDid: string;
      }>;
    };
  }
}
export {};
