// Which image a service runs: a prebuilt registry image (docs/IMAGES.md) or a local build.
// The decisions are pure and take a `Docker` object, so they are tested without Docker or a network;
// `realDocker` and `useImages` are the thin side-effecting parts.
//
// Environment:
//   IMAGES=auto|local|registry   auto (default): while pins.json images.available is false this is `local`. When true: the pinned
//                                registry image if present locally, else a local build if present, else pull.
//                                local: only `<image>:local` (never touches the network).
//                                registry: only the pinned registry image (pull if absent, no fallback); works while
//                                `available` is false for people who have access (docker login first).
//   IMAGE_REGISTRY=host/org      replaces pins.json images.registry (a mirror, or your own fork's packages).
//   VTA_IMAGE / VTC_IMAGE / MEDIATOR_IMAGE   an exact image to use; beats everything above.
import { spawnSync } from "node:child_process";
import type { Pins } from "../pins.js";

export type ImageKind = "vta" | "vtc" | "mediator";
export const IMAGE_KINDS: readonly ImageKind[] = ["vta", "vtc", "mediator"];
export type ImagesMode = "auto" | "local" | "registry";

/** pins.json images.available: can participants pull the prebuilt images? (docs/IMAGES.md) */
export const imagesAvailable = (p: Pins): boolean => p.images.available === true;

/** Said wherever a prebuilt image is asked for while `available` is false. */
export const UNAVAILABLE_NOTE = "Prebuilt images are not generally available yet (the organisation does not allow public packages), so the kit builds them locally. IMAGES=registry is for people whose account can pull the packages (docker login ghcr.io first); docs/IMAGES.md.";

export interface ImageSpec {
  kind: ImageKind;
  /** Environment variable that compose reads (and that overrides everything). */
  envVar: string;
  /** Image name, as built locally and as published. */
  name: string;
  /** Upstream commit this image is built from (pins.json). */
  ref: string;
  version: string;
  /** `<name>:local`, what `images:build` tags and compose defaults to. */
  local: string;
  /** `<registry>/<name>`. */
  repo: string;
  /** `<repo>:<short ref>`. */
  tagged: string;
  /** Digest from pins.json images.<kind>.digest, if recorded. */
  digest: string | null;
  /** What to pull and run: `<repo>@<digest>` when a digest is pinned, else the tag. */
  pinned: string;
  /** Image label that carries the upstream ref (read by pins:check). */
  refLabel: string;
  /** The command that builds it locally. */
  buildCmd: string;
}

export const REF_LABEL = { vta: "org.buildathon.vti-ref", vtc: "org.buildathon.vti-ref", mediator: "org.buildathon.mediator-ref" } as const;
export const FEATURES_LABEL = "org.buildathon.vta-features";
const ENV_VAR = { vta: "VTA_IMAGE", vtc: "VTC_IMAGE", mediator: "MEDIATOR_IMAGE" } as const;
const BUILD_CMD = {
  vta: "npm run images:build vta",
  vtc: "npm run images:build vtc",
  mediator: "npm run images:build mediator   (about 15 min, see docs/MODES.md)",
} as const;

/** `IMAGES` value; throws on anything but auto|local|registry. */
export function parseImagesMode(raw: string | undefined): ImagesMode {
  const m = (raw ?? "").trim().toLowerCase();
  if (m === "" || m === "auto") return "auto";
  if (m === "local" || m === "registry") return m;
  throw new Error(`IMAGES must be "auto", "local" or "registry", got "${raw}".`);
}

/** The registry prefix: IMAGE_REGISTRY if set (validated, no trailing slash), else pins.json. */
export function registryBase(p: Pins, override?: string): string {
  const r = (override ?? "").trim().replace(/\/+$/, "") || p.images.registry;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?(\/[a-z0-9]([a-z0-9._-]*[a-z0-9])?)*$/.test(r)) {
    throw new Error(`IMAGE_REGISTRY "${r}" is not a registry path like ghcr.io/my-org (lower case, no scheme).`);
  }
  return r;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/;

