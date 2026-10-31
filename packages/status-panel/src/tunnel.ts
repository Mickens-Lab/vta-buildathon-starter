// What a tunnel-mode page says about how long its hosts and DIDs live. One wording for the page banners (community dashboard,
// web-vta-app) and the status panel's Mode note, matching what `npm run down` does in scripts/up.ts: it stops the quick tunnels,
// deletes the tunnel volumes (the DIDs were bound to those hosts) and removes the tunnel keys from .env, the app credential included.
// Pure, so it is unit-tested (test/tunnel.test.ts). `code` spans are in backticks.

/** The short form, for the status panel's Mode note. */
export const TUNNEL_LIFETIME = "Hosts and DIDs die at `npm run down` and are new after the next `npm run up -- --tunnel`";

export interface TunnelBanner { title: string; text: string }

/** The banner a page shows at the top in tunnel mode; undefined in local and farm mode (nothing there is tied to a tunnel). */
export function tunnelBanner(mode: "local" | "tunnel" | "farm"): TunnelBanner | undefined {
  if (mode !== "tunnel") return undefined;
  return {
    title: "Tunnel mode: these hosts and DIDs last only for this run.",
    text: "The public quick-tunnel hosts and the DIDs of the VTA, the VTC and the mediator, and the applicant did:peer:2 that names the mediator, die at `npm run down`: it stops the tunnels, deletes the tunnel volumes and removes the tunnel keys (the app credential too) from .env. The next `npm run up -- --tunnel` makes new ones (restart this dev server then). Do not bookmark or share them beyond this run.",
  };
}
