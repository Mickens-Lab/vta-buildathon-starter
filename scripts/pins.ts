import { readFileSync } from "node:fs";

/** One image built from its own ref of the VTI monorepo. */
export interface ImagePin { image: string; tag: string; ref: string; version: string; service: string }
export interface Pins {
  updated: string;
  vti: { repo: string; vta: ImagePin; vtc: ImagePin; pinnedOn: string; why: string; note: string };
  farm: { assumed: Record<string, string>; note: string; portal: Record<string, string> };
  npm: Record<string, string>;
}
export const pins = (): Pins => JSON.parse(readFileSync(new URL("../pins.json", import.meta.url), "utf8"));
/** The image name the Farm portal's selector lists for the pinned VTA: `<version>-<short ref>`. */
export const farmImageTag = (p: Pins = pins()) => `${p.vti.vta.version}-${p.vti.vta.ref.slice(0, 8)}`;
