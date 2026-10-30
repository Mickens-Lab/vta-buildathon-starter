// Check what you run (docs/VERIFY.md): is this image the one the pins name, and was it built and signed by this
// repository's images workflow? Pure logic over a `Runner`, so the tests use a mock and need no Docker, gh, cosign or network.
//
// Rules this file keeps:
//   - A check that could not run is SKIPPED with the reason, never PASS. Only a check that ran and held is PASS.
//   - The overall verdict is VERIFIED only when the digest matched pins.json AND a signature/attestation check passed.
//   - A local build can only get its labels checked; the verdict says so and nothing stronger.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DOCKERFILE_LABEL, FEATURES_LABEL, ORIGIN_LABEL, type ImageSpec } from "./images.js";
import type { Pins } from "../pins.js";

export type Status = "PASS" | "FAIL" | "SKIPPED" | "INFO";
export interface Line { status: Status; check: string; detail: string }
export interface CmdResult { status: number | null; stdout: string; stderr: string }
export interface Runner { run(cmd: string, args: string[]): CmdResult }

export const realRunner: Runner = {
  run: (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    return { status: r.status, stdout: r.stdout ?? "", stderr: (r.stderr ?? "") + (r.error ? String(r.error.message) : "") };
  },
};

export const SPDX_PREDICATE = "https://spdx.dev/Document/v2.3";
export const INSTALL_HINT = {
  gh: "install the GitHub CLI (https://cli.github.com, `gh --version` should be 2.49 or newer for `gh attestation`) and run `gh auth login` once",
  cosign: "install cosign (https://docs.sigstore.dev/cosign/system_config/installation/)",
} as const;

/** Where the signing identity comes from: pins.json images.verify, with VERIFY_REPO for a fork's own images. */
export interface Identity { repo: string; workflow: string; issuer: string; /** SAN regexp cosign must match */ san: string; signerWorkflow: string }
export function identityFor(p: Pins, repoOverride?: string): Identity {
  const v = p.images.verify;
  const repo = (repoOverride ?? "").trim() || v.repo;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`VERIFY_REPO "${repo}" must look like owner/repo.`);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    repo, workflow: v.workflow, issuer: v.issuer,
    // the workflow file on the main branch or on an images-* tag; a run from any other branch is refused on purpose
    san: `^https://github\\.com/${esc(repo)}/${esc(v.workflow)}@refs/(heads/main|tags/images-.+)$`,
    signerWorkflow: `${repo}/${v.workflow}`,
  };
}

export function classifyFailure(stderr: string): "unreachable" | "rejected" {
  const s = stderr.toLowerCase();
  if (/no attestations? found|no matching attestations|no signatures? found|no matching signatures|none of the attestations matched|verification failed|certificate identity|expected .* got|did not match|mismatch|invalid signature/.test(s)) return "rejected";
  if (/no such host|dial tcp|timeout|timed out|connection (refused|reset)|network|rate limit|auth login|authenticat|gh_token|401|403|unauthorized|forbidden|enoent|not found in path|executable file not found|failed to fetch|could not resolve|tls handshake|eof/.test(s)) return "unreachable";
  return "rejected";
}

const tail = (s: string, n = 3) => s.trim().split("\n").slice(-n).join(" | ");
const short = (d: string) => d.slice(0, 19);
const has = (r: Runner, cmd: string) => r.run(cmd, ["--version"]).status === 0;

export interface Inspect { present: boolean; labels: Record<string, string>; repoDigests: string[]; id: string }
export function inspectImage(r: Runner, ref: string): Inspect {
  const x = r.run("docker", ["image", "inspect", ref, "--format", "{{json .Config.Labels}}|{{json .RepoDigests}}|{{.Id}}"]);
  if (x.status !== 0) return { present: false, labels: {}, repoDigests: [], id: "" };
  const [l = "null", d = "null", id = ""] = x.stdout.trim().split("|");
  return { present: true, labels: JSON.parse(l) ?? {}, repoDigests: JSON.parse(d) ?? [], id };
}

