# Modes: local, tunnel, farm

One setting, `MODE` in `.env` (or the environment), chooses where the VTA and VTC run. There are exactly three modes and no separate
"messaging" switch: messaging is what `tunnel` adds. Back to the [README](../README.md).

Labels used here: **[verified]** observed while building this kit (tunnel spike and a live run of `MODE=tunnel npm run up` against the
pinned images), **[unverified]** not observed, stated from documentation or inference.

## Which mode gives what

| | `local` (default) | `tunnel` | `farm` |
|---|---|---|---|
| Where it runs | Docker on your machine | Docker on your machine, exposed through Cloudflare quick tunnels | hosted by [VTA Farm](https://vta.farm/) |
| Trust Tasks over REST | yes | yes | yes |
| Messaging (DIDComm, TSP) | no (REST only) | yes, through a mediator that this mode runs | the Farm's mediator **[unverified]** for apps of this kit |
| Reachable from other devices or a phone | no | yes, on public URLs | yes |
| Persistence | Docker volumes, survive restarts | none worth keeping: new URLs and DIDs every run | the Farm's |
| Needs | Docker, the VTA (and VTC) image | Docker, `cloudflared` on PATH, internet, the VTA, VTC **and mediator** images | a browser with a passkey, internet |
| Start | `npm run up` | `MODE=tunnel npm run up` | `MODE=farm npm run up`, then [FARM.md](FARM.md) |
| Stop | `npm run down` | `MODE=tunnel npm run down` (deletes its volumes) | delete the agent in the portal |
| Safe for real data | no | **no, never** | no (shared test service) |

Features and the mode they need (everything in the README and [TRY-THIS](TRY-THIS.md) works in `local` unless a row says otherwise):

| Feature | `local` | `tunnel` | `farm` |
|---|---|---|---|
| Trust Tasks, the dashboard, roles lab, `npm run e2e`, `npm run test:roles` | yes **[verified]** | yes **[verified: e2e 13/13, roles 36/36 through the public URLs]** | yes (see [FARM.md](FARM.md)) |
| [Approve on a second device](APPROVALS.md) (software approver) | yes **[verified]** | yes **[verified]** | no: a hosted VTA's policy is set in its portal |
| Membership credential reaches the member | no (messaging off) | **no**: the kit's applicant has no inbox, `credentialsDelivered:false` **[verified]** | **[unverified]** |
| DIDComm/TSP application round trip, a phone as approver | no | **no client in the kit** ([MESSAGING.md](MESSAGING.md), [MOBILE-WALLET.md](MOBILE-WALLET.md)) | **[unverified]** |

In the dashboard the membership card's "Credential delivery" row says which of these applies to the mode the page was built for.

## Tunnel mode in short

```bash
npm run images:build vta          # once; tsp is now in the feature list, see below
npm run images:build vtc          # once
npm run images:build mediator     # once, heavy: about 15 minutes and plenty of RAM
MODE=tunnel npm run up            # tunnels -> mediator -> VTA -> VTC -> probe
npm run tunnel:probe              # re-run the checks at any time
MODE=tunnel npm run down          # stop tunnels, delete the volumes and the tunnel keys in .env
```

`npm run up` in tunnel mode does this, in this order (it matters: the DIDs and configs name the tunnel hostnames):

1. Starts three `cloudflared` quick tunnels (VTA, VTC, mediator) and reads their hostnames.
2. Starts `redis` and the `mediator` (compose profile `messaging`). The mediator creates its own identity on first boot and is told its
   public host.
3. Starts the VTA with `did:webvh` at its tunnel host, messaging pointing at that mediator, and `didcomm` + `tsp` enabled.
4. Provisions the app (the usual `vta:provision`, but against the public VTA URL, which is written to `.env` as `VTA_URL`).
5. Starts the VTC the same way, with its transports set to `tsp` and `didcomm` through the mediator.
6. Runs `npm run tunnel:probe` and fails loudly if any check fails. The stack is then left running so you can look at it.

Everything the scripts need (`npm run hello`, `vtc:join`, `vtc:approve`, ...) works unchanged with those public URLs **[verified]**. The
tunnel hostnames are kept only in `.vta/tunnel.json` and `.env`, which are git-ignored; nothing about a run is written to tracked files.
Compose files, entrypoints and recipes contain placeholders only.

## Browser access (CORS)

A web page that talks to the mediator directly (the TSP browser client) needs two things the defaults do not give:

- **Mediator:** set `MEDIATOR_CORS_ALLOW_ORIGIN` before `npm run up` (or `docker compose --profile messaging up -d mediator` again; it is applied on
  every boot, no volume reset). It becomes `[security] cors_allow_origin` and takes one exact origin such as `http://localhost:5173`, a
  `https://*.suffix` pattern, or `*`. **Unset (the default) means off**: responses carry no `Access-Control-Allow-Origin`, and the mediator also
  refuses a WebSocket upgrade that carries a browser `Origin` header (403). Prefer an exact origin; `*` is tolerable only because the mediator
  authenticates with a bearer token, not cookies. Anything outside letters, digits and `: / . * -` is refused at boot.
- **VTA and VTC:** their REST endpoints already allow `http://localhost:5173`, `:3000` and `:8000` by default. For another origin use
  `CORS_ORIGINS_TOML` (VTA) and `VTC_CORS_ORIGINS_TOML` (VTC), first boot only (see the cheatsheet).

## Caveats, stated plainly

- **The URLs are public and unauthenticated.** Anyone who has a quick-tunnel URL can reach the VTA, VTC and mediator endpoints. The VTA's
  and VTC's own rate limits and ACLs are the only gates. All traffic arrives from the tunnel's address, so those limits are shared by every
  caller **[unverified under load]**.
- **The mediator is OPEN.** It runs with `mediator_acl_mode = explicit_deny` and `global_acl_default = ALLOW_ALL` (the generated default):
  any DID may register and relay through it while the tunnel is up. We left it open because a closed mediator (`explicit_allow`) answered
  403 to the `did:webvh` VTA and the VTA then **silently fell back to REST only**, with just a warning in its log **[verified]**. The DEV ONLY
  banner says so on every `up`. Keep the stack up only while you use it.
- **DIDs and credentials are regenerated on every run, and old ones are dead.** A `did:webvh` DID is bound to its hostname, and a quick
  tunnel gets a new hostname each time it starts. Restarting one tunnel gives a new hostname; the new host then serves a DID still bound
  to the old one, and the old host returns 530 **[verified]**. So tunnel volumes are never resumable, and `up` refuses to start on top of
  them (below).
- **Demo and test data only, never real credentials.** Keys are plaintext on the volumes, the admin key sits in `.vta/`, and the mediator is
  open.
- **No uptime guarantee.** Cloudflare quick tunnels are for testing: no SLA, they can be rate limited, and they are not for production.
- **Heavy first build.** The mediator is built from source. A cold build took about 15 minutes on a 12-core machine, building from a
  fresh clone of the pinned commit; the image is about 170 MB; the build's own footprint stayed within about 1.5 GB above idle **[verified,
  one machine]**. Upstream estimates 20+ minutes and 8 GB of RAM, and `npm run images:build mediator` warns when less than that is
  available. Running it (mediator 10 MB, redis 5 MB, VTA 16 MB, VTC 27 MB, each `cloudflared` about 33 MB resident) is light.
