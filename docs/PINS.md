# Pins

Part of the [docs index](README.md). How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md).

`pins.json` records the versions this kit was last validated against: the
verifiable-trust-infrastructure (VTI) refs that the VTA and VTC images are built from, and exact npm versions (no `^`; `.npmrc` sets
`save-exact`, `package-lock.json` is committed). Upstream moves fast; without pins a
participant's or organiser's rebuild silently changes the wire behaviour.

```sh
npm run images:build [vta|vtc|all]   # build each image from its own pinned ref; tags <image>:<short-sha> and :local
npm run pins:check [-- --strict]     # report drift; changes nothing
```

`images:build` exports each pinned ref from a VTI checkout (`VTI_PATH`, default
`../verifiable-trust-infrastructure`) with `git archive`, so whatever is checked out
there is irrelevant. `VTI_LOCAL=1` builds that checkout's working tree instead (for
development; tagged `:local` only). Images carry the label `org.buildathon.vti-ref`.
`pins:check` compares, per image, the label, the binary's own `--version`, that the release tag still resolves to the pinned ref, a running VTC's
`/health` version, the lockfile against `pins.json`, and the newest upstream
`vta-service-v*` / `vtc-service-v*` tags and `npm outdated`. It is read-only.

## What is pinned now

Two refs, because the two releases come from different monorepo commits:

| Image | Tag | Ref | Why |
|---|---|---|---|
| `vta-buildathon` | `vta-service-v0.65.0` | `fc157f76` | The Farm portal's selector offers it as image `0.65.0-fc157f76`; it is what the Farm runs. |
| `vtc-buildathon` | `vtc-service-v0.15.0` | `93d36996` | A Farm-hosted VTC ran vtc-service 0.15.0 when observed. |

Farm participants must pick the image `0.65.0-fc157f76`, never the portal default (0.56.0).
`npm run farm:check` and `farm:canary` compare the deployed agent's `/openapi.json` `info.version` with this pin and warn loudly.

## To do: version negotiation in the clients

The clients hard-code Trust Task versions (`vta-client`: `acl/grant/0.1`, `trust-task-discovery/0.1`, `auth/*`;
`vtc-client`: manifest 0.4 with a 0.3 fallback, list 0.2 with a 0.1 fallback). They should ask the peer what it serves
(trust-task discovery, or the OpenAPI document) and pick the highest common version, so one kit works across Farm
releases (a 0.67 VTA already drops `acl/grant/0.1` and `trust-task-discovery/0.1`) instead of being fixed to one pin.
Until then, the pins plus the canary's version warning are the guard.

## Advancing (never automatic)

1. `npm run pins:check` and read the upstream changes you would take (VTI CHANGELOG, `vta-service`/`vtc-service` tags).
2. Edit `pins.json` (per image `tag`, `ref`, `version`; `pinnedOn`, `why`; exact npm versions, then `npm install`).
3. `npm run images:build`, then re-verify end to end: `WITH_VTC=1 npm run up`, `npm run hello`,
   `vtc:hello`, `vtc:join`, `vtc:approve`, `npm test`, `npm run typecheck`, then `docker compose --profile vtc down -v`.
4. Fix whatever broke (this is where the starter's scripts and docs change), update the verified/unverified notes in
   [VTC.md](VTC.md), and run `npm run farm:probe` and read the [farm note](FARM.md#farm-versions-observed).
5. Add one line to [PINS_LOG.md](../PINS_LOG.md): date, old -> new, why, what was re-verified.
6. Rebuild and republish the images ([EVENT.md](EVENT.md)).

Pins are what was last validated, advance deliberately and say why.
