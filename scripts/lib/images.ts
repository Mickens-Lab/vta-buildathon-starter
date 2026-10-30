// Pure helpers for `images:build`: what to tell the user when the upstream checkout is missing.
// Nothing here clones; the script asks first (or needs --clone).

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
    `the upstream VTI checkout is not at ${where}. The images are built from it (no images are published; docs/PINS.md#where-the-images-come-from).`,
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
