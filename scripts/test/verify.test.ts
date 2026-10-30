// images:verify / images:compare logic against a mocked command runner: no Docker, gh, cosign or network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { imageSpecs } from "../lib/images.js";
import {
  classifyFailure, compareSides, exitCode, formatReport, identityFor, sbomSummary, verifyImage,
  type CmdResult, type Report, type Runner, type Side,
} from "../lib/verify.js";
import { pins, type Pins } from "../pins.js";

const D = `sha256:${"a".repeat(64)}`;
const D_ARM = `sha256:${"b".repeat(64)}`;
const D_AMD = `sha256:${"c".repeat(64)}`;
const withDigest = (kind: "vta" | "vtc" | "mediator", d: string | null): Pins => { const p = structuredClone(pins()); p.images[kind].digest = d; return p; };
const identity = identityFor(pins());
const ok = (stdout = ""): CmdResult => ({ status: 0, stdout, stderr: "" });
const bad = (stderr: string): CmdResult => ({ status: 1, stdout: "", stderr });

interface Env { tools?: string[]; image?: { labels: Record<string, string>; repoDigests: string[]; id?: string }; gh?: CmdResult; cosign?: CmdResult; sbom?: CmdResult; docker?: boolean }
/** A runner that answers the commands verifyImage issues, and records them. */
function runner(e: Env): Runner & { calls: string[] } {
  const tools = e.tools ?? ["gh", "cosign"];
  const calls: string[] = [];
  return {
    calls,
    run(cmd, args) {
      calls.push([cmd, ...args].join(" "));
      if (args[0] === "--version") return tools.includes(cmd) ? ok("x") : { status: null, stdout: "", stderr: "spawn ENOENT" };
      if (cmd === "docker" && args[0] === "version") return e.docker === false ? bad("Cannot connect to the Docker daemon") : ok("27");
      if (cmd === "docker" && args[0] === "image") return e.image ? ok(`${JSON.stringify(e.image.labels)}|${JSON.stringify(e.image.repoDigests)}|${e.image.id ?? "sha256:" + "9".repeat(64)}`) : bad("No such image");
      if (cmd === "docker" && args[0] === "buildx") return ok(JSON.stringify({ manifests: [{ digest: D_ARM, platform: { os: "linux", architecture: "arm64" } }, { digest: D_AMD, platform: { os: "linux", architecture: "amd64" } }, { digest: "sha256:" + "d".repeat(64), platform: { os: "unknown", architecture: "unknown" } }] }));
      if (cmd === "gh") return args.includes("--predicate-type") ? (e.sbom ?? ok("[]")) : (e.gh ?? ok("[]"));
      if (cmd === "cosign") return e.cosign ?? ok("");
      throw new Error(`unexpected ${cmd} ${args.join(" ")}`);
    },
  };
}
const goodLabels = (kind: "vta" | "vtc" | "mediator", p = pins()): Record<string, string> => {
  const s = imageSpecs(p)[kind];
  return { [s.refLabel]: s.ref, "org.buildathon.pinned-ref": s.ref, "org.buildathon.build-origin": "github-actions", "org.buildathon.dockerfile-sha256": "f".repeat(64),
    "org.opencontainers.image.revision": "1".repeat(40), ...(kind === "vta" ? { "org.buildathon.vta-features": p.vti.vta.features! } : {}) };
};
const get = (rep: Report, check: string) => rep.lines.filter((l) => l.check === check);
const run = (kind: "vta" | "vtc" | "mediator", p: Pins, e: Env, source: "registry" | "local" = "registry", dockerfileSha256?: string) =>
  verifyImage(imageSpecs(p)[kind], p, runner(e), { source, identity, arch: "amd64", dockerfileSha256 });

test("identity: this repository's images workflow, main or an images-* tag, via GitHub OIDC; VERIFY_REPO swaps the repo", () => {
  assert.equal(identity.repo, pins().images.verify.repo);
  assert.equal(identity.signerWorkflow, `${identity.repo}/.github/workflows/images.yml`);
  assert.equal(identity.issuer, "https://token.actions.githubusercontent.com");
  const re = new RegExp(identity.san);
  const base = `https://github.com/${identity.repo}/.github/workflows/images.yml`;
  assert.ok(re.test(`${base}@refs/heads/main`));
  assert.ok(re.test(`${base}@refs/tags/images-2026-11-01`));
  assert.ok(!re.test(`${base}@refs/heads/some-branch`));
  assert.ok(!re.test(`https://github.com/evil/${identity.repo.split("/")[1]}/.github/workflows/images.yml@refs/heads/main`));
  assert.ok(!re.test(`${base}x@refs/heads/main`), "the dots are literal");
  assert.equal(identityFor(pins(), "my-org/fork").repo, "my-org/fork");
  assert.throws(() => identityFor(pins(), "not a repo"));
});

