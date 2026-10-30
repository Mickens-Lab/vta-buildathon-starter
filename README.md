# VTA buildathon starter

> **WARNING: a playground for demos and testing ONLY.** Keys are held in plaintext files
> (`.vta/`, `.env`, the VTA's seed on its volume) and, for the web templates, embedded in the
> browser page. Nothing here is secure for long-term or real use. Do not reuse these keys, do not
> deploy the built pages, do not point it at anything real. Details and the way up from here:
> [docs/SECURITY.md](docs/SECURITY.md).

A small TypeScript kit for getting familiar with **Verifiable Trust Agents (VTAs)**, **Verifiable Trust
Communities (VTCs)** and **Trust Tasks** (signed, typed request/response documents). It gives you a
disposable local VTA and VTC in Docker (or a hosted VTA from VTA Farm), small clients for both, and
runnable templates: a signed-document inbox, a browser app, and a React community dashboard.
It is for developers who want to see a signed Trust Task round trip working in minutes, then build on it.

## Prerequisites

- Node 20+ and npm 10+, Docker with Compose v2
- The images `vta-buildathon:local` (plus `vtc-buildathon:local` for the community, and `mediator-buildathon:local` for tunnel mode). **No images are published: you build
  them locally from the pinned upstream source**, which needs a checkout of the upstream VTI repository next to this one and a Rust build of 10 to 25 minutes per image
  (exact steps and times: [docs/PINS.md](docs/PINS.md#where-the-images-come-from)). Without Docker, see the Farm mode in [docs/MODES.md](docs/MODES.md).

## Quick start

```sh
npm ci
WITH_VTC=1 npm run up        # keys, VTA (+ VTC), a "my-app" context and a credential in .env
npm run hello                # first signed call
npm run vtc:hello            # read the community's join manifest
```

Expected from `npm run hello` (DIDs differ on your machine):

```
1. VTA DID        did:webvh:Qm...:localhost%3A8100   (MODE=local)
2. authenticated  as did:key:z6Mk...
3. discovery      304 supported Trust Tasks
4. signed call    auth/whoami -> {"capabilities":[...],"roles":["application"],"scopes":["ctx:my-app"],...}
```

Use `npm run up` alone if you do not need a VTC. Clean up with `npm run vta:reset`.
Trouble? See [Troubleshooting](#troubleshooting).

## Things to try

[docs/TRY-THIS.md](docs/TRY-THIS.md) has guided exercises, easy to advanced, each with commands and expected output:
a first signed call, the status page, join a community and see the member screens, tamper/replay/wrong-recipient
against the inbox verifier, reading refusals, calling a task you have not used, a read-only look at the Farm, and ideas to extend,
plus approving a gated task from a second key ([docs/APPROVALS.md](docs/APPROVALS.md)). Each exercise names the mode it needs.

## Repo map

| Path | What |
|---|---|
| `packages/vta-client`, `packages/vtc-client` | Discover, authenticate, sign and call any Trust Task; VTC join and member helpers. Node and browser. |
| `packages/tsp-client` | Log in to the mediator, open the TSP socket, send a signed ping and read the pong; `connectTsp` receives frames. Node and browser. |
| `packages/status-panel` | Dependency-free connection-status panel (vanilla TypeScript). |
| `templates/inbox-verifier` | Server that accepts signed documents (works offline). |
| `templates/web-vta-app` | Browser app with a status page and optional wallet (vanilla TypeScript). |
| `templates/community-dashboard` | React dashboard for the VTC member journey. |
| `templates/tsp-ping` | Browser page that sends a TSP ping to the VTA (`MODE=tunnel`; sends a TSP ping and shows the pong, see docs/MESSAGING.md). |
| `templates/mcp-agent` | Stub for an AI agent with a scoped VTA identity. |
| `scripts/` | The npm commands (`up`, `hello`, `vtc:*`, `farm:*`, `vta:call`, checks). |
| `docker-compose.yml`, `docker/` | Local VTA and VTC. |
| `docs/` | Everything else: see the [docs index](docs/README.md). |

Code tour with a diagram: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Docs

[Docs index](docs/README.md): [TRY-THIS](docs/TRY-THIS.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [CHEATSHEET](docs/CHEATSHEET.md),
[VTC](docs/VTC.md), [VTC-SURFACE](docs/VTC-SURFACE.md), [ROLES](docs/ROLES.md), [MODES](docs/MODES.md), [FARM](docs/FARM.md), [PINS](docs/PINS.md), [EVENT](docs/EVENT.md),
[TRACKS](docs/TRACKS.md), [SECURITY](docs/SECURITY.md), [Trust Tasks guide](docs/trust-tasks/README.md).

## Modes

One setting, `MODE` in `.env` (or the environment), chooses where the VTA/VTC run: `local` (default, Docker on your laptop), `tunnel` (local stack plus a mediator on
public, ephemeral quick-tunnel URLs, for messaging and TSP; heavy first build) or `farm` (agents hosted by [VTA Farm](https://vta.farm/), no Docker).
**Local mode is the primary, supported path.** What each mode gives, what works and what was verified: [docs/MODES.md](docs/MODES.md) and [docs/STATUS.md](docs/STATUS.md).

## Templates

| Template | Run it | Good for |
|---|---|---|
| [`templates/inbox-verifier`](templates/inbox-verifier) | `npm run demo -w @buildathon/inbox-verifier` | Servers that accept signed Trust Tasks. Works offline, no VTA needed. |
| [`templates/web-vta-app`](templates/web-vta-app) | `npm run dev -w @buildathon/web-vta-app` | Browser apps that talk to the VTA. Optional wallet. |
| [`templates/mcp-agent`](templates/mcp-agent) | see its README | AI agents with a scoped VTA identity. Partial: a stub. |
| [`templates/community-dashboard`](templates/community-dashboard) | `npm run dev -w @buildathon/community-dashboard` | A React + TypeScript dashboard for the whole member journey with a VTC, no session: visit, apply (with a signed-request preview), pending (polls every 10 s, withdraw), member (card, directory, my card, renew, leave), re-apply, plus an "Under the hood" log of every Trust Task call. Its membership card has a per-mode "Credential delivery" note. Needs a VTC. Driven end to end in headless Chromium against the local stack; states are marked verified/inferred in its README. |

Six track ideas are in [`docs/TRACKS.md`](docs/TRACKS.md); endpoints, task names
and env vars are in [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md).

New to Trust Tasks, or need one that does not exist yet? [`docs/trust-tasks/`](docs/trust-tasks/README.md) covers
concepts, finding, using, developing and evaluating them, with a hands-on custom-task walkthrough.

## Commands

| Command | Does |
|---|---|
| `npm run up` / `down` | Mode-aware: local = keygen, compose up, provision; tunnel (`MODE=tunnel`) = tunnels, mediator, VTA, VTC, provision, probe, and `down` deletes its volumes; farm = mint admin key, print portal steps, then provision |
| `npm run tunnel:probe` | `MODE=tunnel`: re-run the checks (public URLs, DID bound to the tunnel host, messaging advertised and live, mediator ACL note) |
| `npm run tsp:ping` / `tsp:listen` / `tsp:ping:browser` | `MODE=tunnel`: send a signed TSP ping and print the pong / receive the credential frames the VTC pushes / the same ping from headless Chromium ([docs/MESSAGING.md](docs/MESSAGING.md)) |
| `npm run vta:up` | Local only: keygen, `docker compose up --wait`, provision |
| `npm run farm:setup` / `farm:check` / `farm:probe` | Farm (`FARM=ic3` default, or `firstperson`; `FARM_AGENT=<name>` derives `VTA_URL`/`VTA_DID`): mint the Admin DID and print portal steps / read-only check of your agent / dated, read-only survey of both Farms side by side (run it the day before and the day of an event) |
| `npm run farm:canary` | Organisers: with a throwaway agent's URL/DID in `.env.farm`, runs `farm:check` + `provision` + `hello` and prints a GO / switch-to-local verdict |
| `npm run vtc:hello` / `vtc:join` / `vtc:approve` | VTC checkpoint / apply as your app identity / admin approves |
| `npm run vtc:status` / `vtc:profile` / `vtc:withdraw` / `vtc:leave -- --yes` | member: status + membership proof / community profile, my card, directory, groups / withdraw the open request / leave the community now |
| `npm run roles:matrix` / `roles:personas -- create <name> <role>` | Who-can-call-what table / throwaway persona identities, warnings only ([docs/ROLES.md](docs/ROLES.md)) |
| `npm run approvals:setup` / `approvals:demo` / `approver` | Approve a gated task from a second key: mint the throwaway approver / ask for the task and wait / verify and approve or deny ([docs/APPROVALS.md](docs/APPROVALS.md)); `local` or `tunnel` |
| `npm run security:check` / `recipe:backend-signer` / `recipe:webcrypto-key` | Key-hygiene scan of the tree / first hardening rungs ([docs/SECURITY.md](docs/SECURITY.md)) |
| `npm run images:build [vta\|vtc\|mediator\|all]` / `pins:check` | Build an image from its pinned ref (the VTA with `tsp`; the mediator is for tunnel mode and is the slow one) / report version drift, including a VTA image without `tsp` ([docs/PINS.md](docs/PINS.md)) |
| `WITH_VTC=1 npm run up` | Local VTC too (needs a VTC image, see docs/VTC.md) |
| `npm run vta:provision -- <context>` | New context + app identity (`ENV_FILE=.env.x` to keep several) |
| `npm run vta:logs` | Follow VTA logs |
| `npm run vta:reset` | Delete the VTA, VTC and mediator containers, their volumes, `.vta/` and `.env` (in tunnel mode use `MODE=tunnel npm run down`, which also stops the tunnels) |
| `npm run hello` | The checkpoint |
| `npm run vta:call -- <task> [json]` | Call any Trust Task as your app identity (no argument lists them) |
| `npm run vtc:refusals` | The same signed calls as a stranger and as your app: who is refused what |
| `npm run test:roles` | Live contract test (local or tunnel stack): safe read tasks as stranger, applicant, member and admin, checked against [docs/VTC-SURFACE.md](docs/VTC-SURFACE.md). Not in `npm test`. |
| `npm run e2e` | Live browser test (local or tunnel stack, Chromium): the dashboard journey, refresh and local hints. Optional, about 3 minutes, not in `npm test`. |
| `npm test` / `npm run typecheck` | Unit tests (no VTA needed; includes `check:generic` and `check:docs`) / typecheck all packages |
| `npm run check:docs` | Every relative markdown link resolves and every `npm run` script named in the docs exists |
| `npm run check:generic` | Fails if the tree holds personal keys, agent names, accounts, emails, machine paths or a default community (`-- --history` also scans commits) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pull access denied for vta-buildathon` | The image is not built here. Build it ([docs/PINS.md](docs/PINS.md#where-the-images-come-from)) or set `VTA_IMAGE` to one you were given. |
| `.vta/admin.env` not found | `npm run vta:keygen` before `docker compose up`. |
| `provision` fails with 401 or `permissionDenied` | `.vta/admin.json` is not the key this volume was seeded with. `npm run vta:reset`, then `npm run vta:up`. |
| `VTA DID changed` | The VTA was recreated. `npm run vta:provision`. |
| `429` | Auth is rate limited per IP; the kit allows burst 60. Wait a few seconds. |
| Browser CORS error | Your origin is not allowed. Use port 5173, 3000 or 8000, or see the cheatsheet. |
| Port 8100 taken | `VTA_PORT=8101 npm run vta:up` on a fresh volume (`vta:reset` first) and `VTA_URL=http://localhost:8101`. Not tested here. |
| `MODE=farm` errors | See the troubleshooting table in [docs/FARM.md](docs/FARM.md). |
| `refusing to start ... volume was set up for` / `Found volumes from a MODE=local run` | Volumes from another mode: follow the printed reset; table in [docs/MODES.md](docs/MODES.md#switching-modes). |
| Tunnel probe fails or shows `MESSAGING DEGRADED` | See the troubleshooting table in [docs/MODES.md](docs/MODES.md#troubleshooting). |
| Anything else | `npm run vta:logs`; a `Setup failed:` line names the bad field. |

## Status

What works in which mode, and what was and was not verified: [docs/STATUS.md](docs/STATUS.md).

## Privacy / what this repo does not contain

This is a general tool. It holds no one's keys, agents, accounts or infrastructure:

- No agent names, VTA/VTC DIDs, runner agents or default community. `scripts/farm-hosts.json` lists only the public host
  patterns of the VTA Farms. You supply your own `FARM_AGENT` / `VTA_URL`, and `VTC_URL` / `VTC_DID` if you use a community.
  `farm:probe` checks hosts, and your own agent only if you configured one.
- No key material. Your admin key (`.vta/`) and app credential (`.env*`) are generated on your machine and gitignored,
  as are passkey and state files. `farm:setup` prints your own freshly generated Admin DID.
- No personal details, machine paths or private repositories. `npm run check:generic` (part of `npm test`) enforces this.
  Test fixtures are made up and short (for example `did:webvh:Qmfake:localhost`).
- An example Farm-hosted community may be named in [docs/FARM.md](docs/FARM.md); confirm with the Farm operators before joining any community you did not set up.

## License

Apache-2.0. Adapted from the `buildathon-vta` kit in
verifiable-trust-infrastructure; see [NOTICE](NOTICE).
