# Status: what works, by mode

Part of the [docs index](README.md). This page holds the project status that used to sit in the README: what was checked, in which mode, and what was not.
Every doc marks claims as **verified** (observed while building this kit) or **unverified** (documentation or inference).

## Modes at a glance

One setting, `MODE` in `.env` (or the environment), chooses where the VTA/VTC run. Exactly three modes, no separate messaging switch.
Unless a row in [docs/MODES.md](MODES.md) says otherwise, a command works in every mode; that page also says what each mode gives and what each feature needs.

| `MODE` | Runs | Needs | Start |
|---|---|---|---|
| `local` (default) | docker compose on your laptop | Docker, the VTA image (built locally: `npm run setup`; prebuilt images are not yet available) | `npm run up` |
| `tunnel` | the local stack plus a mediator (messaging), on **public, ephemeral** quick-tunnel URLs, with an **open** mediator; demo data only | Docker, `cloudflared`, internet, a locally built mediator image (heavy first build) | `npm run up -- --tunnel` (stop: `npm run down`), every caveat in [docs/MODES.md](MODES.md) |
| `farm` | agents hosted by [VTA Farm](https://vta.farm/) | A browser with a passkey; no Docker, no Rust build | `MODE=farm npm run up`, then [docs/FARM.md](FARM.md) |

**Local mode is the primary, supported path.** Farm mode is an optional shortcut for
when Docker does not cooperate, and only after a pre-event check. There are two Farms:
**`FARM=ic3` (https://vtafarm.ic3.dev, staging) is preferred and the default**; `FARM=firstperson`
(https://vtafarm.firstperson.dev) is supported but currently cannot create agents (`acl/grant/0.2`, a confirmed
Farm-side bug, 2026-10-29). Organisers run `npm run farm:probe` plus a canary agent (`npm run farm:canary`) the
day before and on the day (ic3 first, then firstperson), and use local mode for everyone if both fail ([docs/EVENT.md](EVENT.md), [docs/FARM.md](FARM.md)).
Browser apps work in farm mode through the Vite proxy in each template. Tunnel mode turns DIDComm/TSP on. A TSP client (`npm run tsp:ping`, `templates/tsp-ping`) sends a signed ping to the VTA through the kit's mediator and gets the pong back, and `npm run tsp:listen` receives the credential frames the VTC pushes after an approval; both **verified live** in tunnel mode (a wallet storing the credential, DIDComm and a Farm mediator are not: [docs/MESSAGING.md](MESSAGING.md)).
A VTC (community) is described in [docs/VTC.md](VTC.md): the client is ready,
the local Docker VTC (vtc-service 0.15.0, the version the Farm VTC runs) was **verified live** (join, approve, restart, browser; a member cannot get a console session by design, but the sessionless member surface was mapped and verified: docs/VTC-SURFACE.md), the farm community path needs the portal and is unverified.


## Verification status

This starter was checked on Linux with Docker 29 and Node 22 only; Windows and macOS hosts are untested. The organiser checklist is in [EVENT.md](EVENT.md).

**Verified live**: the local VTA and VTC flows, the dashboard (browser end to end), the role matrix, `MODE=tunnel` bring-up with the public URLs, the status
panel Messaging row in a browser, the software-approver demo in local and tunnel mode, and the TSP round trip in tunnel mode: a ping from Node and from headless
Chromium reaches the VTA and its pong comes back through the mediator (0.45.0), and `npm run tsp:listen` receives the credential frames the VTC pushes after an approval. In tunnel mode the applicant is, by default, a `did:peer:2` whose `TSPTransport` service names the mediator (a short `did:webvh` bound to its tunnel host), so the VTC pushes the credential frames to it with no ping first (`npm run tsp:peer-push`, [MESSAGING.md](MESSAGING.md#tunnel-mode-delivers-the-credential-to-the-applicant)); `VTC_APPLICANT=did:key` keeps the old `did:key` flow, also verified; `credentialsDelivered` stays false because it reports the member's own credential sent back, not frame arrival ([MESSAGING.md](MESSAGING.md#what-credentialsdelivered-means)).
The status panel's "Applicant and messaging" card (applicant type per mode, DID sizes vs the 1000-byte resolver limit, the mediator's did:webvh at its tunnel host) is unit-tested; its live browser check is pending.
The community dashboard's "Send my membership credential back" (the member's own `MembershipCredential` to `vtc/members/vmc/0.1` over REST, unbound to the grant, which turns `credentialsDelivered` true; [MESSAGING.md](MESSAGING.md#what-credentialsdelivered-means)) is unit- and component-tested; its live check is pending.
The community dashboard's "Credential frames" panel (listen on the mediator as the applicant from the browser, list frames by kind; needs `MEDIATOR_CORS_ALLOW_ORIGIN` for its origin) is unit- and component-tested with a fake listener; its live browser check is pending.
**Not verified**: DIDComm, a wallet storing the credential, a phone as approver, a hosted mediator admitting an outside VTA, the Farm community path, arm64, and Windows or macOS
([MESSAGING.md](MESSAGING.md)).
