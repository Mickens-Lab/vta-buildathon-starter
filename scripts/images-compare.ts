// Line a local build up against the published image of the same pin. Rebuilds and pulls NOTHING.
//   npm run images:compare [vta|vtc|mediator|all]
// Needs both images present: `npm run images:build <kind>` and `npm run images:pull <kind>`.
// Bit-for-bit reproducibility is NOT claimed (docs/VERIFY.md): a different image ID is normal; the labels
// (pinned commit, Dockerfile hash, features) are what should agree. Exit 1 if a provenance label differs.
import "./lib/cli.js";
import { die } from "./env.js";
import { IMAGE_KINDS, imageSpecs, type ImageKind } from "./lib/images.js";
import { compareSides, inspectSide, realRunner } from "./lib/verify.js";
import { pins } from "./pins.js";

const which = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "all";
if (process.argv.slice(2).some((a) => a.startsWith("--")) || (which !== "all" && !IMAGE_KINDS.includes(which as ImageKind))) die("usage: npm run images:compare [vta|vtc|mediator|all]");
const specs = (() => { try { return imageSpecs(pins(), process.env.IMAGE_REGISTRY); } catch (e) { return die((e as Error).message); } })();
let failed = false;
for (const k of which === "all" ? IMAGE_KINDS : [which as ImageKind]) {
  const s = specs[k];
  console.log(`${k}  local ${s.local}  vs  published ${s.pinned}`);
  const lines = compareSides(k, inspectSide(realRunner, s.local), inspectSide(realRunner, s.pinned));
  for (const l of lines) { console.log(`  ${l.status.padEnd(7)} ${l.check.padEnd(18)} ${l.detail}`); if (l.status === "FAIL") failed = true; }
  console.log("");
}
console.log("What this does and does not show: agreeing labels mean the two images claim the same upstream commit, features and Dockerfile.\nIt does not prove the contents are the same; only an identical image ID does, and that is not expected (docs/VERIFY.md#reproducibility).");
process.exit(failed ? 1 : 0);