- **Messaging is "transport connected, round trip unverified".** (What this kit can and cannot build on it: [MESSAGING.md](MESSAGING.md).) What is verified: the mediator answers through its public URL, the VTA and
  VTC connect to it, the VTA's DID document lists `TSPTransport`, `DIDCommMessaging` and `VTARest`, `messaging/ping/0.1` reports
  `tsp`, `didcomm`, `rest`, the VTC advertises both transports as serviceable, and a VTC approval queues two Trust Task pushes via
  DIDComm that the mediator accepts (outbox `Queued` then `Sent`). What is **not** verified: an application-level message from one peer
  arriving at another, TSP frame handling end to end, and credential pickup (the applicant of this kit is a plain `did:key` with no
  mediator or listener, so the VTC logs `credentials_delivered=false`). `messaging/ping/0.1` is a capability check, not a peer ping, and this
  kit has no DIDComm client yet.
- **A silent REST fallback is made loud.** The VTA keeps serving REST when its mediator connection fails and only logs a warning, so the
  probe and the status panel's Messaging row read the VTA's own protocol list and show `MESSAGING DEGRADED` (a failure) when `didcomm` or
  `tsp` is missing.
- **A hosted or organiser mediator may not admit your VTA.** Whether the Farm's or an organiser's mediator admits an outside `did:webvh` VTA
  is **unknown**; it depends on that mediator's ACL mode. The Farm provisions its own VTAs, which says nothing about external ones. Ask the
  operator which mode it runs. This kit supports only a self-run, open mediator for now.
- **The phone leg is not tested.** Neither a mobile wallet reaching these URLs nor `did:webvh` resolution from a device was exercised.
  If a phone connects to the mediator directly, set `MEDIATOR_CORS_ALLOW_ORIGIN` (see Browser access above); a React Native WebSocket sends an Origin
  header too **[unverified for a phone; the browser-Origin refusal itself was reproduced in the TSP spike]**.
- **The trigger-link sign-in (auth/oob) was not tested.** No path with that name exists in the VTA or VTC OpenAPI documents we read
  **[verified absent]**; whether it is a Trust Task or a wallet-side concept is **unknown**.

## Security notes for this mode

- `mediator-setup` prints the mediator's admin **private key** to its standard output (it also stores it). The entrypoint sends that output
  to a temporary file inside the container and deletes it, and deletes the generated `admin-monitor.json`, so the key is not in `docker
  logs`. If you run `mediator-setup` yourself, redact its output before pasting it anywhere.
- The VTC logs a one-time admin install URL with a signed token at boot, and `/admin/install` is reachable through its tunnel (it answered 503
  in the image we built, which has no admin console) **[verified]**. Do not tail VTC logs into a shared channel while the tunnel is up.
