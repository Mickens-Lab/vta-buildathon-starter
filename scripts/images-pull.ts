// Pull the prebuilt images pinned in pins.json (docs/IMAGES.md). While pins.json images.available is false (the organisation does
// not allow public packages) this explains how to build locally and does nothing, unless IMAGES=registry is set (people with access).
//   npm run images:pull [vta|vtc|mediator|all] [--check] [--force] [--by-digest]
//   all = vta + vtc + mediator (unlike images:build, pulling the mediator is cheap)
//   --check  report what is present and what would be pulled; no network, nothing changed
//   --force  pull even if the image is already here (refreshes a tag)
//   --by-digest  pull only by the digest pinned in pins.json; refuse (pull nothing) if the pin records none.
//            Without it, a pin with a digest is pulled by digest anyway, and one without falls back to the tag with a warning.
//   After pulling, check it: npm run images:verify (docs/VERIFY.md)
// IMAGES=local makes this a no-op; IMAGE_REGISTRY=host/org pulls from another registry.
import "./lib/cli.js";
import { spawnSync } from "node:child_process";
import { die } from "./env.js";
import { currentMode, friendlyPullError, IMAGE_KINDS, imagesAvailable, imageSpecs, imageStatus, pullUnavailableMessage, NO_DIGEST_WARNING, pullTarget, realDocker, type ImageKind } from "./lib/images.js";
import { pins } from "./pins.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const which = args.find((a) => !a.startsWith("--")) ?? "all";
for (const f of flags) if (f !== "--check" && f !== "--force" && f !== "--by-digest") die(`unknown option ${f}. usage: npm run images:pull [vta|vtc|mediator|all] [--check] [--force] [--by-digest]`);
if (which !== "all" && !IMAGE_KINDS.includes(which as ImageKind)) die("usage: npm run images:pull [vta|vtc|mediator|all] [--check] [--force] [--by-digest]");
const kinds: readonly ImageKind[] = which === "all" ? IMAGE_KINDS : [which as ImageKind];

let mode;
let specs;
try {
  mode = currentMode();
  specs = imageSpecs(pins(), process.env.IMAGE_REGISTRY);
} catch (e) {
  die((e as Error).message);
}

const available = imagesAvailable(pins());
if (flags.has("--check")) {
  if (!available && mode !== "registry") console.log("Prebuilt images are not available yet; showing what a local build would use.");
  for (const r of imageStatus(specs, realDocker, mode, kinds, {}, available)) {
    console.log(`${r.kind.padEnd(9)} ${r.state.padEnd(9)} ${r.ref}${r.source ? `  (${r.source})` : ""}${r.fix && r.state !== "ready" ? `\n          ${r.fix}` : ""}`);
  }
  process.exit(0);
}
if (mode === "local") {
  console.log("IMAGES=local: building locally is selected, nothing to pull (unset IMAGES to use prebuilt images).");
  process.exit(0);
}
if (!available && mode !== "registry") {
  console.log(pullUnavailableMessage(specs, kinds, pins().images.why));
  process.exit(0);
}
if (!available) console.log("IMAGES=registry: trying the registry although prebuilt images are not generally available (you need access; docker login ghcr.io).\n");
if (spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore", timeout: 30_000 }).status !== 0) {
  die("Docker is not running or not reachable. Start Docker and try again.");
}

const byDigest = flags.has("--by-digest");
const refused = kinds.map((k) => pullTarget(specs[k], byDigest)).flatMap((t) => (t.ok ? [] : [t.message]));
if (refused.length) die(refused.join("\n"));

const failed: string[] = [];
for (const kind of kinds) {
  const spec = specs[kind];
  const target = pullTarget(spec, byDigest);
  if (!target.ok) continue;
  if (!flags.has("--force") && realDocker.has(target.ref)) {
    console.log(`${kind}: ${target.ref} is already here (--force to pull again)`);
    continue;
  }
  console.log(`${kind}: pulling ${target.ref}`);
  if (target.byTag) console.warn(`  WARNING: ${NO_DIGEST_WARNING}`);
  const r = realDocker.pull(target.ref);
  if (!r.ok) {
    console.error(`${friendlyPullError(r.stderr, target.ref)}\n${r.stderr.trim().split("\n").slice(-3).join("\n")}`);
    failed.push(kind);
    continue;
  }
  const digests = spawnSync("docker", ["image", "inspect", target.ref, "--format", "{{range .RepoDigests}}{{println .}}{{end}}"], { encoding: "utf8" }).stdout.trim();
  console.log(`${kind}: ok${digests ? `\n  ${digests.split("\n").join("\n  ")}` : ""}${spec.digest ? "" : "\n  (pins.json records no digest for this image yet: it was pulled by tag, so it is NOT verified)"}`);
  if (spec.digest && !digests.split("\n").includes(`${spec.repo}@${spec.digest}`)) {
    console.error(`${kind}: the pulled image does not report the pinned digest ${spec.digest}. Do not use it.`);
    failed.push(kind);
  }
}
if (failed.length) {
  console.error(`\nnot pulled: ${failed.join(", ")}. You can still build locally and run with IMAGES=local:\n${failed.map((k) => `  ${specs[k as ImageKind].buildCmd}`).join("\n")}`);
  process.exit(1);
}

console.log("\nCheck what you pulled: npm run images:verify (docs/VERIFY.md)");