export interface VerifyOptions {
  /** "registry": the pinned published image. "local": `<name>:local` from images:build. */
  source: "registry" | "local";
  identity: Identity;
  /** sha256 of this checkout's Dockerfile for the image, when it is ours to compare (vtc, mediator). */
  dockerfileSha256?: string;
  /** Host CPU architecture as Docker names it (amd64, arm64), for the per-platform SBOM. */
  arch: string;
}

export interface Report { kind: string; image: string; lines: Line[]; verdict: "VERIFIED" | "FAILED" | "INCOMPLETE" | "LABELS-ONLY"; why: string }

export function verifyImage(spec: ImageSpec, p: Pins, r: Runner, o: VerifyOptions): Report {
  const lines: Line[] = [];
  const add = (status: Status, check: string, detail: string) => lines.push({ status, check, detail });
  const registry = o.source === "registry";
  const image = registry ? spec.pinned : spec.local;
  const ins = inspectImage(r, image);
  const canDocker = r.run("docker", ["version", "--format", "{{.Server.Version}}"]).status === 0;
  if (!canDocker) add("SKIPPED", "docker", "Docker is not reachable: local image contents and labels cannot be read");

  // (a) digest ---------------------------------------------------------------------------------------------
  let target: string | null = null; // the digest the remote checks run against
  if (registry) {
    const mine = ins.repoDigests.filter((d) => d.startsWith(`${spec.repo}@`)).map((d) => d.split("@")[1]!);
    if (spec.digest) {
      target = spec.digest;
      if (!ins.present) add("INFO", "digest", `${image} is not pulled here; checking the published image remotely (npm run images:pull ${spec.kind} to fetch it)`);
      else if (mine.includes(spec.digest)) add("PASS", "digest", `this copy is ${short(spec.digest)}, as pins.json records`);
      else add("FAIL", "digest", `pins.json records ${short(spec.digest)} but this copy is ${mine.map(short).join(", ") || "unknown"}. Do not use it: npm run images:pull -- ${spec.kind} --force`);
    } else {
      add("SKIPPED", "digest", "pins.json records no digest for this image, so there is nothing to compare: the tag can be moved by whoever can push. Run the workflow and record the digest (docs/IMAGES.md)");
      if (ins.present && mine.length === 0) add("INFO", "digest", "this image has no registry digest: it was tagged locally (a retag of a local build?), not pulled, so it is not evidence of what was published");
      if (mine.length === 1) { target = mine[0]!; add("INFO", "digest", `checking the signature of the digest this copy has (${short(target)}); pins.json does not vouch for it`); }
    }
  } else {
    add("SKIPPED", "digest", `a local build has no registry digest (image ID ${ins.id ? short(ins.id) : "n/a"}); there is no published digest to compare`);
  }

  // (b) signature and attestation -----------------------------------------------------------------------------
  let attested = false;
  const ghOk = registry && has(r, "gh");
  const cosignOk = registry && has(r, "cosign");
  if (!registry) {
    add("SKIPPED", "signature", "local builds are not signed; the labels below are what the builder wrote, not proof");
  } else if (!target) {
    add("SKIPPED", "signature", "no digest to check (nothing pulled and none in pins.json)");
  } else {
    const subject = `${spec.repo}@${target}`;
    if (!ghOk && !cosignOk) {
      add("SKIPPED", "signature", `NOT CHECKED: neither gh nor cosign is installed. ${INSTALL_HINT.gh}; or ${INSTALL_HINT.cosign}`);
    }
    if (ghOk) {
      const x = r.run("gh", ["attestation", "verify", `oci://${subject}`, "--repo", o.identity.repo, "--signer-workflow", o.identity.signerWorkflow, "--format", "json"]);
      if (x.status === 0) { attested = true; add("PASS", "gh attestation", `build provenance for ${short(target)} is signed by ${o.identity.signerWorkflow}`); }
      else if (classifyFailure(x.stderr) === "unreachable") add("SKIPPED", "gh attestation", `could not complete (offline, not logged in, or gh too old): ${tail(x.stderr)}`);
      else add("FAIL", "gh attestation", `no valid attestation from ${o.identity.repo} for ${short(target)}: ${tail(x.stderr)}`);
    } else if (cosignOk) {
      add("SKIPPED", "gh attestation", `gh is not installed (cosign is enough for the signature; gh also gives the SBOM). ${INSTALL_HINT.gh}`);
    }
    if (cosignOk) {
      const x = r.run("cosign", ["verify", subject, "--certificate-identity-regexp", o.identity.san, "--certificate-oidc-issuer", o.identity.issuer]);
      if (x.status === 0) { attested = true; add("PASS", "cosign signature", `signed by ${o.identity.workflow} of ${o.identity.repo} (issuer ${o.identity.issuer})`); }
      else if (classifyFailure(x.stderr) === "unreachable") add("SKIPPED", "cosign signature", `could not complete: ${tail(x.stderr)}`);
      else add("FAIL", "cosign signature", `no signature by ${o.identity.repo}'s workflow for ${short(target)}: ${tail(x.stderr)}`);
    } else if (ghOk) {
      add("SKIPPED", "cosign signature", `cosign is not installed (gh attestation covers the signature). ${INSTALL_HINT.cosign}`);
    }
  }

  // (c) labels vs pins -----------------------------------------------------------------------------------------
  if (!ins.present) {
    add("SKIPPED", "labels", `${image} is not present locally${registry ? " (npm run images:pull)" : `: ${spec.buildCmd}`}`);
  } else {
    const L = ins.labels;
    const refWant = spec.ref;
    const got = L[spec.refLabel];
    if (!got) add(registry ? "FAIL" : "SKIPPED", "label ref", `no ${spec.refLabel} label${registry ? "" : " (not built by images:build, or built before the labels existed: rebuild)"}`);
    else if (got === refWant) add("PASS", "label ref", `${spec.refLabel} = ${refWant.slice(0, 8)} (pinned)`);
    else if (!registry && got === "local") add("INFO", "label ref", `${spec.refLabel} = local (built from a working tree with VTI_LOCAL=1, not from the pin)`);
    else add("FAIL", "label ref", `${spec.refLabel} = ${got.slice(0, 12)} but pins.json says ${refWant.slice(0, 8)}`);
    const pinned = L["org.buildathon.pinned-ref"];
    if (pinned && pinned !== got) add("FAIL", "label pinned-ref", `org.buildathon.pinned-ref ${pinned.slice(0, 12)} differs from ${spec.refLabel} ${String(got).slice(0, 12)}`);
    if (spec.kind === "vta") {
      const f = L[FEATURES_LABEL];
      const want = p.vti.vta.features ?? "";
      if (!f) add(registry ? "FAIL" : "SKIPPED", "label features", `no ${FEATURES_LABEL} label`);
      else if (f !== want) add("FAIL", "label features", `built with "${f}", pins.json says "${want}"`);
      else if (!f.split(",").includes("tsp")) add("FAIL", "label features", `"${f}" has no tsp: MODE=tunnel will not work`);
      else add("PASS", "label features", `${f} (includes tsp)`);
    }
    const origin = L[ORIGIN_LABEL];
    if (registry) add(origin === "github-actions" ? "PASS" : "FAIL", "label origin", origin ? `build-origin = ${origin}` : "no build-origin label: not built by the images workflow");
    else add("INFO", "label origin", origin ? `build-origin = ${origin}` : "no build-origin label: built before labels were recorded, rebuild to get them");
    const sha = L[DOCKERFILE_LABEL];
    if (!sha) add(registry ? "FAIL" : "SKIPPED", "label dockerfile", `no ${DOCKERFILE_LABEL} label`);
    else if (o.dockerfileSha256) add(sha === o.dockerfileSha256 ? "PASS" : "INFO", "label dockerfile", sha === o.dockerfileSha256 ? `matches this checkout's Dockerfile (${sha.slice(0, 12)})` : `image ${sha.slice(0, 12)}, this checkout ${o.dockerfileSha256.slice(0, 12)}: your checkout may be a different commit than the one that built it`);
    else add("INFO", "label dockerfile", `${sha.slice(0, 12)} (upstream's Dockerfile at the pinned commit: compare with \`git show ${spec.ref.slice(0, 8)}:Dockerfile | sha256sum\` in the VTI checkout)`);
    const rev = L["org.opencontainers.image.revision"];
    if (rev) add("INFO", "built by", `this starter at ${rev.slice(0, 8)}; source ${L["org.opencontainers.image.source"] ?? "?"}`);
  }

  // (d) SBOM ----------------------------------------------------------------------------------------------------------
  if (!registry) add("SKIPPED", "sbom", "local builds ship no SBOM; generate one yourself with `syft <image>` if you want one");
  else if (!target) add("SKIPPED", "sbom", "no digest to look up");
  else if (!ghOk) add("SKIPPED", "sbom", `needs gh to verify and read the SBOM attestation. ${INSTALL_HINT.gh}`);
  else {
    const idx = r.run("docker", ["buildx", "imagetools", "inspect", `${spec.repo}@${target}`, "--raw"]);
    let platformDigest = "";
    try { platformDigest = (JSON.parse(idx.stdout) as { manifests?: Array<{ digest: string; platform?: { os: string; architecture: string } }> }).manifests?.find((m) => m.platform?.os === "linux" && m.platform.architecture === o.arch)?.digest ?? ""; } catch { /* handled below */ }
    if (!platformDigest) add("SKIPPED", "sbom", `could not read the ${o.arch} manifest of the index (offline, or docker buildx missing)`);
    else {
      const x = r.run("gh", ["attestation", "verify", `oci://${spec.repo}@${platformDigest}`, "--repo", o.identity.repo, "--signer-workflow", o.identity.signerWorkflow, "--predicate-type", SPDX_PREDICATE, "--format", "json"]);
      if (x.status !== 0) add(classifyFailure(x.stderr) === "unreachable" ? "SKIPPED" : "FAIL", "sbom", `no verified SBOM attestation for the ${o.arch} image ${short(platformDigest)}: ${tail(x.stderr)}`);
      else add("PASS", "sbom", `${sbomSummary(x.stdout)} (attested for the ${o.arch} image ${short(platformDigest)}; SPDX, generated by syft)`);
    }
  }

  // verdict ------------------------------------------------------------------------------------------------------------
  const failed = lines.filter((l) => l.status === "FAIL");
  const digestOk = !registry || lines.some((l) => l.check === "digest" && l.status === "PASS");
  let verdict: Report["verdict"];
  let why: string;
  if (failed.length) { verdict = "FAILED"; why = `${failed.length} check(s) failed: ${failed.map((f) => f.check).join(", ")}. Do not trust this image.`; }
  else if (!registry) { verdict = "LABELS-ONLY"; why = "Only the labels were checked. They say what the builder claims; they do not prove the contents. See docs/VERIFY.md (images:compare)."; }
  else if (attested && digestOk) { verdict = "VERIFIED"; why = "The digest is the pinned one and the signature names this repository's images workflow. This is provenance, not a security audit (docs/VERIFY.md)."; }
  else { verdict = "INCOMPLETE"; why = `Nothing failed, but it is NOT verified: ${!attested ? "no signature or attestation check passed" : "the digest was not checked against pins.json"}.`; }
  return { kind: spec.kind, image, lines, verdict, why };
}

