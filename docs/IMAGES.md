# Images: prebuilt by default, local build as the fallback

Part of the [docs index](README.md). Pins and drift checks: [PINS.md](PINS.md).

The VTA, VTC and mediator images are Rust release builds (about 12 minutes each on a 12-core desktop, more on a laptop). To
skip that, the kit can run **prebuilt images** published to the GitHub Container Registry (GHCR) by CI. If one is not
available, everything still works by building locally, exactly as before.

> **Status, stated plainly.** The workflow that publishes the images, `.github/workflows/images.yml`, has been written and
> statically checked (it parses, its permissions and action pins are tested, its plan step runs locally) but **has never been
> run**. The organiser reports that amd64 images were pushed by hand as a stopgap and that the packages are private until made
> public; CI is to publish multi-arch. **None of that was observed here** (no registry access from this tree), so until the
> packages are public a pull may be refused, and `npm run up` then says so and names the local build. Everything below about the
> registry is the design, not an observation. The first workflow run is the real test.

## What a participant does

```sh
npm ci
npm run images:pull      # optional: fetch the pinned images now (about 170 to 200 MB each)
npm run up               # uses a pulled image, else a local build, else pulls
```

`npm run up` decides per image, in this order (`scripts/lib/images.ts`):

1. `VTA_IMAGE` / `VTC_IMAGE` / `MEDIATOR_IMAGE` set: that exact image, nothing else is tried.
2. `IMAGES=local`: only the locally built `<name>:local`. Never touches the network.
3. Otherwise (`IMAGES` unset or `auto`): the pinned registry image if it is already here, else a local build (`<name>:local`) if you
   have one, else it **pulls** the pinned registry image.
4. `IMAGES=registry`: the pinned registry image only (pulled if absent), no fallback to a local build.

| Variable | Effect |
|---|---|
| `IMAGES=local` | Force the old behaviour: build with `npm run images:build`, use `:local`. The easy flip back. |
| `IMAGES=registry` | Insist on prebuilt images. |
| `IMAGE_REGISTRY=host/org` | Pull from another registry or org (a mirror, a fork's packages, a local `registry:2`). Default: `pins.json` `images.registry`. |
| `VTA_IMAGE`, `VTC_IMAGE`, `MEDIATOR_IMAGE` | An exact image (for example one loaded with `docker load`). |

These can go in `.env` or the shell. `npm run reset` removes only the keys the kit wrote to `.env`, so your own lines stay.
Bare `docker compose up` (without `npm run up`) knows nothing of the registry and uses `<name>:local`; use `npm run up`.

If the pull fails (no network, not published yet, package still private, wrong CPU architecture), the message says why and names
the local build command. `npm run images:pull -- --check` shows, without any network, what is present and what would be pulled.

### Where the names come from

`pins.json` stays the single source of truth. The image is `<registry>/<name>:<first 8 characters of the pinned upstream commit>`:

| Image | Name | Tag from | Example |
|---|---|---|---|
| VTA | `vta-buildathon` | `vti.vta.ref` | `ghcr.io/mickens-lab/vta-buildathon:fc157f76` |
| VTC | `vtc-buildathon` | `vti.vtc.ref` | `ghcr.io/mickens-lab/vtc-buildathon:93d36996` |
| mediator | `mediator-buildathon` | `messaging.mediator.ref` | `ghcr.io/mickens-lab/mediator-buildathon:7e378c03` |

`pins.json` `images.<kind>.digest` (initially `null`) is the multi-arch index digest. Once recorded, `images:pull` and `up` pull by
digest (`<registry>/<name>@sha256:...`), so a moved tag cannot change what runs. Until it is recorded they pull by tag and
`pins:check` warns "no digest in pins.json" (`images:pull -- --by-digest` refuses the tag fallback).

### Checks

`npm run pins:check` reads the labels of a pulled image: the upstream ref label (`org.buildathon.vti-ref` or
`org.buildathon.mediator-ref`) must equal the pin, the VTA's `org.buildathon.vta-features` must equal the pinned list (it includes
`tsp`), and, if a digest is recorded, the local copy must have that digest. Other labels the workflow sets:
`org.opencontainers.image.source` (this repository, which is what links the package to it on GHCR), `.revision` (this repo's commit that
built it), `.licenses` (Apache-2.0, the licence of the software built in), `.version`, `org.buildathon.pinned-ref` and
`org.buildathon.upstream-source`.

For a future `doctor`: `scripts/lib/images.ts` exports `imageStatus(imageSpecs(pins()), realDocker, currentMode())`, which returns
per image `ready | pullable | missing` with a fix command, and pulls nothing.

### Checking the images

Pulling is not trusting. `npm run images:verify` checks a pulled image against `pins.json` and the workflow's signature and attestations, and `npm run images:pull -- --by-digest` pulls only by the pinned digest. How, and what that does and does not prove: [VERIFY.md](VERIFY.md). The workflow attaches an SBOM, a build provenance attestation and a keyless cosign signature (jobs `attest` and `sign`); these have **never run** and are unverified until the first real run.

## What an organiser does: publishing

Publishing happens in GitHub Actions with the built-in `GITHUB_TOKEN` (`packages: write`). No personal token is involved, and no
credential is stored in this repository. (A personal token needs the `write:packages` scope; the `gh` token on the organiser's
machine may lack it. The alternative is `gh auth refresh -s write:packages`, then a manual `docker login ghcr.io` and push. The workflow
route is preferred because the images are then built from a clean checkout, labelled, multi-arch and recorded.)

### First run

