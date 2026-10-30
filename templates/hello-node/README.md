# hello-node

The smallest Node app that talks to your VTA: sign in, `whoami`, one `memory/put`, one `memory/list`. About 15 lines in `src/index.ts`.

```sh
npm run up                                    # repo root, once (writes .env)
npm run new -- my-app --from hello-node       # copy this into apps/my-app (it prints the command that runs the copy)
```

Change `src/index.ts`: any Trust Task is `vta.call(type, payload)`; `npm run vta:call` at the repo root lists the 300 or so the VTA serves. The credential comes from the
repo-root `.env`. DEV ONLY: see [docs/SECURITY.md](../../docs/SECURITY.md).
