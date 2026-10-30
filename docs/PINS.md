# Pins

Part of the [docs index](README.md). How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md).

`pins.json` records the versions this kit was last validated against: the
verifiable-trust-infrastructure (VTI) refs that the VTA and VTC images are built from, and exact npm versions (no `^`; `.npmrc` sets
`save-exact`, `package-lock.json` is committed). Upstream moves fast; without pins a
participant's or organiser's rebuild silently changes the wire behaviour.

```sh
npm run images:build [vta|vtc|mediator|all]   # build each image from its own pinned ref; tags <image>:<short-sha> and :local (`all` = vta + vtc; the mediator is for MODE=tunnel only)
npm run images:pull [vta|vtc|mediator|all]   # pull the prebuilt images pinned in pins.json (`images` section); see IMAGES.md
npm run pins:check [-- --strict]     # report drift; changes nothing
```

**Prebuilt images are the default, local builds the fallback.** `pins.json` `images` holds the registry, the platforms and, once
published, each image's digest; the image tag is the first 8 characters of the pinned ref. `npm run up` uses a pulled image, else a
local build, else pulls ([IMAGES.md](IMAGES.md), including `IMAGES=local` to flip back). The commands below are the local-build path.

`images:build` exports each pinned ref from a VTI checkout (`VTI_PATH`, default
`../verifiable-trust-infrastructure`) with `git archive`, so whatever is checked out
there is irrelevant. `VTI_LOCAL=1` builds that checkout's working tree instead (for
development; tagged `:local` only). Images carry the label `org.buildathon.vti-ref`.
`pins:check` compares, per image, the label, the binary's own `--version`, that the release tag still resolves to the pinned ref, a running VTC's
`/health` version, the lockfile against `pins.json`, and the newest upstream
`vta-service-v*` / `vtc-service-v*` tags and `npm outdated`. It is read-only.

## Where the images come from

**Current decision: prebuilt images from `ghcr.io/mickens-lab` by default, a local build as the fallback.** `npm run up` uses a pulled image, else a local build, else
pulls ([IMAGES.md](IMAGES.md); `IMAGES=local` flips back). Status, **unverified here**: the organiser reports that amd64 images were already pushed as a stopgap and that the packages
are private until made public; CI will publish multi-arch (the workflow has never been run). Until the packages are public a pull may be refused, so a local build is what is
known to work. This is the one place that says so; the other docs link here, so if the status changes, change this section and the `Prerequisites` bullet in the README.

The local-build (fallback) cold path, exactly (Linux, 12 cores, Docker; times are from this kit's own builds, so treat them as a floor on a laptop):

```sh
# 1. The upstream repository, next to this one (the URL is `vti.repo` in pins.json). `images:build` asks before cloning in a terminal,
#    prints these two commands otherwise, and does it for you only with `npm run images:build -- --clone`.
git clone https://github.com/OpenVTC/verifiable-trust-infrastructure ../verifiable-trust-infrastructure
git -C ../verifiable-trust-infrastructure fetch --tags origin     # the pinned refs must be present
# 2. Build what you need (each image is exported from its own pinned ref; niced; the first build is the slow one)
npm run images:build vta        # about 12 min cold (Rust); local mode needs this
npm run images:build vtc        # about 8 min with warm caches, about 23 min cold; only for WITH_VTC=1 and the community
npm run images:build mediator   # about 12 min cold, tunnel mode only; also needs `cloudflared`
```

Budget several GB of free RAM (the mediator build warns below 8 GB) and about 10 GB of disk for the Rust build layers. If the checkout is somewhere else, set `VTI_PATH`.
The mediator comes from its own repository (`messaging.mediator.repo` in pins.json), which the Dockerfile fetches itself, so no checkout is needed for it.
`npm run doctor` lists which images and which VTI checkout are missing: `npm run images:pull` first, these build commands second. An organiser may also hand out images as files (`docker save` / `docker load`,
or `VTA_IMAGE=...`, see [EVENT.md](EVENT.md)).

## What is pinned now

Two refs, because the two releases come from different monorepo commits:

| Image | Tag | Ref | Why |
|---|---|---|---|
| `vta-buildathon` | `vta-service-v0.65.0` | `fc157f76` | The Farm portal's selector offers it as image `0.65.0-fc157f76`; it is what the Farm runs. |
| `vtc-buildathon` | `vtc-service-v0.15.0` | `93d36996` | A Farm-hosted VTC ran vtc-service 0.15.0 when observed. |

For `MODE=tunnel` ([MODES.md](MODES.md)) there are more pins, in `pins.json` under `messaging`:

| What | Pin | Why |
|---|---|---|
| `mediator-buildathon` | affinidi-messaging-mediator `7e378c03` (tag v0.45.0), features `tsp,secrets-aws` | The mediator release the VTA 0.65.0 lockfile names; it reads TSP 1.0 like the VTA and VTC (the earlier pin, affinidi-tdk-rs `55580615` / v0.33.1, read only Rev 3); built from `docker/mediator.Dockerfile` (heavy: see MODES.md). |
| `redis` | `7.4.6-alpine` | In-memory queue store for the mediator. |
| `cloudflared` | validated 2024.6.1 (host binary, not pinned) | Quick tunnels. |
| VTA build features | `setup,rest,didcomm,tsp,cli-synthesis,aws-secrets,webvh` | The VTI default has no `tsp`; the VTA then refuses `services.tsp = true`. |

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
6. Rebuild and republish the images: run the `images` workflow and record the new digests in `pins.json` ([IMAGES.md](IMAGES.md), [EVENT.md](EVENT.md)). Until a digest is recorded, `pins:check` says so.

Pins are what was last validated, advance deliberately and say why.