export function imageSpecs(p: Pins, registryOverride?: string): Record<ImageKind, ImageSpec> {
  const reg = registryBase(p, registryOverride);
  const make = (kind: ImageKind, name: string, ref: string, version: string): ImageSpec => {
    const digest = p.images[kind].digest ?? null;
    if (digest !== null && !SHA256.test(digest)) throw new Error(`pins.json images.${kind}.digest must be null or sha256:<64 hex>, got "${digest}".`);
    const repo = `${reg}/${name}`;
    const tagged = `${repo}:${ref.slice(0, 8)}`;
    return {
      kind, envVar: ENV_VAR[kind], name, ref, version, local: `${name}:local`, repo, tagged, digest,
      pinned: digest ? `${repo}@${digest}` : tagged, refLabel: REF_LABEL[kind], buildCmd: BUILD_CMD[kind],
    };
  };
  const { vta, vtc } = p.vti;
  const m = p.messaging.mediator;
  return {
    vta: make("vta", vta.image, vta.ref, vta.version),
    vtc: make("vtc", vtc.image, vtc.ref, vtc.version),
    mediator: make("mediator", m.image, m.ref, m.version),
  };
}

// --- Docker access ------------------------------------------------------------------------------------

export interface PullResult { ok: boolean; stderr: string }
export interface Docker {
  has(ref: string): boolean;
  pull(ref: string): PullResult;
}

