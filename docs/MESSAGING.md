# Messaging in this kit: what exists, and the gap

`MODE=tunnel` gives the VTA, the VTC and a mediator a public home and turns DIDComm and TSP on ([MODES.md](MODES.md)). This page says what that does and does not let you build today.
Back to the [docs index](README.md).

Labels: **[verified]** observed live (`MODE=tunnel`, pinned images), **[unverified]** not observed.

## What works

- The VTA and VTC connect to the kit's mediator, advertise `DIDCommMessaging` and `TSPTransport` in their DID documents, and `messaging/ping/0.1` reports `tsp`, `didcomm`, `rest` **[verified]**.
  This is a **capability check, not a peer ping.** The status panel's Messaging row reads "transport connected ..., not a peer ping" and means exactly that; the peer ping is `npm run tsp:ping` (below).
- A VTC approval queues Trust Task pushes over DIDComm and the mediator accepts them (outbox `Queued` then `Sent`) **[verified]**.
- Everything else (every Trust Task this kit sends) travels over REST, in every mode. A Trust Task is a signed JSON document; REST and messaging only differ in how it is carried.

## TSP client: what runs

`packages/tsp-client` is a small TypeScript TSP client (built on `@openvtc/pnm-core` and `@openvtc/vti-tsp-js`, Apache-2.0, pinned exactly). `npm run tsp:ping` and the page
`templates/tsp-ping` (`npm run tsp:ping:browser` drives it in headless Chromium) log in to the mediator as the app's `did:key`, resolve the VTA's `did:webvh` to TSP keys, form
a TSP relationship, and send a signed `messaging/ping/0.1` in the TSP binding envelope (`{"type": ".../binding/tsp/0.1/envelope", "document": <Trust Task>}`).

**Verified live (`MODE=tunnel`, pinned images including mediator 0.45.0, 2026-10-30, two separate bring-ups):**
- **The pong.** `npm run tsp:ping` (Node) and `npm run tsp:ping:browser` (the `templates/tsp-ping` page in headless Chromium) each end in `pong from the VTA ... status ok, protocols [tsp, didcomm, rest], nonce echoed`
  after the relationship invite was accepted **[verified]**. `npm run tunnel:probe` (and so `npm run up`) now includes the same ping as a row **[verified]**. The pong is the VTA's answer to a signed
  `messaging/ping/0.1`, routed client -> mediator -> VTA and back, all TSP 1.0.
- **Credential push.** With `npm run tsp:listen` running as the app's `did:key`, `npm run vtc:join` plus `npm run vtc:approve` made the VTC send two `credential-exchange/issue/0.1` frames to that
  DID through the mediator; the listener received and opened both, and the VTC logged `trust-task push delivered ... via=tsp` **[verified]**. The listener must have spoken TSP to the VTC first
  (it forms the relationship; the VTC learns the route from the inbound invite). Not checked: that a wallet could accept and store the credential, or what the frames contain beyond their type.
  The `credentialsDelivered` flag in the approval response and `npm run vtc:status` still reads `false` (probably because it reflects the applicant's DID naming no endpoint, or is read before the push; not
  investigated), so do not read it as the push's outcome: the VTC log and the listener are.
- The mediator login with a `did:key` and the raw-TSP WebSocket from a browser origin work once `MEDIATOR_CORS_ALLOW_ORIGIN` names that origin ([MODES.md](MODES.md)); another origin gets no CORS header **[verified]**.
- A DID that is not on the VTA's ACL is refused (403), and an unsigned document is refused (`ProofRequired`); the client signs, and the app's own `did:key` is on the ACL **[verified]**.

