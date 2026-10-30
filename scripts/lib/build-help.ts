// Pure helpers for `images:build`: what to tell the user when the upstream checkout is missing.
// Nothing here clones; the script asks first (or needs --clone).

import type { ImageKind } from "./images.js";

/** How long a cold build takes. The planning figure is for a laptop; 12 to 25 min was measured on a 12-core desktop (docs/PINS.md). Later builds reuse Docker's layer cache. */
export const BUILD_ESTIMATE: Record<ImageKind, string> = {
  vta: "25 to 40 min cold",
  vtc: "25 to 40 min cold",
  mediator: "about 12 min cold",
};

/** 754000 -> "12m 34s". */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/** What `npm run setup` says before it starts building `plan`. */
export function setupIntro(plan: ImageKind[], mode: string): string {
  const tunnelNote = mode === "tunnel" ? "" : plan.includes("mediator") ? "" : "\n(MODE=tunnel also needs the mediator: run `npm run setup -- --tunnel` for it.)";
  return plan.length === 0
    ? `Nothing to build: every image MODE=${mode} needs is already here.`
    : `Building ${plan.length} image(s) for MODE=${mode}, one after the other: ${plan.map((k) => `${k} (${BUILD_ESTIMATE[k]})`).join(", ")}.\nEach is built once; later runs reuse it. Leave this running; it is safe to stop and run it again (finished images are kept).${tunnelNote}`;
}

export const DEFAULT_VTI_DIR = "../verifiable-trust-infrastructure";

/** The command that creates the checkout the build needs. `dir` is where it should go. */
export function cloneCommand(repoUrl: string, dir: string = DEFAULT_VTI_DIR): string {
  return `git clone ${repoUrl} ${dir}`;
}

export function fetchCommand(dir: string): string {
  return `git -C ${dir} fetch --tags origin`;
}

/** The message for a missing checkout (no clone has happened). */
export function missingCheckoutMessage(opts: { dir: string; repoUrl: string; explicitPath: boolean }): string {
  const where = opts.explicitPath ? `VTI_PATH (${opts.dir})` : opts.dir;
  return [
    `the upstream VTI checkout is not at ${where}. The images are built from it (prebuilt images are not available yet, so images are built locally; docs/PINS.md#where-the-images-come-from).`,
    `Create it with:`,
    `  ${cloneCommand(opts.repoUrl, opts.dir)}`,
    `  ${fetchCommand(opts.dir)}`,
    `or run \`npm run images:build -- --clone\` to have this script do it, or set VTI_PATH to an existing checkout.`,
  ].join("\n");
}

/** The message for a checkout that does not hold the pinned ref (a stale clone). */
export function missingRefMessage(opts: { dir: string; ref: string; tag: string }): string {
  return `${opts.ref} (${opts.tag}) is not in ${opts.dir}. Fetch it with:\n  ${fetchCommand(opts.dir)}\nor set VTI_PATH to another checkout.`;
}

/** Strip `--clone` from argv; the first remaining argument is the image name. */
export function parseBuildArgs(argv: string[]): { which: string; clone: boolean } {
  const rest = argv.filter((a) => a !== "--clone");
  return { which: rest[0] ?? "all", clone: argv.includes("--clone") };
}