- Flushing the mediator's redis while the VTA and VTC are connected leaves both answering 500 ("No challenge found") until they are
  restarted **[verified]**. Redis here is memory only and is started fresh with the stack; do not flush it by hand. Restarting the mediator
  container alone is fine: the VTA and VTC reconnected on their own within about a second.
- Version skew: the VTC 0.15.0 sends a `messaging/message/status/0.2` Trust Task that mediator 0.33.1 answers with a "trust task unsupported"
  problem report. It is harmless to the flows above **[verified]** but shows the two are not built for each other.
- The VTA's `VTA_ALLOW_PRIVATE_ENDPOINTS` loopback allowance is switched off in tunnel mode; the VTA resolves its own DID over the public
  network and that works.

## Switching modes

Volumes are never silently reused across modes. `npm run up` refuses, says why, and prints the reset command:

| You have | You run | Result |
|---|---|---|
| a `local` stack (volumes) | `MODE=tunnel npm run up` | **refused.** Local data cannot move to a tunnel host. Reset with `npm run vta:reset` (deletes the local volumes, `.env`, `.vta`), then try again |
| tunnel volumes (a run you did not take down) | `MODE=tunnel npm run up` | **refused.** New hostnames mean new DIDs. `MODE=tunnel npm run down`, then up again |
| tunnel volumes | `npm run up` (local) | **refused.** `MODE=tunnel npm run down` first |
| a `local` stack | `npm run up` | fine, as before. A local stack made before modes existed counts as local |

`MODE=tunnel npm run down` stops the tunnels it started, removes the containers **and deletes the volumes** (they cannot be used again),
removes `.vta/tunnel.json`, and removes the dead URLs and the app credential from `.env`. It keeps `MODE` and the admin key in `.vta/`. The
refusal is also enforced inside the VTA and mediator entrypoints (a volume made for one host will not start for another), so running
`docker compose` by hand cannot reuse it either. `npm run vta:reset` also clears the messaging volume but does not stop tunnels: use
`MODE=tunnel npm run down` in tunnel mode.

## Images and pins

`pins.json` records the mediator (affinidi-tdk-rs commit `55580615`, mediator v0.33.1, features `tsp,secrets-aws`), the redis tag, and the
VTA build features. Two changes to the images you already know:

- **The VTA image must be built with `tsp`.** The VTI Dockerfile's default feature list has none, and then the VTA refuses
  `services.tsp = true` at setup **[verified]**. `npm run images:build vta` now passes the pinned feature list for every VTA build, so one
  image serves all modes. An image built before this change has no `tsp`: rebuild it. (`didcomm` without `tsp` also works **[verified]**,
  but this kit sets both.) `npm run pins:check` flags an unlabelled VTA image and confirms the label matches the pinned list **[verified: an image built by `npm run images:build vta` carries the `org.buildathon.vta-features` label, `pins:check` reports "features match", and `MODE=tunnel npm run up` passed every probe check with it]**.
- **The mediator image** is built from `docker/mediator.Dockerfile` by `npm run images:build mediator`. As with the others, there is no
  published image: you build it locally. It is for `MODE=tunnel` only; `images:build all` does not build it.

`cloudflared` is a host binary (quick tunnels need no account) and is not pinned by this repo; 2024.6.1 was validated.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `up` says `cloudflared` is missing | not on PATH | Install it (see the error text); no account needed |
| "cloudflared did not print a tunnel host" | quick tunnels flaky or rate limited | wait a minute and run `MODE=tunnel npm run down` then `up` |
| "missing image(s)" | images not built | run the `images:build` commands in the message; the mediator build is the long one |
| "refusing to start ... volume was set up for" | stale volume for another host | `MODE=tunnel npm run down`, then `up` |
| probe: "DID names a different host" | a tunnel restarted under a live VTA | the DID is bound to the old host: `down`, then `up` |
| probe: MESSAGING DEGRADED / VTA reports REST only | mediator refused or unreachable (a closed ACL answers 403 to a `did:webvh` VTA), or `tsp` not built in | `docker compose --profile messaging logs vta mediator`; confirm the mediator ACL is open and the VTA image has `tsp` |
| public hosts answer 502 | tunnel is up but nothing listens behind it | `docker compose ps`; start the service |
| public hosts answer 530 / 1033 | the tunnel process is gone | `MODE=tunnel npm run down` and `up` (new URLs, new DIDs) |
| right after `up`, a public URL does not resolve | DNS for a fresh host lags a few seconds | wait and run `npm run tunnel:probe` again |
| VTA and VTC answer 500 "No challenge found" | the mediator's redis was flushed | restart the VTA and VTC; avoid flushing |
| hosted or organiser mediator rejects the VTA | its ACL is closed to your DID | ask the operator for its ACL mode; otherwise use this mode's own mediator |
| a template's dev page cannot reach the VTA | the page runs on a port other than 3000, 5173 or 8000 | those are the allowed origins (as in local mode) |
