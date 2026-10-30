// Which image a service runs: a prebuilt registry image (docs/IMAGES.md) or a local build.
// The decisions are pure and take a `Docker` object, so they are tested without Docker or a network;
// `realDocker` and `useImages` are the thin side-effecting parts.
//
// Environment:
//   IMAGES=auto|local|registry   auto (default): the pinned registry image if present locally, else a local build if
//                                present, else pull. local: only `<image>:local` (never touches the network).
//                                registry: only the pinned registry image (pull if absent, no fallback).
//   IMAGE_REGISTRY=host/org      replaces pins.json images.registry (a mirror, or your own fork's packages).
//   VTA_IMAGE / VTC_IMAGE / MEDIATOR_IMAGE   an exact image to use; beats everything above.
import { spawnSync } from "node:child_process";
import type { Pins } from "../pins.js";

export type ImageKind = "vta" | "vtc" | "mediator";
export const IMAGE_KINDS: readonly ImageKind[] = ["vta", "vtc", "mediator"];
export type ImagesMode = "auto" | "local" | "registry";

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
}

/**
 * Decide what `kind` runs. Order: explicit override; then by mode (see the top of this file).
 * Never throws; a failure carries a message that says what to do next.
 */
export function resolveImage(spec: ImageSpec, docker: Docker, o: ResolveOpts): Resolution {
  const { kind } = spec;
  const build = `build it: ${spec.buildCmd}`;
  const tryPull = (ref: string, fallback: string): Resolution => {
    const r = docker.pull(ref);
    if (r.ok && docker.has(ref)) return { ok: true, kind, ref, source: "pulled" };
    return { ok: false, kind, message: `${friendlyPullError(r.stderr, ref)}\n  ${fallback}`, detail: r.stderr.trim() || undefined };
  };

  if (o.override) {
    if (docker.has(o.override)) return { ok: true, kind, ref: o.override, source: "env" };
    if (o.pull && o.mode !== "local") return tryPull(o.override, `${spec.envVar} is set, so nothing else is tried. Unset it to use the pinned image.`);
    return { ok: false, kind, message: `${spec.envVar}=${o.override} is not present locally (docker load it, docker pull it, or unset ${spec.envVar}).` };
  }
  if (o.mode === "local") {
    return docker.has(spec.local)
      ? { ok: true, kind, ref: spec.local, source: "local-build" }
      : { ok: false, kind, message: `${spec.local} is not present (IMAGES=local): ${build}, or unset IMAGES to use the prebuilt image.` };
  }
  if (docker.has(spec.pinned)) return { ok: true, kind, ref: spec.pinned, source: "registry" };
  if (o.mode === "auto" && docker.has(spec.local)) return { ok: true, kind, ref: spec.local, source: "local-build" };
  if (!o.pull) {
    return { ok: false, kind, needsPull: true, message: `${spec.pinned} is not present locally: npm run images:pull ${kind}${o.mode === "auto" ? `, or ${build}` : ""}.` };
  }
  return tryPull(spec.pinned, o.mode === "auto" ? `Fallback: ${build} (or IMAGES=local to skip the registry).` : "IMAGES=registry allows no fallback; unset it to build locally.");
}

export interface StatusRow { kind: ImageKind; ref: string; state: "ready" | "pullable" | "missing"; source?: Source; fix?: string }

/**
 * For `doctor`-style reports: what each image is, without pulling anything.
 * ready = usable now; pullable = would be pulled by `up`; missing = IMAGES=local (or an override) with nothing present.
 */
export function imageStatus(specs: Record<ImageKind, ImageSpec>, docker: Docker, mode: ImagesMode, kinds: readonly ImageKind[] = IMAGE_KINDS, overrides: Partial<Record<ImageKind, string>> = {}): StatusRow[] {
  return kinds.map((kind) => {
    const spec = specs[kind];
    const r = resolveImage(spec, docker, { mode, override: overrides[kind], pull: false });
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
  return kinds.map((kind) => {
    const spec = specs[kind];
    const r = resolveImage(spec, docker, { mode, override: overrideOf(spec, get), pull: opts.pull });
    if (r.ok) {
      process.env[spec.envVar] = r.ref;
      if (!opts.quiet && r.source !== "env") console.log(`image ${kind}: ${r.ref} (${r.source === "local-build" ? "local build" : r.source === "pulled" ? "pulled just now" : "prebuilt, already here"})`);
    }
    return r;
  });
}
