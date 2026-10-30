// Check what you run: npm run images:verify [vta|vtc|mediator|all] [--local] [--allow-incomplete]
//   default   the pinned published image (by digest when pins.json records one): digest vs pins.json, GitHub attestation
//             and/or cosign signature, labels vs pins, SBOM summary. Needs gh and/or cosign for the signature part.
//   --local   the image `npm run images:build` made (<name>:local): labels only; says what that cannot prove.
//   --allow-incomplete  exit 0 even if the signature could not be checked (default exit 2: incomplete is not verified)
// VERIFY_REPO=owner/repo  expect images signed by another repository's workflow (a fork that publishes its own images)
// Exit: 0 verified (or labels-only for --local), 1 something failed, 2 not verified (checks skipped). docs/VERIFY.md
import "./lib/cli.js";
import { die } from "./env.js";
import { IMAGE_KINDS, imageSpecs, type ImageKind } from "./lib/images.js";
import { dockerArch, exitCode, formatReport, identityFor, realRunner, sha256File, verifyImage } from "./lib/verify.js";
import { pins } from "./pins.js";

const USAGE = "usage: npm run images:verify [vta|vtc|mediator|all] [--local] [--allow-incomplete]";
const args = process.argv.slice(2);
for (const f of args.filter((a) => a.startsWith("--"))) if (f !== "--local" && f !== "--allow-incomplete") die(`unknown option ${f}. ${USAGE}`);
const which = args.find((a) => !a.startsWith("--")) ?? "all";
if (which !== "all" && !IMAGE_KINDS.includes(which as ImageKind)) die(USAGE);
const kinds: readonly ImageKind[] = which === "all" ? IMAGE_KINDS : [which as ImageKind];
const local = args.includes("--local");

let specs, identity;
try {
  specs = imageSpecs(pins(), process.env.IMAGE_REGISTRY);
  identity = identityFor(pins(), process.env.VERIFY_REPO);
} catch (e) { die((e as Error).message); }

const DOCKERFILE = { vta: undefined, vtc: "docker/vtc.Dockerfile", mediator: "docker/mediator.Dockerfile" } as const;
const reports = kinds.map((k) => {
  const f = DOCKERFILE[k];
  return verifyImage(specs[k], pins(), realRunner, { source: local ? "local" : "registry", identity, dockerfileSha256: f ? sha256File(f) : undefined, arch: dockerArch() });
});
console.log(reports.map(formatReport).join("\n\n"));
const code = exitCode(reports, args.includes("--allow-incomplete"));
if (code === 2) console.log("\nNOT VERIFIED. Install gh or cosign (docs/VERIFY.md), or pass --allow-incomplete if you accept that.");
process.exit(code);