export const realDocker: Docker = {
  has: (ref) => spawnSync("docker", ["image", "inspect", ref], { stdio: "ignore", timeout: 30_000 }).status === 0,
  pull: (ref) => {
    // Bounded: a stalled pull must not hang `up` for ever.
    const r = spawnSync("docker", ["pull", ref], { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8", timeout: 20 * 60_000 });
    return { ok: r.status === 0, stderr: (r.stderr ?? "") + (r.error ? String(r.error.message) : "") };
  },
};

/** Turn a failed `docker pull` into one friendly line plus the way out. Pure. */
export function friendlyPullError(stderr: string, ref: string): string {
  const s = stderr.toLowerCase();
  const why =
    /cannot connect to the docker daemon|is the docker daemon running|permission denied while trying to connect/.test(s) ? "Docker is not running or not reachable (start Docker, or check your user may run it)."
    : /no such host|dial tcp|lookup .* on|temporary failure in name resolution|network is unreachable|i\/o timeout|tls handshake|connection refused|connection reset|timed out|etimedout|eof/.test(s) ? "the registry could not be reached (no network, a proxy, or the registry is down)."
    : /manifest unknown|not found|name unknown|no matching manifest/.test(s) ? `the image ${ref} is not published (or not for this CPU architecture). It may not have been published yet: ask the organiser.`
    : /denied|unauthorized|forbidden|requested access to the resource is denied/.test(s) ? "the registry refused access. The package may still be private (an organiser must make it public), or the name is wrong."
    : "docker pull failed (details below).";
  return `could not pull ${ref}: ${why}`;
}

export type Source = "env" | "registry" | "local-build" | "pulled";
export type Resolution =
  | { ok: true; kind: ImageKind; ref: string; source: Source }
  | { ok: false; kind: ImageKind; message: string; needsPull?: boolean; detail?: string };

export interface ResolveOpts {
  mode: ImagesMode;
  /** Value of the per-image env override (VTA_IMAGE, ...), if set. */
  override?: string;
  /** Allow `docker pull`. False = decide from what is present locally only. */
  pull: boolean;
  /** pins.json images.available (default true). False turns `auto` into `local`: no pull, no registry tag. */
  available?: boolean;
}

/**
 * Decide what `kind` runs. Order: explicit override; then by mode (see the top of this file).
 * Never throws; a failure carries a message that says what to do next.
 */
export function resolveImage(spec: ImageSpec, docker: Docker, o: ResolveOpts): Resolution {
  const { kind } = spec;
  const implicitLocal = o.available === false && o.mode === "auto";
  const mode: ImagesMode = implicitLocal ? "local" : o.mode;
  const build = `build it: ${spec.buildCmd}`;
  const tryPull = (ref: string, fallback: string): Resolution => {
    const r = docker.pull(ref);
    if (r.ok && docker.has(ref)) return { ok: true, kind, ref, source: "pulled" };
    const note = o.available === false ? `\n  ${UNAVAILABLE_NOTE}` : "";
    return { ok: false, kind, message: `${friendlyPullError(r.stderr, ref)}\n  ${fallback}${note}`, detail: r.stderr.trim() || undefined };
  };

  if (o.override) {
    if (docker.has(o.override)) return { ok: true, kind, ref: o.override, source: "env" };
    if (o.pull && mode !== "local") return tryPull(o.override, `${spec.envVar} is set, so nothing else is tried. Unset it to use the pinned image.`);
    return { ok: false, kind, message: `${spec.envVar}=${o.override} is not present locally (docker load it, docker pull it, or unset ${spec.envVar}).` };
  }
  if (mode === "local") {
    if (docker.has(spec.local)) return { ok: true, kind, ref: spec.local, source: "local-build" };
    return {
      ok: false, kind,
      message: implicitLocal
        ? `${spec.local} is not built yet: ${build}. ${UNAVAILABLE_NOTE}`
        : `${spec.local} is not present (IMAGES=local): ${build}, or unset IMAGES to use the prebuilt image.`,
    };
  }
  if (docker.has(spec.pinned)) return { ok: true, kind, ref: spec.pinned, source: "registry" };
  if (mode === "auto" && docker.has(spec.local)) return { ok: true, kind, ref: spec.local, source: "local-build" };
  if (!o.pull) {
    return { ok: false, kind, needsPull: true, message: `${spec.pinned} is not present locally: npm run images:pull ${kind}${mode === "auto" ? `, or ${build}` : ""}.` };
  }
  return tryPull(spec.pinned, mode === "auto" ? `Fallback: ${build} (or IMAGES=local to skip the registry).` : "IMAGES=registry allows no fallback; unset it to build locally.");
}

export interface StatusRow { kind: ImageKind; ref: string; state: "ready" | "pullable" | "missing"; source?: Source; fix?: string }

/**
 * For `doctor`-style reports: what each image is, without pulling anything.
 * ready = usable now; pullable = would be pulled by `up`; missing = IMAGES=local (or an override) with nothing present.
 */
export function imageStatus(specs: Record<ImageKind, ImageSpec>, docker: Docker, mode: ImagesMode, kinds: readonly ImageKind[] = IMAGE_KINDS, overrides: Partial<Record<ImageKind, string>> = {}, available = true): StatusRow[] {
  return kinds.map((kind) => {
    const spec = specs[kind];
    const r = resolveImage(spec, docker, { mode, override: overrides[kind], pull: false, available });
    if (r.ok) return { kind, ref: r.ref, state: "ready", source: r.source };
    if (r.needsPull) return { kind, ref: spec.pinned, state: "pullable", fix: `npm run images:pull ${kind}` };
    return { kind, ref: overrides[kind] ?? spec.local, state: "missing", fix: r.message };
  });
}

// --- side-effecting entry points ------------------------------------------------------------------------

export function currentMode(get: (k: string) => string | undefined = (k) => process.env[k]): ImagesMode {
  return parseImagesMode(get("IMAGES"));
}

const overrideOf = (spec: ImageSpec, get: (k: string) => string | undefined) => get(spec.envVar)?.trim() || undefined;

/**
 * Resolve the given images and export the result as VTA_IMAGE / VTC_IMAGE / MEDIATOR_IMAGE for compose and child
 * processes. With `pull`, a missing registry image is pulled (network). Returns every resolution; callers decide
 * whether a failure is fatal.
 */
export function useImages(p: Pins, kinds: readonly ImageKind[], opts: { pull: boolean; quiet?: boolean; docker?: Docker; get?: (k: string) => string | undefined } ): Resolution[] {
  const get = opts.get ?? ((k) => process.env[k]);
  const docker = opts.docker ?? realDocker;
  const specs = imageSpecs(p, get("IMAGE_REGISTRY"));
  const mode = currentMode(get);
  if (mode === "registry" && !imagesAvailable(p) && !opts.quiet) console.log(`note: IMAGES=registry while prebuilt images are not generally available. ${UNAVAILABLE_NOTE}`);
  return kinds.map((kind) => {
    const spec = specs[kind];
    const r = resolveImage(spec, docker, { mode, override: overrideOf(spec, get), pull: opts.pull, available: imagesAvailable(p) });
    if (r.ok) {
      process.env[spec.envVar] = r.ref;
      if (!opts.quiet && r.source !== "env") console.log(`image ${kind}: ${r.ref} (${r.source === "local-build" ? "local build" : r.source === "pulled" ? "pulled just now" : "prebuilt, already here"})`);
    }
    return r;
  });
}

// --- pins:check -------------------------------------------------------------------------------------------

export interface CheckRow { ok: boolean | null; what: string; detail: string }

/**
 * Compare one image's labels (and, for a registry image, its repo digests) with pins.json. Pure.
 * `origin` "local" = `<name>:local` from images:build (unlabelled is only informational); "registry" = the pinned
 * registry image, which the publish workflow always labels (a missing label there is drift).
 */
export function checkImageLabels(spec: ImageSpec, p: Pins, ref: string, origin: "local" | "registry", labels: Record<string, string>, repoDigests: string[]): CheckRow[] {
  const rows: CheckRow[] = [];
  const miss = origin === "registry" ? false : null;
  const got = labels[spec.refLabel];
  rows.push(
    got ? { ok: got === spec.ref, what: `image ${ref} ref`, detail: got === spec.ref ? got.slice(0, 8) : `label ${got.slice(0, 8)}, pinned ${spec.ref.slice(0, 8)}` }
        : { ok: miss, what: `image ${ref} ref`, detail: `no ${spec.refLabel} label${origin === "local" ? " (not built by images:build)" : ""}; pinned ${spec.ref.slice(0, 8)}` },
  );
  if (spec.kind === "vta" && p.vti.vta.features) {
    const f = labels[FEATURES_LABEL];
    rows.push(f !== undefined && f !== "" ? { ok: f === p.vti.vta.features, what: `image ${ref} features`, detail: f === p.vti.vta.features ? "match" : `built with ${f}, pinned ${p.vti.vta.features}` }
                                          : { ok: miss, what: `image ${ref} features`, detail: `no ${FEATURES_LABEL} label` });
  }
  if (origin === "registry") {
    const has = spec.digest !== null && repoDigests.includes(`${spec.repo}@${spec.digest}`);
    rows.push(spec.digest
      ? { ok: has, what: `image ${ref} digest`, detail: has ? spec.digest.slice(0, 19) : `pins.json records ${spec.digest.slice(0, 19)}; this copy is ${repoDigests.map((d) => d.split("@")[1]?.slice(0, 19)).join(", ") || "unknown"} (npm run images:pull -- ${spec.kind} --force)` }
      : { ok: null, what: `image ${ref} digest`, detail: "pins.json records no digest yet (docs/IMAGES.md)" });
    const rev = labels["org.opencontainers.image.revision"];
    if (rev) rows.push({ ok: null, what: `image ${ref} built by`, detail: `starter revision ${rev.slice(0, 8)}` });
  }
  return rows;
}

// --- labels both builds record (images:build here, the images workflow on GitHub) -----------------------------

export const DOCKERFILE_LABEL = "org.buildathon.dockerfile-sha256";
export const ORIGIN_LABEL = "org.buildathon.build-origin";

/**
 * The labels an image of `kind` carries about what it was built from, as a local build records them.
 * The workflow records the same keys and values (its extra org.opencontainers.* labels and build-origin differ),
 * so `images:compare` can line a local build up against the published one. `ref` is "local" for VTI_LOCAL=1.
 */
export function buildLabels(kind: ImageKind, p: Pins, o: { dockerfileSha256: string; ref?: string }): Record<string, string> {
  const spec = imageSpecs(p)[kind];
  const upstream = kind === "mediator" ? p.messaging.mediator.repo : p.vti.repo;
  const labels: Record<string, string> = {
    "org.buildathon.upstream-source": upstream,
    "org.buildathon.pinned-ref": o.ref ?? spec.ref,
    [spec.refLabel]: o.ref ?? spec.ref,
    [DOCKERFILE_LABEL]: o.dockerfileSha256,
    [ORIGIN_LABEL]: "local",
  };
  if (kind === "vta" && p.vti.vta.features) labels[FEATURES_LABEL] = p.vti.vta.features;
  return labels;
}

/** `--label k=v` pairs for `docker build`. */
export const labelArgs = (labels: Record<string, string>): string[] => Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]);

