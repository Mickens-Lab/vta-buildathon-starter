// Build the VTA, VTC and/or mediator image, each from its own ref pinned in pins.json
// (the releases come from different commits and repositories).
//   npm run images:build [vta|vtc|mediator|all]     (`all` is vta + vtc; the mediator is only for MODE=tunnel)
// VTI_PATH   a verifiable-trust-infrastructure checkout (default ../verifiable-trust-infrastructure);
//            each pinned ref is exported with `git archive`, so its working tree is never used.
// VTI_LOCAL=1 build the checkout's working tree instead (development; the image is tagged :local only).
// --clone   clone the VTI checkout (and fetch its tags) if it is missing, without asking. Without it a terminal is asked; a pipe or CI gets the commands printed.
// TMPDIR     where the exported source goes (default the OS temp dir; use /var/tmp/<name> for heavy runs).
// Tags: <image>:<short-sha> and <image>:local (what compose defaults to).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { die } from "./env.js";
import { missingCheckoutMessage, missingRefMessage, parseBuildArgs } from "./lib/images.js";
import { confirm } from "./lib/prompt.js";
import { MEDIATOR_BUILD_NOTICE, memoryWarning } from "./lib/tunnel.js";
import { pins } from "./pins.js";

const { which, clone } = parseBuildArgs(process.argv.slice(2));
if (!["vta", "vtc", "mediator", "all"].includes(which)) die("usage: npm run images:build [vta|vtc|mediator|all] [--clone]");
const vti = pins().vti;
const repo = resolve(process.env.VTI_PATH ?? "../verifiable-trust-infrastructure");
const local = process.env.VTI_LOCAL === "1";
const sh = (cmd: string, args: string[], opts: object = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) die(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.status}).`);
};

if (which === "mediator") {
  const m = pins().messaging.mediator;
  const short = m.ref.slice(0, 8);
  console.log(MEDIATOR_BUILD_NOTICE);
  let avail: number | undefined;
  try { avail = Number(/MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))?.[1]); } catch { /* not Linux */ }
  const warn = memoryWarning(avail && !Number.isNaN(avail) ? avail : undefined);
  if (warn) console.warn(`WARNING: ${warn}`);
  const tags = [`${m.image}:${short}`, `${m.image}:local`];
  console.log(`building ${tags.join(", ")} from ${m.repo} @ ${m.ref} (mediator ${m.version}, features ${m.features})`);
  sh("nice", ["-n", "10", "docker", "build", "-f", resolve("docker/mediator.Dockerfile"), "--build-arg", `MEDIATOR_REF=${m.ref}`, "--build-arg", `FEATURES=${m.features}`, ...tags.flatMap((t) => ["-t", t]), resolve("docker")]);
  process.exit(0);
}

/** The VTA and VTC are built from a checkout of the upstream repository. Offer the clone, never do it unasked. */
async function ensureCheckout(ref: string, tag: string): Promise<void> {
  if (local) return;
  const isRepo = existsSync(repo) && spawnSync("git", ["-C", repo, "rev-parse", "--git-dir"], { stdio: "ignore" }).status === 0;
  if (!isRepo) {
    const message = missingCheckoutMessage({ dir: repo, repoUrl: vti.repo, explicitPath: Boolean(process.env.VTI_PATH) });
    if (existsSync(repo)) die(`${repo} exists but is not a git checkout. Move it away or set VTI_PATH.`);
    if (!clone && !(await confirm(`\n${message}\n\nClone it now (a few hundred MB)?`))) die(message);
    sh("git", ["clone", vti.repo, repo]);
    sh("git", ["-C", repo, "fetch", "--tags", "origin"]);
  }
  if (spawnSync("git", ["-C", repo, "cat-file", "-e", `${ref}^{commit}`]).status !== 0) {
    const message = missingRefMessage({ dir: repo, ref, tag });
    if (!clone && !(await confirm(`\n${message}\n\nRun that fetch now?`))) die(message);
    sh("git", ["-C", repo, "fetch", "--tags", "origin"]);
    if (spawnSync("git", ["-C", repo, "cat-file", "-e", `${ref}^{commit}`]).status !== 0) die(missingRefMessage({ dir: repo, ref, tag }));
  }
}

for (const name of which === "all" ? (["vta", "vtc"] as const) : [which as "vta" | "vtc"]) {
  const { image, ref, tag } = vti[name];
  const short = ref.slice(0, 8);
  let ctx = repo;
  let tmp = "";
  if (!local) {
    await ensureCheckout(ref, tag);
    tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "vti-"));
    sh("sh", ["-c", `git -C '${repo}' archive ${ref} | tar -x -C '${tmp}'`]);
    ctx = tmp;
  }
  try {
    const tags = local ? [`${image}:local`] : [`${image}:${short}`, `${image}:local`];
    const file = name === "vta" ? join(ctx, "Dockerfile") : resolve("docker/vtc.Dockerfile");
    console.log(`building ${tags.join(", ")} from ${local ? `${repo} (working tree)` : `${tag} ${ref}`}`);
    // The VTA needs `tsp` for MODE=tunnel and the VTI Dockerfile's default feature list lacks it (pins.json vta.features).
    const features = name === "vta" && vti.vta.features ? ["--build-arg", `FEATURES=${vti.vta.features}`, "--label", `org.buildathon.vta-features=${vti.vta.features}`] : [];
    sh("nice", ["-n", "10", "docker", "build", "-f", file, "--build-arg", `VTI_REF=${local ? "local" : ref}`, ...features, "--label", `org.buildathon.vti-ref=${local ? "local" : ref}`, ...tags.flatMap((t) => ["-t", t]), ctx]);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
