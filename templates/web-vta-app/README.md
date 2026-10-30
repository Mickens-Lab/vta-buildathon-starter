# Web VTA app

Vite + TypeScript. The page authenticates to your VTA with `@buildathon/vta-client`
over plain `fetch` (the VTA allows CORS for `http://localhost:5173`) and renders a live
**connection-status view** (`@buildathon/status-panel`) by default: whether the VTA is
reachable (and round-trip time), its DID and DID-document services, the `vta-service`
version against the pin in `pins.json`, your session (role, scopes, context, expiry),
the Trust Task capabilities grouped by family (with acl/grant and discovery compatibility
hints), whether `window.vtaWallet` is present, and, if `VTC_URL` is in the root `.env`,
the community's `/health` and join manifest. Each row has an ok/warn/bad/unknown pill and
a plain-words explanation; raw JSON sits under "details". Refresh with the button or the
auto-refresh menu. If the wallet is present it also offers a profile lookup and a
wallet-signed Trust Task. Without the wallet, the rest still works.

With nothing reachable the page still renders and says what to fix (VTA down, CORS
blocked, credential missing, wrong version image in farm mode).

```sh
npm run up                              # repo root, once
npm run dev -w @buildathon/web-vta-app      # http://localhost:5173
npm run build -w @buildathon/web-vta-app
```

The dev server defaults to 5173 (3000 and 8000 are also allowed by the VTA: `-- --port 3000`;
`strictPort` is set so a clash fails loudly instead of causing CORS errors).

## Notes

- **Credential in the page.** `vite.config.ts` reads the repo-root `.env` and
  exposes `VTA_URL` and `VTA_CREDENTIAL` to the page. That puts a private key in
  the browser: fine for a throwaway local VTA, wrong for anything else. Move
  calls behind a small backend, or sign with the wallet.
- **Other origin.** Set `CORS_ORIGINS_TOML='"http://localhost:4200"'` and run
  `npm run reset && npm run up`. Alternatively proxy `/trust-tasks`
  through Vite's `server.proxy`. Neither was tested.
- **Wallet API.** The local `window.vtaWallet` typing in `src/main.ts` covers
  only `walletProfile` and `signTrustTask`; the full surface is in
  `vta-browser-plugin/packages/extension/src/bridge-protocol.ts` (login,
  proxyLogin, vaultList, disclose, ...). The wallet branch was not run against a
  real extension.
- `@openvtc/vti-didcomm-js` refuses `http:` and loopback endpoints by default;
  this template does not use it.
