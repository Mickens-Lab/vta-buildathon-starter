// Share locally built images between machines without a registry: `docker save` on one, `docker load` on another.
// Pure helpers (tested); scripts/images-share.ts runs them.
import type { ImageKind, ImageSpec } from "./images.js";

export const DEFAULT_TAR = "buildathon-images.tar";

/** The `<name>:local` tags to save, for the kinds asked for. */
export function exportRefs(specs: Record<ImageKind, ImageSpec>, kinds: readonly ImageKind[]): string[] {
  return kinds.map((k) => specs[k].local);
}

/** argv for `docker save`. `-o` writes the file itself, so no shell pipe is involved. */
export const saveArgs = (refs: readonly string[], file: string): string[] => ["save", "-o", file, ...refs];
export const loadArgs = (file: string): string[] => ["load", "-i", file];

/** What a share file must not be mistaken for: a signed or verified artifact. */
export const SHARE_TRUST_NOTE =
  "A shared tar is only as trustworthy as the person who made it: `docker load` takes its word for what the images contain. Load tars from people you trust, then check the labels with `npm run images:verify -- --local`.";

/** Compare the CPU architecture a loaded image was built for with the one Docker runs here. Returns a warning, or undefined. */
export function archWarning(image: string, imageArch: string, dockerArch: string): string | undefined {
  const norm = (a: string) => (a === "x86_64" ? "amd64" : a === "aarch64" ? "arm64" : a);
  return norm(imageArch) === norm(dockerArch) ? undefined
    : `${image} was built for ${imageArch} but Docker here runs ${dockerArch}: it will not start (or will crawl under emulation). Build it on this machine instead: npm run setup.`;
}

/** Tags a `docker load` reports: lines like `Loaded image: vta-buildathon:local`. */
export function loadedRefs(output: string): string[] {
  return [...output.matchAll(/^Loaded image:\s*(\S+)\s*$/gm)].map((m) => m[1]!);
}