test("everything holds: VERIFIED, with gh and cosign both checked and an SBOM summary", () => {
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const sbom = JSON.stringify([{ verificationResult: { statement: { predicate: { spdxVersion: "SPDX-2.3", packages: [1, 2, 3] } } } }]);
  const rep = run("vtc", p, { image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] }, sbom: ok(sbom) });
  assert.equal(rep.verdict, "VERIFIED", formatReport(rep));
  assert.equal(get(rep, "digest")[0]!.status, "PASS");
  assert.equal(get(rep, "gh attestation")[0]!.status, "PASS");
  assert.equal(get(rep, "cosign signature")[0]!.status, "PASS");
  assert.equal(get(rep, "sbom")[0]!.status, "PASS");
  assert.match(get(rep, "sbom")[0]!.detail, /SPDX-2\.3, 3 packages.*amd64/);
  assert.equal(exitCode([rep], false), 0);
});

test("the exact commands: digest-addressed, this repo, the workflow identity, the SPDX predicate on the host-arch image", () => {
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const r = runner({ image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] } });
  verifyImage(spec, p, r, { source: "registry", identity, arch: "amd64" });
  const subject = `${spec.repo}@${D}`;
  assert.ok(r.calls.includes(`gh attestation verify oci://${subject} --repo ${identity.repo} --signer-workflow ${identity.signerWorkflow} --format json`), r.calls.join("\n"));
  assert.ok(r.calls.includes(`cosign verify ${subject} --certificate-identity-regexp ${identity.san} --certificate-oidc-issuer ${identity.issuer}`));
  assert.ok(r.calls.some((c) => c.startsWith(`gh attestation verify oci://${spec.repo}@${D_AMD} `) && c.includes("--predicate-type https://spdx.dev/Document/v2.3")));
  assert.ok(!r.calls.some((c) => /\bpull\b|docker login|push/.test(c)), "verify never pulls or pushes");
});

