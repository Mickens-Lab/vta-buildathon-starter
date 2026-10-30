// "Key custody" rows for the status panel: where the app's key lives, which hardening level that is, and the next step.
// Pure (no DOM) so it is unit-tested. Levels are the ones in docs/SECURITY.md; only facts the page can know are asserted.
export type Custody = "page" | "backend" | "webcrypto" | "none" | "unknown";
export type CustodyPill = "ok" | "warn" | "bad" | "unknown" | "info";
export interface CustodyRow { pill: CustodyPill; label: string; value: string; note?: string; fix?: string }
export interface CustodyInput {
  mode: "local" | "tunnel" | "farm";
  /** The page embeds the app key (the kit's dev-only default). */
  keyEmbedded?: boolean;
  credentialPresent: boolean;
  /** Set by an app that moved the key: "backend" (level 1) or "webcrypto" (level 2). Ignored when keyEmbedded. */
  custody?: "backend" | "webcrypto";
  /** The URL the browser calls, to report the transport honestly (http versus https). */
  vtaUrl: string;
  docsUrl?: string;
}

export function custodyOf(i: CustodyInput): Custody {
  if (i.keyEmbedded) return "page";
  if (i.custody) return i.custody;
  return i.credentialPresent ? "unknown" : "none";
}

const LEVEL: Record<Custody, string> = {
  page: "L0, playground", backend: "L1, key in a backend", webcrypto: "L2, non-extractable browser key", none: "no key configured", unknown: "not reported by this page",
};

export function custodyRows(i: CustodyInput): CustodyRow[] {
  const c = custodyOf(i);
  const where: Record<Custody, [string, string | undefined]> = {
    page: ["In this page: the app's private key is embedded in the bundle the browser loads.", "Anyone who can load the page, or read the built files, can act as this app."],
    backend: ["On a backend you run; the page only calls it.", "The page holds no app key. Protect the backend's own sign-in and its list of allowed tasks."],
    webcrypto: ["In the browser's WebCrypto store, marked non-extractable.", "Page code cannot export the key, but script running in the page can still ask it to sign."],
    none: ["Nowhere: no app credential is configured.", undefined],
    unknown: ["Not embedded in the page by this kit, but this page cannot tell where it is held.", undefined],
  };
  const next: Record<Custody, string> = {
    page: "Move the key to a backend (L1): see `recipe:backend-signer` and the hardening ladder in docs/SECURITY.md.",
    backend: "Narrow what the key may do (L3): one context per app, the least role, a short expiry, and an allow-list of tasks on the backend.",
    webcrypto: "Protect the page (strict CSP, no third-party scripts), then narrow the grant (L3). Wiring this key into the kit's client is not implemented.",
    none: "Run `npm run up` (local) or the Farm steps in docs/FARM.md to create an app credential.",
    unknown: "Set the custody option on the panel if you moved the key, and check it against docs/SECURITY.md.",
  };
  const https = /^https:\/\//.test(i.vtaUrl);
  const rows: CustodyRow[] = [
    { pill: c === "page" ? "warn" : c === "none" || c === "unknown" ? "unknown" : "info", label: "Where the key lives", value: where[c][0], note: where[c][1] },
    { pill: "info", label: "Hardening level", value: LEVEL[c], note: "Levels are described in docs/SECURITY.md." },
    { pill: "info", label: "Next step", value: next[c], fix: i.docsUrl ? `Read ${i.docsUrl}` : undefined },
  ];
  if (/^https?:\/\//.test(i.vtaUrl)) {
    rows.push({ pill: https ? "info" : i.mode !== "farm" ? "info" : "warn", label: "Transport", value: https ? "https" : "http (no TLS)", note: https ? undefined : i.mode !== "farm" ? "Plain http to localhost is the playground default." : "A non-local VTA should be reached over https." });
  }
  if (i.mode === "tunnel") {
    rows.push({ pill: "warn", label: "Exposure", value: "public quick-tunnel URL, no authentication in front", note: "Anyone with the URL can reach the VTA, VTC and the open mediator; rate limits and ACLs are the only gates. Demo data only (docs/MODES.md)." });
  }
  if (i.mode === "local" || i.mode === "tunnel") {
    rows.push({ pill: "info", label: "VTA seed storage", value: "plaintext in the local stack (not read by this page)", note: "From docs/SECURITY.md: the local VTA's secrets backend is plaintext. This page does not query it." });
  }
  return rows;
}
