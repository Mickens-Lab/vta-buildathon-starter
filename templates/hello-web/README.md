# hello-web

A one-button page that signs in to your VTA and shows `auth/whoami`. About 15 lines in `src/main.ts`.

```sh
npm run up                                   # repo root, once (writes .env)
npm run new -- my-app --from hello-web       # copy this into apps/my-app and print the command to start it
```

Open the printed URL (http://localhost:5173; if that port is busy start with `-- --port 3000`, which the local VTA also allows) and press the button.
Edit `src/main.ts`: any Trust Task is `vta.call(type, payload)`. DEV ONLY: the app's private key is embedded in the page ([docs/SECURITY.md](../../docs/SECURITY.md)).
