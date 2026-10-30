import { readFileSync } from "node:fs";

/** One image built from its own ref of the VTI monorepo. */
export interface ImagePin { image: string; tag: string; ref: string; version: string; service: string; features?: string }
export interface MediatorPin { image: string; repo: string; ref: string; version: string; features: string; service: string }
/** Prebuilt images (docs/IMAGES.md). `digest` is the multi-arch index digest the publish workflow reports; null = not recorded. */
export interface ImagesPin {
  registry: string;
  platforms: string[];
  note: string;
  /** Who must have signed the published images (docs/VERIFY.md). */
  verify: { repo: string; workflow: string; issuer: string; note: string };
  vta: { digest: string | null };
  vtc: { digest: string | null };
  mediator: { digest: string | null };
}
export interface Pins {
  updated: string;
  vti: { repo: string; vta: ImagePin; vtc: ImagePin; pinnedOn: string; why: string; note: string };
  messaging: {
    mediator: MediatorPin;
    redis: { image: string; tag: string };
    cloudflared: { validated: string; note: string };
    why: string;
    note: string;
  };
  images: ImagesPin;
  farm: { assumed: Record<string, string>; note: string; portal: Record<string, string> };
  npm: Record<string, string>;
}
export const pins = (): Pins => JSON.parse(readFileSync(new URL("../pins.json", import.meta.url), "utf8"));
/** The image name the Farm portal's selector lists for the pinned VTA: `<version>-<short ref>`. */
export const farmImageTag = (p: Pins = pins()) => `${p.vti.vta.version}-${p.vti.vta.ref.slice(0, 8)}`;