**Why this needed a mediator pin advance.** The VTA (0.65.0) and VTC (0.15.0) speak **TSP 1.0** (`affinidi-tsp` 0.3). The first pin, mediator 0.33.1 (affinidi-tdk-rs `55580615`), only read **Rev 3**
("unsupported TSP major version 1 (this build speaks 0)", HTTP 400 on `/mediator/v1/inbound`), so with it the request reached the VTA but no pong, relationship accept or credential frame ever came back
**[verified failure, 2026-10-30 earlier run]**. The pin is now mediator **0.45.0** (`7e378c03`, the version in the VTA's own lockfile). The release commit is in the separate repository
`affinidi/affinidi-messaging-mediator` (tag `v0.45.0`); the mediator left affinidi-tdk-rs after 0.41 ([PINS.md](PINS.md)). The client therefore packs everything as TSP 1.0 with one package,
`@openvtc/vti-tsp-js` 0.4.0.

**Limits, stated plainly.** Observed with our own open-ACL mediator over quick tunnels, one machine, a handful of runs; a Farm-hosted mediator was not tried **[unverified]**. The `did:peer:2`
applicant with a `TSPTransport` service (a DID that names its own inbox, rather than a `did:key` listening on the mediator socket) was not tried. One extra frame reaches the listener before the accept
(`tsp: signature verification failed`: it is not from the VTC, its sender was not identified); it is ignored and did not affect the results.

## The rest of the gap: no DIDComm client, no wallet-side delivery

The TSP client above is the only messaging client in the kit. Nothing in the pinned npm stack sends or receives a DIDComm message. These were **not** built, and none of them is faked here:

| Idea | Why it is not here | What it needs |
|---|---|---|
| **A DIDComm "send a Trust Task" example** (for example the inbox verifier over messaging) | no DIDComm client (TSP: see above) | a client that resolves DIDs, packs and unpacks DIDComm v2 (authenticated encryption), authenticates to the mediator, and polls or listens (and, for TSP, its own framing). A substantial project of its own; use an existing library rather than writing one |
| **Credential delivery to the member's app** | the frames do arrive at a TSP listener (above), but nothing in the kit parses the credential, verifies it or stores it; the applicant is a plain `did:key` whose DID names no mediator, so the VTC reports `credentialsDelivered:false` **[verified]** | an applicant DID that names a mediator, and a client that unpacks, verifies and stores the credential. A mobile wallet is such a client ([MOBILE-WALLET.md](MOBILE-WALLET.md)); it was not tried |
| **A DIDComm round-trip check** | TSP has one (above). For DIDComm there is no client | a DIDComm client |

What the kit shows for credentials: the community dashboard's membership card says, per mode, why delivery to the app is not confirmed instead of showing a bare `false`, and the admin's
approval response (`npm run vtc:approve`) is where a CLI-driven flow sees the credential; `npm run tsp:listen` shows the push frames arrive.

## Building it yourself

Pick an established DIDComm v2 / TSP library for your language, give your applicant a DID that references the mediator in `.vta/tunnel.json`'s DID, and watch the mediator's
logs (`docker compose --profile messaging logs mediator`) while you send. If you get a message through, record it as **verified** only then, and say in which mode.
The mediator in this kit is open and public for the length of a run: demo data only.

## Mode needs at a glance

| Feature | `local` | `tunnel` | `farm` |
|---|---|---|---|
| Trust Tasks over REST, the dashboard, roles lab, e2e | yes **[verified]** | yes **[verified]** | yes |
| Approvals demo with the software approver ([APPROVALS.md](APPROVALS.md)) | yes **[verified]** | yes **[verified]** | no (you cannot seed a hosted VTA's policy from here) |
| Credential frames reach the member's listener | no | yes, over TSP to a `did:key` listening on the mediator **[verified]** (`npm run tsp:listen`); the flag `credentialsDelivered` still reads false | **[unverified]** |
| A real phone as approver | no | needs a wallet and its messaging; **not tried** | **[unverified]** |
| TSP ping and pong (`npm run tsp:ping`, browser page, `tunnel:probe`) | no | yes **[verified]** (mediator 0.45.0) | **[unverified]** |
| DIDComm application round trip | no | **no client** | **[unverified]** |
