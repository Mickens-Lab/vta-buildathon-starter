# TSP ping page

Vite + TypeScript. Sends a signed `messaging/ping/0.1` to the VTA over TSP from the browser, with the same `tspPing()` as `npm run tsp:ping` (`@buildathon/tsp-client`).
`MODE=tunnel` only; the form is prefilled from `.vta/tunnel.json` and the root `.env`.

```sh
MODE=tunnel MEDIATOR_CORS_ALLOW_ORIGIN=http://localhost:3000 npm run up   # repo root; opens the mediator to this page
npm run dev -w @buildathon/tsp-ping                                        # http://localhost:3000
npm run tsp:ping:browser                                                   # the same, driven by headless Chromium
```

- **Status.** With the pinned images the page logs in, opens the socket and sends the ping, and the VTA dispatches it; no pong comes back because the pinned mediator refuses the VTA's
  TSP 1.0 replies. It then shows "No pong: timed out awaiting reply frame". Details: [docs/MESSAGING.md](../../docs/MESSAGING.md) **[verified]**.
- **Credential in the page.** Like `web-vta-app`, `vite.config.ts` puts `VTA_CREDENTIAL` (a private key) in the page. Dev only. A blank field uses a throwaway `did:key`, which the VTA refuses (403).
- **CORS.** The mediator refuses a browser origin unless `MEDIATOR_CORS_ALLOW_ORIGIN` names it ([docs/MODES.md](../../docs/MODES.md)); port 3000 is also in the VTA and VTC defaults.
