# Inbox verifier

A Node server that accepts signed Trust Task documents and applies the SPEC
section 7.2 consumer checks: recipient, freshness, Data Integrity proof,
payload schema, and duplicate-execution (replay) protection. **Runs offline:**
a `did:key` carries its own public key, so no VTA, resolver or network is needed.

```sh
npm run demo -w @buildathon/inbox-verifier     # self-contained end-to-end run

npm start -w @buildathon/inbox-verifier        # server on :4000
npm run send -w @buildathon/inbox-verifier -- --replay   # second terminal
npm run send -w @buildathon/inbox-verifier -- --tamper
```

`demo` starts the server and checks five cases: a good note is accepted, the
same note replayed does not run twice, a tampered payload is `proofInvalid`, a
misaddressed document is `wrongRecipient`, a malformed payload is `malformedRequest`.

## Files

| File | |
|---|---|
| `src/inbox.ts` | The task (`NOTE_SPEC`), the payload check and `consumeInbound` call. Start here. |
| `src/server.ts` | `POST /inbox`, `GET /notes`, `GET /did` |
| `src/send.ts` | Build, sign and POST a note |

## Make it yours

- **Your own task.** `NOTE_TYPE` is a made-up URI. Change the payload type and
  schema, or pin a registry task and generate typed modules with
  `trust-tasks` / `@openvtc/trust-tasks-gen` (see `GETTING-STARTED.md` in
  dtgwg-trust-tasks-tf) and use its `SPEC`.
- **Consequential tasks need the replay guard.** `consequentialChecks(guard)`
  makes a replayed envelope a `duplicate`. `InMemoryReplayGuard` is per process
  and forgets on restart; use a shared store for replicas. Use
  `notConsequentialChecks()` only for tasks that are safe to repeat.
- **Send as your VTA app.** In `send.ts`, replace `newIdentity()` with
  `identityFromCredential(decodeCredential(process.env.VTA_CREDENTIAL!))`.
  Then check the sender against your VTA ACL in the handler for real authorization.
- **Authenticated transports.** Behind a gateway that authenticates the caller,
  use `StaticTransport({ issuer })` so the in-band `issuer` is cross-checked
  (SPEC 4.8.1).
- **Schema validation.** `validateNote` is hand-rolled. Use ajv with the task's
  `payload.schema.json` for anything bigger.
- Document `type` dispatch (SPEC 7.2 item 3) is yours: route on `doc.type` before
  calling `consumeInbound`.