// --- pulling by digest ----------------------------------------------------------------------------------------

/** Kinds whose pin has no recorded digest (so they are pulled by a tag that the publisher can move). */
export const undigested = (specs: Record<ImageKind, ImageSpec>, kinds: readonly ImageKind[] = IMAGE_KINDS): ImageKind[] => kinds.filter((k) => specs[k].digest === null);

export const NO_DIGEST_WARNING = "pins.json records no digest, so this is pulled by TAG. A tag can be moved to different contents by whoever can push to the registry. Run the images workflow, record the digests in pins.json, then pull with --by-digest (docs/VERIFY.md).";

/** What `images:pull` prints while images.available is false and IMAGES=registry was not asked for. Pure. */
export function pullUnavailableMessage(specs: Record<ImageKind, ImageSpec>, kinds: readonly ImageKind[], why: string): string {
  return [
    "Prebuilt images are not available yet, so there is nothing to pull.",
    `  Why: ${why}`,
    "",
    "Build the images on your own machine instead (once; later runs reuse them):",
    "  npm run setup                 # builds what your MODE needs: VTA + VTC, plus the mediator for MODE=tunnel",
    ...kinds.map((k) => `  ${specs[k].buildCmd}`),
    "  (needs a checkout of the upstream VTI repository; see docs/IMAGES.md and docs/PINS.md#where-the-images-come-from)",
    "",
    "If your account can already pull the organisation's packages (an organisation member), log in and ask for them explicitly:",
    "  docker login ghcr.io",
    "  IMAGES=registry npm run images:pull && IMAGES=registry npm run up",
    "Nothing was pulled.",
  ].join("\n");
}

/**
 * What `images:pull` pulls. `byDigest` refuses to fall back to a tag: it is for people who want the pin or nothing.
 * Returns the reference to pull, or a message saying why not.
 */
export function pullTarget(spec: ImageSpec, byDigest: boolean): { ok: true; ref: string; byTag: boolean } | { ok: false; message: string } {
  if (spec.digest) return { ok: true, ref: spec.pinned, byTag: false };
  if (byDigest) return { ok: false, message: `${spec.kind}: --by-digest was asked for but pins.json records no digest for it (images.${spec.kind}.digest is null). Nothing was pulled. The digest appears after the images workflow has run; see docs/IMAGES.md. Without --by-digest the tag ${spec.tagged} is pulled, unverified.` };
  return { ok: true, ref: spec.tagged, byTag: true };
}
