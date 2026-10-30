# Messaging in this kit: what exists, and the gap

`MODE=tunnel` gives the VTA, the VTC and a mediator a public home and turns DIDComm and TSP on ([MODES.md](MODES.md)). This page says what that does and does not let you build today.
Back to the [docs index](README.md).

Labels: **[verified]** observed live (`MODE=tunnel`, pinned images), **[unverified]** not observed.

## What works

- The VTA and VTC connect to the kit's mediator, advertise `DIDCommMessaging` and `TSPTransport` in their DID documents, and `messaging/ping/0.1` reports `tsp`, `didcomm`, `rest` **[verified]**.
  This is a **capability check, not a peer ping.** The status panel's Messaging row reads "transport connected, round trip unverified" and means exactly that.
- A VTC approval queues Trust Task pushes over DIDComm and the mediator accepts them (outbox `Queued` then `Sent`) **[verified]**.
- Everything else (every Trust Task this kit sends) travels over REST, in every mode. A Trust Task is a signed JSON document; REST and messaging only differ in how it is carried.

## The gap: this kit has no DIDComm or TSP client

Nothing in the pinned npm stack (`@openvtc/trust-tasks`, `@openvtc/trust-tasks-proof`, `@noble/*`) sends or receives a DIDComm or TSP message, and the VTA and VTC are
the only peers that do. So these were **not** built, and none of them is faked here:

| Idea | Why it is not here | What it needs |
|---|---|---|
| **A DIDComm/TSP "send a Trust Task" example** (for example the inbox verifier over messaging) | no client to pack, send and receive | a client that resolves DIDs, packs and unpacks DIDComm v2 (authenticated encryption), authenticates to the mediator, and polls or listens (and, for TSP, its own framing). A substantial project of its own; use an existing library rather than writing one |
| **Credential delivery to the member** | the VTC pushes the membership credential to the applicant's *own* messaging endpoint. The kit's applicant is a plain `did:key`, which has no endpoint, so the VTC reports `credentialsDelivered:false` in every mode **[verified]** | an applicant DID that names a mediator, and a client that picks up and unpacks the message. A mobile wallet is such a client ([MOBILE-WALLET.md](MOBILE-WALLET.md)); it was not tried |
| **A round-trip check between two peers** | same missing client | the same |

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
| DIDComm / TSP application round trip | no | **no client** | **[unverified]** |
