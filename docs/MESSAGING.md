# Messaging in this kit: what exists, and the gap

`MODE=tunnel` gives the VTA, the VTC and a mediator a public home and turns DIDComm and TSP on ([MODES.md](MODES.md)). This page says what that does and does not let you build today.
Back to the [docs index](README.md).

Labels: **[verified]** observed live (`MODE=tunnel`, pinned images), **[unverified]** not observed.

## What works

- The VTA and VTC connect to the kit's mediator, advertise `DIDCommMessaging` and `TSPTransport` in their DID documents, and `messaging/ping/0.1` reports `tsp`, `didcomm`, `rest` **[verified]**.
  This is a **capability check, not a peer ping.** The status panel's Messaging row reads "transport connected, round trip unverified" and means exactly that.
- A VTC approval queues Trust Task pushes over DIDComm and the mediator accepts them (outbox `Queued` then `Sent`) **[verified]**.
- Everything else (every Trust Task this kit sends) travels over REST, in every mode. A Trust Task is a signed JSON document; REST and messaging only differ in how it is carried.

## TSP client (Stage G): what runs, and where it stops

`packages/tsp-client` is a small TypeScript TSP client (built on `@openvtc/pnm-core` and `@openvtc/vti-tsp-js`, Apache-2.0, pinned exactly). `npm run tsp:ping` and the page
`templates/tsp-ping` (`npm run tsp:ping:browser` drives it in headless Chromium) log in to the mediator as the app's `did:key`, resolve the VTA's `did:webvh` to TSP keys, form
a TSP relationship, and send a signed `messaging/ping/0.1` in the TSP binding envelope (`{"type": ".../binding/tsp/0.1/envelope", "document": <Trust Task>}`).

**Verified live (`MODE=tunnel`, pinned images, from Node and from headless Chromium):**
- The mediator login with a `did:key` and the raw-TSP WebSocket from a browser origin work once `MEDIATOR_CORS_ALLOW_ORIGIN` names that origin ([MODES.md](MODES.md)); another origin gets no CORS header **[verified]**.
- The request leg: the VTA unpacks the client's TSP 1.0 message, records the relationship, and dispatches `messaging/ping/0.1` with status 200 (its log says so) **[verified]**. A DID
  that is not on the VTA's ACL is refused (403), and an unsigned document is refused (`ProofRequired`); the client signs, and the app's own `did:key` is on the ACL **[verified]**.
- The VTC, after the client had spoken TSP to it, chose TSP (`via=tsp`) for its credential push to that `did:key` and queued it **[verified]**.

**Not working: the reply leg. No pong has been received, from Node or from the browser.** The cause was found in the logs, not guessed: the pinned VTA (0.65.0) and VTC speak
**TSP 1.0** (`affinidi-tsp` 0.3, mediator 0.45 in their own lockfile), and the pinned mediator (0.33.1, `55580615`) only reads **Rev 3** ("unsupported TSP major version 1 (this build
speaks 0)"; it answers HTTP 400 on `/mediator/v1/inbound`). So the VTA's pong, its relationship accept, and the VTC's credential frames are all refused by the mediator and never reach
the client. The client works around the other direction by packing the outer routing layer as Rev 3 (to the mediator) around a TSP 1.0 inner message (to the VTA), which is why two
`vti-tsp-js` versions are pinned ([PINS.md](PINS.md)). `npm run tsp:listen` (a listener on the app's mediator socket) saw no frame while a join was approved and the VTC retried its push **[verified]**.

**What would fix it (not done):** a mediator build that speaks TSP 1.0. An attempt here to build mediator 0.45.0 failed at the first step: the release commit recorded on crates.io is not
fetchable from the upstream repository, there is no git tag for it, and its setup tool is not published as a crate, so a pin advance needs the upstream commit and a new recipe for
`mediator-setup`. Until then the pong and the credential push stay **[unverified]**; the status panel keeps saying "round trip unverified", which is still true. Not tried: the
`did:peer:2` applicant with a `TSPTransport` service (it cannot help while the mediator refuses the VTC's frames).

## The rest of the gap: no DIDComm client, no delivery

Nothing in the pinned npm stack (`@openvtc/trust-tasks`, `@openvtc/trust-tasks-proof`, `@noble/*`) sends or receives a DIDComm or TSP message, and the VTA and VTC are
the only peers that do. So these were **not** built, and none of them is faked here:

| Idea | Why it is not here | What it needs |
|---|---|---|
| **A DIDComm "send a Trust Task" example** (for example the inbox verifier over messaging) | no DIDComm client (TSP: see above) | a client that resolves DIDs, packs and unpacks DIDComm v2 (authenticated encryption), authenticates to the mediator, and polls or listens (and, for TSP, its own framing). A substantial project of its own; use an existing library rather than writing one |
| **Credential delivery to the member** | the VTC pushes the membership credential to the applicant's *own* messaging endpoint. The kit's applicant is a plain `did:key`, which has no endpoint, so the VTC reports `credentialsDelivered:false` in every mode **[verified]** | an applicant DID that names a mediator, and a client that picks up and unpacks the message. A mobile wallet is such a client ([MOBILE-WALLET.md](MOBILE-WALLET.md)); it was not tried |
| **A round-trip check between two peers** | for TSP the client exists; the mediator pin refuses the VTA's TSP 1.0 replies (above). For DIDComm there is no client | a mediator that speaks TSP 1.0, or a DIDComm client |

What you get instead for credentials: the community dashboard's membership card says, per mode, why delivery is not happening instead of showing a bare `false`, and the admin's
approval response (`npm run vtc:approve`) is the only place a CLI-driven flow sees the credential.

## Building it yourself

Pick an established DIDComm v2 / TSP library for your language, give your applicant a DID that references the mediator in `.vta/tunnel.json`'s DID, and watch the mediator's
logs (`docker compose --profile messaging logs mediator`) while you send. If you get a message through, record it as **verified** only then, and say in which mode.
The mediator in this kit is open and public for the length of a run: demo data only.

## Mode needs at a glance

| Feature | `local` | `tunnel` | `farm` |
|---|---|---|---|
| Trust Tasks over REST, the dashboard, roles lab, e2e | yes **[verified]** | yes **[verified]** | yes |
| Approvals demo with the software approver ([APPROVALS.md](APPROVALS.md)) | yes **[verified]** | yes **[verified]** | no (you cannot seed a hosted VTA's policy from here) |
| Credential reaches the member | no | not with this kit's applicant **[verified: `credentialsDelivered:false`]** | **[unverified]** |
| A real phone as approver | no | needs a wallet and its messaging; **not tried** | **[unverified]** |
| TSP ping (request reaches the VTA) | no | yes **[verified]** (`npm run tsp:ping`, browser page) | **[unverified]** |
| TSP pong comes back | no | **no: mediator pin refuses TSP 1.0 replies** **[verified failure]** | **[unverified]** |
| DIDComm application round trip | no | **no client** | **[unverified]** |