export function formatReport(rep: Report): string {
  const out = [`${rep.kind}  ${rep.image}`];
  for (const l of rep.lines) out.push(`  ${l.status.padEnd(7)} ${l.check.padEnd(16)} ${l.detail}`);
  out.push(`  => ${rep.verdict}: ${rep.why}`);
  return out.join("\n");
}

/** Exit code: 1 on any FAILED, 2 on INCOMPLETE (unless allowed), else 0. */
export function exitCode(reports: Report[], allowIncomplete: boolean): number {
  if (reports.some((r) => r.verdict === "FAILED")) return 1;
  if (!allowIncomplete && reports.some((r) => r.verdict === "INCOMPLETE")) return 2;
  return 0;
}

/** One line from `gh attestation verify --format json` output for an SPDX attestation. */
export function sbomSummary(json: string): string {
  try {
    const arr = JSON.parse(json) as Array<{ verificationResult?: { statement?: { predicate?: { spdxVersion?: string; packages?: unknown[]; name?: string } } } }>;
    const pred = arr.map((a) => a.verificationResult?.statement?.predicate).find((x) => x && Array.isArray(x.packages));
    if (pred) return `${pred.spdxVersion ?? "SPDX"}, ${pred.packages!.length} packages`;
  } catch { /* fall through */ }
  return "SBOM attestation verified (could not read its package list)";
}

