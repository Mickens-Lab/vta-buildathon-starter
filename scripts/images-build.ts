// Build the VTA and/or VTC image, each from its own VTI ref pinned in pins.json
// (the two releases come from different monorepo commits).
//   npm run images:build [vta|vtc|all]
// VTI_PATH   a verifiable-trust-infrastructure checkout (default ../verifiable-trust-infrastructure);
//            each pinned ref is exported with `git archive`, so its working tree is never used.
// VTI_LOCAL=1 build the checkout's working tree instead (development; the image is tagged :local only).
// TMPDIR     where the exported source goes (default the OS temp dir; use /var/tmp/<name> for heavy runs).
// Tags: <image>:<short-sha> and <image>:local (what compose defaults to).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { die } from "./env.js";
import { pins } from "./pins.js";

const which = process.argv[2] ?? "all";
if (!["vta", "vtc", "all"].includes(which)) die("usage: npm run images:build [vta|vtc|all]");
const vti = pins().vti;
const repo = resolve(process.env.VTI_PATH ?? "../verifiable-trust-infrastructure");
const local = process.env.VTI_LOCAL === "1";
const sh = (cmd: string, args: string[], opts: object = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) die(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.status}).`);
};

for (const name of which === "all" ? (["vta", "vtc"] as const) : [which as "vta" | "vtc"]) {
  const { image, ref, tag } = vti[name];
  const short = ref.slice(0, 8);
  let ctx = repo;
  let tmp = "";
  if (!local) {
    if (spawnSync("git", ["-C", repo, "cat-file", "-e", `${ref}^{commit}`]).status !== 0) {
      die(`${ref} (${tag}) is not in ${repo}. Fetch it (git -C ${repo} fetch --tags origin) or set VTI_PATH.`);
    }
    tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "vti-"));
    sh("sh", ["-c", `git -C '${repo}' archive ${ref} | tar -x -C '${tmp}'`]);
    ctx = tmp;
  }
  try {
    const tags = local ? [`${image}:local`] : [`${image}:${short}`, `${image}:local`];
    const file = name === "vta" ? join(ctx, "Dockerfile") : resolve("docker/vtc.Dockerfile");
    console.log(`building ${tags.join(", ")} from ${local ? `${repo} (working tree)` : `${tag} ${ref}`}`);
    sh("nice", ["-n", "10", "docker", "build", "-f", file, "--build-arg", `VTI_REF=${local ? "local" : ref}`, "--label", `org.buildathon.vti-ref=${local ? "local" : ref}`, ...tags.flatMap((t) => ["-t", t]), ctx]);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
