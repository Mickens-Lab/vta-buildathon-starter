// Pull the prebuilt images pinned in pins.json (docs/IMAGES.md).
//   npm run images:pull [vta|vtc|mediator|all] [--check] [--force]
//   all = vta + vtc + mediator (unlike images:build, pulling the mediator is cheap)
//   --check  report what is present and what would be pulled; no network, nothing changed
//   --force  pull even if the image is already here (refreshes a tag)
// IMAGES=local makes this a no-op; IMAGE_REGISTRY=host/org pulls from another registry.
import "./lib/cli.js";
import { spawnSync } from "node:child_process";
import { die } from "./env.js";
import { currentMode, friendlyPullError, IMAGE_KINDS, imageSpecs, imageStatus, realDocker, type ImageKind } from "./lib/images.js";
import { pins } from "./pins.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const which = args.find((a) => !a.startsWith("--")) ?? "all";
for (const f of flags) if (f !== "--check" && f !== "--force") die(`unknown option ${f}. usage: npm run images:pull [vta|vtc|mediator|all] [--check] [--force]`);
if (which !== "all" && !IMAGE_KINDS.includes(which as ImageKind)) die("usage: npm run images:pull [vta|vtc|mediator|all] [--check] [--force]");
const kinds: readonly ImageKind[] = which === "all" ? IMAGE_KINDS : [which as ImageKind];

let mode;
let specs;
try {
  mode = currentMode();
  specs = imageSpecs(pins(), process.env.IMAGE_REGISTRY);
} catch (e) {
  die((e as Error).message);
}

if (flags.has("--check")) {
  for (const r of imageStatus(specs, realDocker, mode, kinds)) {
    console.log(`${r.kind.padEnd(9)} ${r.state.padEnd(9)} ${r.ref}${r.source ? `  (${r.source})` : ""}${r.fix && r.state !== "ready" ? `\n          ${r.fix}` : ""}`);
  }
  process.exit(0);
}
if (mode === "local") {
  console.log("IMAGES=local: building locally is selected, nothing to pull (unset IMAGES to use prebuilt images).");
  process.exit(0);
}
if (spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore", timeout: 30_000 }).status !== 0) {
  die("Docker is not running or not reachable. Start Docker and try again.");
}

const failed: string[] = [];
for (const kind of kinds) {
  const spec = specs[kind];
  if (!flags.has("--force") && realDocker.has(spec.pinned)) {
    console.log(`${kind}: ${spec.pinned} is already here (--force to pull again)`);
    continue;
  }
  console.log(`${kind}: pulling ${spec.pinned}`);
  const r = realDocker.pull(spec.pinned);
  if (!r.ok) {
    console.error(`${friendlyPullError(r.stderr, spec.pinned)}\n${r.stderr.trim().split("\n").slice(-3).join("\n")}`);
    failed.push(kind);
    continue;
  }
  const digests = spawnSync("docker", ["image", "inspect", spec.pinned, "--format", "{{range .RepoDigests}}{{println .}}{{end}}"], { encoding: "utf8" }).stdout.trim();
  console.log(`${kind}: ok${digests ? `\n  ${digests.split("\n").join("\n  ")}` : ""}${spec.digest ? "" : "\n  (pins.json records no digest for this image yet: it was pulled by tag)"}`);
}
if (failed.length) {
  console.error(`\nnot pulled: ${failed.join(", ")}. You can still build locally and run with IMAGES=local:\n${failed.map((k) => `  ${specs[k as ImageKind].buildCmd}`).join("\n")}`);
  process.exit(1);
}