export const sha256File = (file: string): string | undefined => {
  try { return createHash("sha256").update(readFileSync(file)).digest("hex"); } catch { return undefined; }
};

export const dockerArch = (a: string = process.arch) => (a === "x64" ? "amd64" : a === "arm64" ? "arm64" : a);

// --- images:compare ---------------------------------------------------------------------------------------------------

/** Labels that say what an image was built from. A local build and the published image of the same pin should agree on these. */
export const COMPARE_LABELS = ["org.buildathon.upstream-source", "org.buildathon.pinned-ref", "org.buildathon.vti-ref", "org.buildathon.mediator-ref", FEATURES_LABEL, DOCKERFILE_LABEL] as const;
/** Labels that are expected to differ (who built it). */
export const EXPECTED_DIFF = [ORIGIN_LABEL, "org.opencontainers.image.revision", "org.opencontainers.image.source", "org.opencontainers.image.created", "org.opencontainers.image.title", "org.opencontainers.image.description", "org.opencontainers.image.version", "org.opencontainers.image.licenses"] as const;

export interface Side { present: boolean; labels: Record<string, string>; id: string; layers: string[]; repoDigests?: string[] }
export function inspectSide(r: Runner, ref: string): Side {
  const base = inspectImage(r, ref);
  if (!base.present) return { present: false, labels: {}, id: "", layers: [] };
  const l = r.run("docker", ["image", "inspect", ref, "--format", "{{json .RootFS.Layers}}"]);
  let layers: string[] = [];
  try { layers = JSON.parse(l.stdout.trim()) ?? []; } catch { /* leave empty */ }
  return { present: true, labels: base.labels, id: base.id, layers, repoDigests: base.repoDigests };
}

