// Share the images you built with another machine, no registry needed (docs/IMAGES.md, docs/EVENT.md).
//   npm run images:export [-- file.tar] [--tunnel] [--no-vtc]   write the local images the mode needs (default buildathon-images.tar)
//   npm run images:import -- file.tar                            load a tar made by images:export (or `docker save`)
// Export saves `<name>:local` for what the mode needs (local: vta + vtc; --tunnel adds the mediator); it refuses if one is not built.
// Import runs `docker load`, then lists what arrived and warns when an image is for another CPU architecture.
// The tar is not signed: it is exactly as trustworthy as whoever made it.
import "./lib/cli.js";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { die, modeInfo, vtcChoice } from "./env.js";
import { imageSpecs, realDocker } from "./lib/images.js";
import { imagesNeeded, imagesToBuild } from "./lib/doctor.js";
import { parseModeFlags } from "./lib/modes.js";
import { archWarning, DEFAULT_TAR, exportRefs, loadArgs, loadedRefs, saveArgs, SHARE_TRUST_NOTE } from "./lib/share.js";
import { pins } from "./pins.js";

const sub = process.argv[2];
const flags = parseModeFlags(process.argv.slice(3));
if (flags.error) die(flags.error);
const file = flags.rest.find((a) => !a.startsWith("--"));
const docker = (args: string[]) => spawnSync("docker", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

if (sub === "export") {
  if (flags.mode) process.env.MODE = flags.mode;
  if (flags.vtc !== undefined) process.env.WITH_VTC = flags.vtc ? "1" : "0";
  const mode = flags.mode ?? modeInfo().mode;
  const specs = imageSpecs(pins());
  const missing = imagesToBuild(mode, vtcChoice().on, specs, (r) => realDocker.has(r));
  if (missing.length) die(`not built yet: ${missing.join(", ")}. Build first: npm run setup${mode === "tunnel" ? " -- --tunnel" : ""}`);
  const refs = exportRefs(specs, imagesNeeded(mode, vtcChoice().on));
  if (!refs.length) die("MODE=farm runs no local images: nothing to export.");
  const out = file ?? DEFAULT_TAR;
  console.log(`saving ${refs.join(", ")} to ${out} ...`);
  const r = docker(saveArgs(refs, out));
  if (r.status !== 0) die(`docker save failed: ${(r.stderr || "").trim()}`);
  console.log(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(0)} MB).\nOn the other machine (same CPU architecture): copy it there, then  npm run images:import -- ${out}\n${SHARE_TRUST_NOTE}`);
} else if (sub === "import") {
  if (!file) die("usage: npm run images:import -- file.tar");
  if (!existsSync(file)) die(`${file} does not exist.`);
  const r = docker(loadArgs(file));
  if (r.status !== 0) die(`docker load failed: ${(r.stderr || "").trim()}`);
  process.stdout.write(r.stdout);
  const here = docker(["version", "--format", "{{.Server.Arch}}"]).stdout.trim();
  for (const ref of loadedRefs(r.stdout)) {
    const arch = docker(["image", "inspect", ref, "--format", "{{.Architecture}}"]).stdout.trim();
    const w = arch && here ? archWarning(ref, arch, here) : undefined;
    if (w) console.warn(`WARNING: ${w}`);
  }
  console.log(`\nNext: npm run doctor, then npm run up.\n${SHARE_TRUST_NOTE}`);
} else die("usage: npm run images:export [-- file.tar] [--tunnel] [--no-vtc]  |  npm run images:import -- file.tar");
