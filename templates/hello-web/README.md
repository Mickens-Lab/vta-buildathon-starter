# hello-web

A one-button page that signs in to your VTA and shows `auth/whoami`. About 15 lines in `src/main.ts`.

```sh
npm run up                                   # repo root, once (writes .env)
npm run new -- my-app --from hello-web       # copy this into apps/my-app and print the command to start it
```

Open the printed URL (http://localhost:5173, or whichever port Vite reports; any port works) and press the button. The page calls `/__vta` on its own
origin and the Vite dev server forwards it to the VTA (`vite.config.ts`, using `../../scripts/lib/dev-proxy.ts`, which also resolves from `apps/<name>`),
so CORS never applies. A page that calls the VTA directly would be limited to the VTA's CORS list: loopback ports 3000-3009, 3050, 4000-4009,
4173, 5173-5183, 8000-8009; `CORS_ORIGINS_TOML` (then `npm run reset && npm run up`) replaces it.
Edit `src/main.ts`: any Trust Task is `vta.call(type, payload)`. DEV ONLY: the app's private key is embedded in the page ([docs/SECURITY.md](../../docs/SECURITY.md)).