/** Line a local build up against the published image. Rebuilds and pulls nothing. Pure. */
export function compareSides(kind: string, local: Side, published: Side): Line[] {
  const lines: Line[] = [];
  const add = (status: Status, check: string, detail: string) => lines.push({ status, check, detail });
  if (!local.present) { add("SKIPPED", "local", `no local build of ${kind}: npm run images:build ${kind}`); return lines; }
  if (!published.present) { add("SKIPPED", "published", `the published ${kind} image is not pulled: npm run images:pull ${kind}`); return lines; }
  if (published.repoDigests && published.repoDigests.length === 0) add("INFO", "published copy", "this copy has no registry digest: it was tagged locally (a retag of a local build?), not pulled. Comparing against it proves nothing; `npm run images:pull -- <kind> --force` first");
  for (const k of COMPARE_LABELS) {
    const a = local.labels[k], b = published.labels[k];
    if (a === undefined && b === undefined) continue;
    if (a === undefined || b === undefined) add("FAIL", k.replace("org.buildathon.", ""), `${a === undefined ? "local build has no" : "published image has no"} ${k} label (an old build? rebuild)`);
    else add(a === b ? "PASS" : "FAIL", k.replace("org.buildathon.", ""), a === b ? a.slice(0, 40) : `local ${a.slice(0, 40)} vs published ${b.slice(0, 40)}`);
  }
  const diff = EXPECTED_DIFF.filter((k) => local.labels[k] !== published.labels[k]);
  if (diff.length) add("INFO", "expected to differ", diff.map((k) => k.replace("org.opencontainers.image.", "oci.").replace("org.buildathon.", "")).join(", "));
  if (local.id === published.id) add("PASS", "image id", `identical (${short(local.id)}): the two images are the same bytes`);
  else {
    let common = 0;
    while (common < local.layers.length && common < published.layers.length && local.layers[common] === published.layers[common]) common++;
    add("INFO", "image id", `different (local ${short(local.id)}, published ${short(published.id)}). This is NORMAL: bit-for-bit reproducibility is not claimed`);
    add("INFO", "layers", `local ${local.layers.length}, published ${published.layers.length}, identical from the bottom: ${common}. The runtime layers (base image, apt packages) can differ by build date; judge the labels and the source pins, not the ID`);
  }
  return lines;
}