test("digest mismatch is a FAIL, and so is a failed signature", () => {
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const rep = run("vtc", p, { image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@sha256:${"e".repeat(64)}`] } });
  assert.equal(get(rep, "digest")[0]!.status, "FAIL");
  assert.equal(rep.verdict, "FAILED");
  assert.equal(exitCode([rep], true), 1, "--allow-incomplete never turns a failure into success");
  const unsigned = run("vtc", p, { image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] }, gh: bad("no attestations found for the subject"), cosign: bad("Error: no signatures found") });
  assert.equal(get(unsigned, "gh attestation")[0]!.status, "FAIL");
  assert.equal(get(unsigned, "cosign signature")[0]!.status, "FAIL");
  assert.equal(unsigned.verdict, "FAILED");
});

test("neither gh nor cosign: SKIPPED with install hints, verdict INCOMPLETE, exit 2 (never a silent pass)", () => {
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const rep = run("vtc", p, { tools: [], image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] } });
  const sig = get(rep, "signature")[0]!;
  assert.equal(sig.status, "SKIPPED");
  assert.match(sig.detail, /NOT CHECKED.*gh.*cosign/);
  assert.match(sig.detail, /cli\.github\.com/);
  assert.match(sig.detail, /sigstore/);
  assert.equal(rep.verdict, "INCOMPLETE");
  assert.equal(exitCode([rep], false), 2);
  assert.equal(exitCode([rep], true), 0);
  assert.ok(!rep.lines.some((l) => l.status === "PASS" && /signature|attestation/.test(l.check)));
});

test("only cosign installed: the signature is checked, the SBOM is skipped, still VERIFIED", () => {
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const rep = run("vtc", p, { tools: ["cosign"], image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] } });
  assert.equal(get(rep, "cosign signature")[0]!.status, "PASS");
  assert.equal(get(rep, "gh attestation")[0]!.status, "SKIPPED");
  assert.equal(get(rep, "sbom")[0]!.status, "SKIPPED");
  assert.equal(rep.verdict, "VERIFIED");
});

test("offline or not logged in is SKIPPED (could not check), not FAIL and not PASS", () => {
  assert.equal(classifyFailure("dial tcp: lookup api.github.com: no such host"), "unreachable");
  assert.equal(classifyFailure("To authenticate, run: gh auth login"), "unreachable");
  assert.equal(classifyFailure("no attestations found"), "rejected");
  assert.equal(classifyFailure("certificate identity did not match"), "rejected");
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const rep = run("vtc", p, { image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] }, gh: bad("dial tcp: i/o timeout"), cosign: bad("error: connection refused") });
  assert.equal(get(rep, "gh attestation")[0]!.status, "SKIPPED");
  assert.equal(get(rep, "cosign signature")[0]!.status, "SKIPPED");
  assert.equal(rep.verdict, "INCOMPLETE");
});

test("no digest in pins.json: the digest check is SKIPPED loudly, a pulled copy's digest is checked but not vouched for", () => {
  const p = pins();
  assert.equal(p.images.vtc.digest, null);
  const spec = imageSpecs(p).vtc;
  const rep = run("vtc", p, { image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] } });
  assert.equal(get(rep, "digest")[0]!.status, "SKIPPED");
  assert.match(get(rep, "digest")[0]!.detail, /no digest/);
  assert.match(get(rep, "digest")[1]!.detail, /does not vouch/);
  assert.equal(get(rep, "cosign signature")[0]!.status, "PASS");
  assert.equal(rep.verdict, "INCOMPLETE", "a signature alone is not enough when the pin records no digest");
  // not pulled and no digest: nothing to look at
  const none = run("vtc", p, {});
  assert.equal(get(none, "signature")[0]!.status, "SKIPPED");
  assert.equal(get(none, "labels")[0]!.status, "SKIPPED");
  assert.equal(none.verdict, "INCOMPLETE");
});

test("labels vs pins: ref, features including tsp, origin; a registry image missing them is FAIL", () => {
  const p = withDigest("vta", D);
  const spec = imageSpecs(p).vta;
  const base = { repoDigests: [`${spec.repo}@${D}`] };
  const good = run("vta", p, { image: { ...base, labels: goodLabels("vta", p) } });
  assert.deepEqual(["label ref", "label features", "label origin"].map((c) => get(good, c)[0]!.status), ["PASS", "PASS", "PASS"]);
  const wrongRef = run("vta", p, { image: { ...base, labels: { ...goodLabels("vta", p), "org.buildathon.vti-ref": "f".repeat(40) } } });
  assert.equal(get(wrongRef, "label ref")[0]!.status, "FAIL");
  assert.equal(wrongRef.verdict, "FAILED");
  const noTsp = run("vta", p, { image: { ...base, labels: { ...goodLabels("vta", p), "org.buildathon.vta-features": "setup,rest" } } });
  assert.equal(get(noTsp, "label features")[0]!.status, "FAIL");
  const pTsp = structuredClone(p); pTsp.vti.vta.features = "setup,rest";
  const specNoTsp = imageSpecs(pTsp).vta;
  const noTspPinned = verifyImage(specNoTsp, pTsp, runner({ image: { ...base, labels: { ...goodLabels("vta", pTsp) } } }), { source: "registry", identity, arch: "amd64" });
  assert.match(get(noTspPinned, "label features")[0]!.detail, /no tsp/);
  const unlabelled = run("vta", p, { image: { ...base, labels: {} } });
  assert.equal(get(unlabelled, "label ref")[0]!.status, "FAIL");
  const mediator = run("mediator", withDigest("mediator", D), { image: { repoDigests: [`${imageSpecs(p).mediator.repo}@${D}`], labels: goodLabels("mediator") } });
  assert.equal(get(mediator, "label ref")[0]!.status, "PASS");
  assert.match(get(mediator, "label ref")[0]!.detail, /mediator-ref/);
});

test("Dockerfile hash: equal to this checkout's is PASS, different is only INFO (the checkout may be another commit)", () => {
  const p = withDigest("vtc", D);
  const spec = imageSpecs(p).vtc;
  const e = { image: { labels: goodLabels("vtc", p), repoDigests: [`${spec.repo}@${D}`] } };
  assert.equal(get(run("vtc", p, e, "registry", "f".repeat(64)), "label dockerfile")[0]!.status, "PASS");
  const diff = run("vtc", p, e, "registry", "0".repeat(64));
  assert.equal(get(diff, "label dockerfile")[0]!.status, "INFO");
  assert.equal(diff.verdict, "VERIFIED");
});

test("local build: labels only, nothing signed, and the verdict says it cannot prove contents", () => {
  const p = pins();
  const labels = { "org.buildathon.vti-ref": p.vti.vtc.ref, "org.buildathon.pinned-ref": p.vti.vtc.ref, "org.buildathon.build-origin": "local", "org.buildathon.dockerfile-sha256": "a".repeat(64) };
  const rep = run("vtc", p, { image: { labels, repoDigests: [] } }, "local");
  assert.equal(rep.verdict, "LABELS-ONLY");
  assert.match(rep.why, /do not prove the contents/);
  assert.equal(get(rep, "label ref")[0]!.status, "PASS");
  for (const c of ["digest", "signature", "sbom"]) assert.equal(get(rep, c)[0]!.status, "SKIPPED", c);
  assert.equal(exitCode([rep], false), 0);
  // an old local build without labels: skipped, not failed
  const old = run("vta", p, { image: { labels: {}, repoDigests: [] } }, "local");
  assert.equal(get(old, "label ref")[0]!.status, "SKIPPED");
  assert.match(get(old, "label ref")[0]!.detail, /rebuild/);
  // a VTI_LOCAL build is not the pin, and says so
  const wt = run("vtc", p, { image: { labels: { ...labels, "org.buildathon.vti-ref": "local" }, repoDigests: [] } }, "local");
  assert.equal(get(wt, "label ref")[0]!.status, "INFO");
  // a local build from the wrong commit is a FAIL
  const wrong = run("vtc", p, { image: { labels: { ...labels, "org.buildathon.vti-ref": "f".repeat(40) }, repoDigests: [] } }, "local");
  assert.equal(wrong.verdict, "FAILED");
  // not built at all
  assert.equal(get(run("vtc", p, {}, "local"), "labels")[0]!.status, "SKIPPED");
});

test("sbomSummary reads the package count and degrades on anything else", () => {
  assert.equal(sbomSummary(JSON.stringify([{ verificationResult: { statement: { predicate: { spdxVersion: "SPDX-2.3", packages: new Array(412).fill(0) } } } }])), "SPDX-2.3, 412 packages");
  assert.match(sbomSummary("not json"), /could not read/);
});

test("images:compare: provenance labels must agree, the ID may differ and that is explained, nothing is claimed bit-for-bit", () => {
  const labels = { "org.buildathon.upstream-source": "u", "org.buildathon.pinned-ref": "r", "org.buildathon.vti-ref": "r", "org.buildathon.dockerfile-sha256": "h", "org.buildathon.build-origin": "local" };
  const local: Side = { present: true, labels, id: "sha256:" + "1".repeat(64), layers: ["l1", "l2", "l3"] };
  const pub: Side = { present: true, labels: { ...labels, "org.buildathon.build-origin": "github-actions", "org.opencontainers.image.revision": "x" }, id: "sha256:" + "2".repeat(64), layers: ["l1", "l2", "lX", "lY"] };
  const lines = compareSides("vtc", local, pub);
  assert.ok(lines.filter((l) => ["upstream-source", "pinned-ref", "vti-ref", "dockerfile-sha256"].includes(l.check)).every((l) => l.status === "PASS"));
  assert.match(lines.find((l) => l.check === "expected to differ")!.detail, /build-origin/);
  assert.match(lines.find((l) => l.check === "image id")!.detail, /different.*NORMAL.*not claimed/);
  assert.match(lines.find((l) => l.check === "layers")!.detail, /local 3, published 4, identical from the bottom: 2/);
  assert.ok(!lines.some((l) => l.status === "FAIL"));
  const drift = compareSides("vtc", { ...local, labels: { ...labels, "org.buildathon.dockerfile-sha256": "other" } }, pub);
  assert.equal(drift.find((l) => l.check === "dockerfile-sha256")!.status, "FAIL");
  assert.equal(compareSides("vtc", local, { ...local }).find((l) => l.check === "image id")!.status, "PASS");
  assert.equal(compareSides("vtc", { ...local, present: false }, pub)[0]!.status, "SKIPPED");
  assert.match(compareSides("vtc", local, { ...pub, present: false })[0]!.detail, /images:pull vtc/);
});

test("a registry-named image that was only retagged locally is called out, in verify and in compare", () => {
  const p = pins();
  const rep = run("vtc", p, { image: { labels: goodLabels("vtc", p), repoDigests: [] } });
  assert.match(get(rep, "digest").map((l) => l.detail).join(" "), /retag of a local build/);
  const labels = { "org.buildathon.pinned-ref": "r" };
  const side: Side = { present: true, labels, id: "sha256:" + "1".repeat(64), layers: [] };
  assert.match(compareSides("vtc", side, { ...side, repoDigests: [] }).find((l) => l.check === "published copy")!.detail, /retag/);
});