1. **Check the org allows it.** Org owners: Organisation settings > Packages > "Package creation": members must be allowed to create
   **public** packages (and the org's plan matters little: public packages on GHCR are free of charge; the repository is public). Without
   this, the first push fails with a permission error and an owner can create the package or change the setting. This is **unverified**
   for this org.
2. **Actions must be enabled** for the repository, and workflows may need "Read and write permissions" under Settings > Actions > General >
   Workflow permissions (the workflow requests `packages: write` itself, but an org policy can cap it).
3. **Dry run first.** Actions > images > Run workflow, `images` = `vta` (the quickest to learn from), `push` = **false**. This builds on the
   native amd64 and arm64 runners, runs `--version` and checks the labels, and pushes nothing.
4. **Publish.** Run it again with `push` = true and `images` = `all`, or push a tag named `images-<date>`. Expect roughly 25 to 45
   minutes per image on GitHub's 4-vCPU runners (an estimate, not measured), in parallel. See the timeout notes at the top of the workflow.
5. **Make the packages public.** New packages are **private** by default. For each of the three: GitHub > the org > Packages > the package >
   Package settings > Change visibility > Public. Because the images carry the `org.opencontainers.image.source` label for this repository,
   the package is linked to the repository automatically on first push; if it is not, use "Connect repository" on the package page.
   (Linking is also what lets the repository's Actions keep pushing new versions.)
6. **Check the signatures, then record the digests.** First `npm run images:pull`, then `npm run images:verify` (needs `gh` or `cosign`; [VERIFY.md](VERIFY.md)): expect `INCOMPLETE` only for the missing digest, and no `FAIL`. The run's summary lists each image's digest and a `jq` command that sets it in `pins.json`; the same data is
   the `images-digests` artifact. Commit the change (`git commit -s`) so participants pull by digest, and run `images:verify` again: now it can say `VERIFIED`.
7. **Verify from a clean machine**, with no local images: `docker logout ghcr.io` (the package is public, no login should be needed), then
   `npm ci && npm run images:pull && npm run pins:check && npm run up && npm run hello`. On an arm64 machine (Apple silicon, an arm64 server)
   as well as amd64: the arm64 image is built on a native arm64 runner and is **untested** until someone does this.

### When pins advance

Advance a pin per [PINS.md](PINS.md), then re-run the workflow (tag `images-<date>`), record the new digests, and commit. The tag in the
registry changes with the ref, so an old tag stays available for those who need it. The images are for development only: the mediator is
open-ACL by design and the VTA stores a plaintext seed ([MODES.md](MODES.md), [SECURITY.md](SECURITY.md)).

### If something fails

| Symptom | Likely cause |
|---|---|
| Push fails with 403 or "denied" at the first push | Package creation by members is off in the org (step 1), or an org policy caps the token's permissions (step 2). |
| `permission_denied: read_package` when pushing a package that already exists | The package was pushed by hand, so the repository's workflow token has no access to it. Either delete that package and let the workflow create it, or open the package settings, "Manage Actions access", and add this repository with the Write role. Seen on the first real run. |
| `cannot allocate memory` or "the runner has received a shutdown signal" during a Rust build | The runner ran out of memory. The build job adds 16 GB of swap before building; if it still happens, build fewer images per run (`images=vta`, then `vtc`, then `mediator`). |
| arm64 jobs wait for ever | The `ubuntu-24.04-arm` runner is not available to the organisation. See the QEMU fallback in the workflow comments (hours, not minutes), or publish amd64 only. |
| A build leg is cancelled at its timeout | The runner was slower than the estimate. Raise `timeout` in the plan step, and record the real time in this file. |
| `fetch ... origin <sha>` fails in the VTA or VTC leg | The pinned commit is not reachable from the upstream repository (force-pushed or deleted). Re-pin ([PINS.md](PINS.md)). |
| `pull access denied` for a participant | The package is still private (step 5), or `IMAGE_REGISTRY` points elsewhere. |
| `no matching manifest for linux/...` | A CPU architecture that was not built (only amd64 and arm64 are). |
| `pins:check` reports a digest drift | The registry tag moved or the local copy is old: `npm run images:pull -- vta --force`. |

## What is verified and what is not

Verified here (no network, no registry):

- the resolution logic and its fallbacks, the friendly pull errors, the label and digest checks (unit tests, `scripts/test/images.test.ts`);
- `images:verify` and `images:compare` against a mocked `docker`/`gh`/`cosign` (`scripts/test/verify.test.ts`), and live against the local images (labels only; the hand-pushed stopgap images correctly fail `label origin`);
- the workflow file parses, its permissions are read-only except `packages: write` on the publishing jobs and `id-token`/`attestations: write` only on `attest` and `sign`, every action is pinned to a
  commit SHA, no expression is interpolated into a script, and its plan step, run locally against `pins.json`, produces the expected
  six build legs (`scripts/test/images-workflow.test.ts`);
- `npm run images:pull` against an unreachable registry fails with the friendly message and the local build named; `npm run up` with
  local images starts a working VTA and `npm run hello` passes.

**Not verified:** that the workflow runs on GitHub at all (including the `attest` and `sign` jobs, `anchore/sbom-action`, `actions/attest-*` and `cosign` against GHCR, and that `gh attestation verify` / `cosign verify` accept the result with the identity `images:verify` expects); that the actions' pinned versions behave as written; that the arm64 images
build, start and work; build times on the runners; that the org permits package creation; that a participant can pull anonymously; the
digest flow end to end; `actionlint` was not available, so only the YAML parse and a shell syntax check stood in for it.
