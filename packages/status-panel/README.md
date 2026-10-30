# @buildathon/status-panel

A connection-status view for a VTA (and optional VTC). Vanilla TypeScript, no dependencies, no framework:
render into any container. Theme-aware (light/dark) and responsive; CSS is injected once and scoped to `.sp-root`.

```ts
import { mountStatusPanel } from "@buildathon/status-panel";

const panel = mountStatusPanel(document.getElementById("status")!, {
  mode: "local",                       // or "farm"
  vtaUrl: "http://localhost:8100",     // what the browser calls (farm: a same-origin proxy path)
  credentialPresent: !!credential,
  connect: async () => { const c = await VtaClient.fromCredential(credential, url); await c.authenticate(); return c; },
  pin: { version: "0.65.0", imageTag: "0.65.0-fc157f76", portalDefault: "0.56.0" },
  keyEmbedded: true,                   // shows the "dev-only: key embedded in this page" warning
  vtc: { url: "http://localhost:8200" },   // optional; add `manifest` for the community name
});
await panel.refresh();   // or panel.destroy()
```

See `templates/web-vta-app/src/main.ts` and `vite.config.ts` (injects the pin and VTC settings with Vite `define`).
Adopting it in `community-dashboard`: add the workspace dependency, call `mountStatusPanel` with the same options,
and pass `vtc.manifest: () => vtcClient.manifest()` if you already hold a `VtcClient`.

Card 8, **Key custody**, says where the app key lives, which hardening level that is ([docs/SECURITY.md](../../docs/SECURITY.md)) and the next step. It derives this from `keyEmbedded` (level 0) or the optional `keyCustody: "backend" | "webcrypto"` option, reports only what the page can know, and is advisory: it does not change the overall status pill. Rows come from `custodyRows()` in `src/custody.ts`.

The panel never prints the credential. Pure helpers (DID-document services, version comparison, discovery grouping,
compatibility hints) live in `src/parse.ts` and are exported; tests: `npm test -w @buildathon/status-panel`.
