// Static checks of .github/workflows/images.yml. No network, no GitHub: this proves the file is well formed and
// least-privilege, and runs the plan step's script locally. It does NOT prove the workflow works on GitHub.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { buildLabels } from "../lib/images.js";
import { pins } from "../pins.js";

const root = new URL("../../", import.meta.url);
const raw = readFileSync(new URL(".github/workflows/images.yml", root), "utf8");
type Step = { name?: string; id?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string>; if?: string };
type Job = { if?: string; permissions?: Record<string, string>; "timeout-minutes"?: unknown; steps: Step[]; needs?: unknown; strategy?: unknown };
const wf = parse(raw) as { on: Record<string, any>; permissions: Record<string, string>; jobs: Record<string, Job>; concurrency: Record<string, unknown> };
const jobs = Object.entries(wf.jobs);
const steps = jobs.flatMap(([name, j]) => j.steps.map((s) => ({ job: name, ...s })));

test("triggers: manual and images-* tags only, never pull requests", () => {
  assert.deepEqual(Object.keys(wf.on).sort(), ["push", "workflow_dispatch"]);
  assert.deepEqual(wf.on.push, { tags: ["images-*"] });
  assert.ok(!/pull_request/.test(raw.replace(/^\s*#.*$/gm, "")), "no pull_request trigger");
  assert.deepEqual(wf.on.workflow_dispatch.inputs.images.options, ["all", "vta", "vtc", "mediator"]);
  assert.equal(wf.on.workflow_dispatch.inputs.push.default, true);
});

test("permissions: read-only by default; packages: write only where images or attestations are pushed; id-token only on attest and sign", () => {
  assert.deepEqual(wf.permissions, { contents: "read" });
  for (const [name, j] of jobs) {
    if (name === "build" || name === "merge") assert.deepEqual(j.permissions, { contents: "read", packages: "write" }, name);
    else if (name === "attest" || name === "sign") assert.deepEqual(j.permissions, { contents: "read", packages: "write", "id-token": "write", attestations: "write" }, name);
    else assert.equal(j.permissions, undefined, `${name} inherits the read-only default`);
  }
  // The job that runs the upstream build never gets the OIDC token (it could otherwise mint a signing identity).
  assert.ok(!("id-token" in (wf.jobs.build!.permissions ?? {})));
  assert.ok(!/(write-all|actions:\s*write|contents:\s*write)/.test(raw));
  assert.equal([...raw.replace(/^\s*#.*$/gm, "").matchAll(/id-token:\s*write/g)].length, 2);
});

test("every `uses:` is pinned to a full commit SHA and says which release", () => {
  const uses = raw.split("\n").filter((l) => /^\s*(-\s+)?uses:/.test(l));
  assert.ok(uses.length >= 8);
  for (const l of uses) assert.match(l, /uses:\s+[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/, l);
  for (const s of steps) if (s.uses) assert.match(s.uses, /@[0-9a-f]{40}$/);
  // The registry login is the official action and nothing else handles the token.
  assert.deepEqual([...new Set(steps.filter((s) => s.uses).map((s) => s.uses!.split("@")[0]))].sort(),
    ["actions/attest-build-provenance", "actions/attest-sbom", "actions/checkout", "actions/download-artifact", "actions/upload-artifact", "anchore/sbom-action",
      "docker/build-push-action", "docker/login-action", "docker/setup-buildx-action", "sigstore/cosign-installer"]);
});

test("every job has a timeout, and the build legs take theirs from the matrix", () => {
  for (const [name, j] of jobs) assert.ok(j["timeout-minutes"] !== undefined, `${name} needs timeout-minutes`);
  assert.match(String(wf.jobs.build!["timeout-minutes"]), /matrix\.timeout/);
});

test("no expression is interpolated into a shell script (inputs go through env)", () => {
  for (const s of steps) if (s.run) assert.ok(!s.run.includes("${{"), `${s.job}: run: must not contain \${{ }}`);
  const plan = wf.jobs.plan!.steps.find((s) => s.id === "plan")!;
  assert.ok(plan.env?.SELECT && plan.env.PUSH && "REGISTRY_INPUT" in plan.env);
});

test("only the push-capable steps see the token, and it is GITHUB_TOKEN", () => {
  const logins = steps.filter((s) => s.uses?.startsWith("docker/login-action"));
  assert.equal(logins.length, 4);
  for (const l of logins) assert.deepEqual(l.with, { registry: "ghcr.io", username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" });
  assert.deepEqual([...raw.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i), ["GITHUB_TOKEN"]);
  assert.equal(steps.filter((s) => s.uses?.startsWith("actions/checkout")).every((s) => s.with?.["persist-credentials"] === false), true);
});

test("build step: by-digest push, labels pins:check reads, repository link, no provenance clutter", () => {
  const b = wf.jobs.build!.steps.find((s) => s.id === "build")!;
  const w = b.with as Record<string, string>;
  assert.match(w.outputs, /push-by-digest=true/);
  assert.match(w.outputs, /name-canonical=true/);
  // BuildKit's own provenance/sbom would make the by-digest push an index; the attest job does both instead.
  assert.equal(w.provenance, false);
  assert.equal(w.sbom, false);
  assert.ok(w.labels.includes("org.buildathon.dockerfile-sha256=${{ steps.dockerfile.outputs.sha256 }}"));
  assert.ok(w.labels.includes("org.buildathon.build-origin=github-actions"));
  assert.match(w.platforms, /matrix\.platform/);
  assert.match(w["build-args"], /matrix\.build_args/);
  assert.match(w.labels, /org\.opencontainers\.image\.source=https:\/\/github\.com\/\$\{\{ github\.repository \}\}/);
  for (const l of ["org.opencontainers.image.revision", "org.opencontainers.image.licenses=Apache-2.0", "org.buildathon.pinned-ref", "org.buildathon.upstream-source", "${{ matrix.ref_label }}=${{ matrix.ref }}", "${{ matrix.extra_labels }}"]) {
    assert.ok(w.labels.includes(l), `label ${l}`);
  }
  // A dry run (push=false) pushes nothing: no login, no digest upload.
  for (const name of ["Log in to GHCR", "Record digest", "Upload digest"]) {
    assert.match(wf.jobs.build!.steps.find((s) => s.name === name)!.if ?? "", /outputs\.push == 'true'/);
  }
  assert.match(wf.jobs.merge!.if!, /push == 'true'/);
});

test("the workflow records the same label keys that images:build records", () => {
  const w = wf.jobs.build!.steps.find((s) => s.id === "build")!.with as Record<string, string>;
  const p = pins();
  for (const kind of ["vta", "vtc", "mediator"] as const) {
    for (const key of Object.keys(buildLabels(kind, p, { dockerfileSha256: "0".repeat(64) }))) {
      // the ref label and (VTA only) the features label are templated through the plan matrix
      const templated = key === "org.buildathon.vta-features" ? "matrix.extra_labels" : key.endsWith("-ref") && key !== "org.buildathon.pinned-ref" ? "matrix.ref_label" : key;
      assert.ok(w.labels.includes(templated), `${kind}: workflow label ${key}`);
    }
  }
  const dockerfile = wf.jobs.build!.steps.find((s) => s.name === "Hash the Dockerfile")!;
  assert.equal(dockerfile.env!.DOCKERFILE, "${{ matrix.file }}");
});

test("the upstream source is fetched at the exact pinned commit and verified", () => {
  const fetch = wf.jobs.build!.steps.find((s) => s.name === "Fetch upstream source at the pinned commit")!;
  assert.match(fetch.run!, /fetch -q --depth 1 origin "\$REF"/);
  assert.match(fetch.run!, /test "\$\(git -C src rev-parse HEAD\)" = "\$REF"/);
  assert.equal(fetch.if, "matrix.needs_src");
});

const step = (job: string, name: string) => wf.jobs[job]!.steps.find((s) => s.name === name)!;

test("attest: SBOM and provenance for every platform image, subject = the pushed digest, stored in the registry", () => {
  const j = wf.jobs.attest!;
  assert.match(j.if!, /push == 'true'/);
  assert.deepEqual(j.needs, ["plan", "build"]);
  const sbom = step("attest", "Generate the SBOM").with as Record<string, unknown>;
  assert.match(String(sbom.image), /matrix\.repo.*steps\.image\.outputs\.digest/);
  assert.equal(sbom.format, "spdx-json");
  for (const name of ["Attest the SBOM", "Attest the build provenance"]) {
    const w = step("attest", name).with as Record<string, unknown>;
    assert.equal(w["subject-name"], "${{ matrix.repo }}", name);
    assert.equal(w["subject-digest"], "${{ steps.image.outputs.digest }}", name);
    assert.equal(w["push-to-registry"], true, name);
  }
  assert.equal((step("attest", "Attest the SBOM").with as Record<string, unknown>)["sbom-path"], sbom["output-file"]);
  // each leg reads only its own digest artifact
  assert.equal(wf.jobs.attest!.steps[0]!.with!.name, "digest-${{ matrix.kind }}-${{ matrix.arch }}");
});

test("sign: provenance for the index digest and a keyless cosign signature by digest, checked at once", () => {
  const j = wf.jobs.sign!;
  assert.deepEqual(j.needs, ["plan", "merge"]);
  assert.match(j.if!, /push == 'true'/);
  const prov = step("sign", "Attest the build provenance of the index").with as Record<string, unknown>;
  assert.equal(prov["subject-digest"], "${{ steps.index.outputs.digest }}");
  assert.equal(prov["push-to-registry"], true);
  const sign = step("sign", "Sign the index digest and check the signature");
  assert.match(sign.run!, /cosign sign --yes "\$REPO@\$DIGEST"/);
  assert.ok(!/cosign sign[^\n]*:\$\{?SHORT|cosign sign[^\n]*:[a-z]/.test(sign.run!), "signs a digest, never a tag");
  assert.match(sign.run!, /cosign verify "\$REPO@\$DIGEST"/);
  assert.match(sign.run!, /--certificate-identity "https:\/\/github\.com\/\$GITHUB_WORKFLOW_REF"/);
  assert.match(sign.run!, /--certificate-oidc-issuer https:\/\/token\.actions\.githubusercontent\.com/);
  assert.ok(!/--insecure|--allow-insecure|--force|--yes=false/.test(sign.run!));
  assert.ok(!/COSIGN_(PASSWORD|PRIVATE_KEY)|--key/.test(raw), "keyless: no stored key");
  assert.deepEqual(wf.jobs.digests!.needs, ["plan", "merge", "attest", "sign"], "a digest is reported only after it was attested and signed");
});

test("the identity that images:verify expects is the workflow this file is", () => {
  const p = pins() as unknown as { images: { verify: { repo: string; workflow: string } } };
  assert.equal(p.images.verify.workflow, ".github/workflows/images.yml");
  assert.ok(raw.includes("name: images"));
  assert.match(p.images.verify.repo, /^[\w.-]+\/[\w.-]+$/);
});

test("every run: script is syntactically valid bash", () => {
  for (const s of steps) {
    if (!s.run) continue;
    const r = spawnSync("bash", ["-n"], { input: s.run, encoding: "utf8" });
    assert.equal(r.status, 0, `${s.job}/${s.name ?? s.id}: ${r.stderr}`);
  }
});

// --- run the plan step's script locally against pins.json (needs bash and jq; no network) ---------------------

const have = (c: string) => spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0;
const planScript = wf.jobs.plan!.steps.find((s) => s.id === "plan")!.run!;
function plan(env: Record<string, string | undefined>) {
  const dir = mkdtempSync(join(tmpdir(), "plan-"));
  try {
    const out = join(dir, "out");
    const summary = join(dir, "summary");
    writeFileSync(out, "");
    writeFileSync(summary, "");
    const r = spawnSync("bash", ["-c", planScript], {
      cwd: new URL(".", root), encoding: "utf8",
      env: { PATH: process.env.PATH!, SELECT: "all", REGISTRY_INPUT: "", PUSH: "true", GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary, ...env },
    });
    const kv = Object.fromEntries(readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    return { status: r.status, stderr: r.stderr, out: kv };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("plan step: matrix is every image on both platforms, built from the pins", { skip: !have("jq") }, () => {
  const p = pins();
  const r = plan({});
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.out.matrix!) as Array<Record<string, string | boolean | number>>;
  assert.equal(m.length, 6);
  assert.deepEqual(m.map((l) => `${l.kind}/${l.arch}`).sort(), ["mediator/amd64", "mediator/arm64", "vta/amd64", "vta/arm64", "vtc/amd64", "vtc/arm64"]);
  for (const l of m) {
    assert.equal(l.runner, l.arch === "arm64" ? "ubuntu-24.04-arm" : "ubuntu-24.04");
    assert.equal(l.platform, `linux/${l.arch}`);
    assert.match(String(l.repo), new RegExp(`^${p.images.registry}/`));
    assert.equal(String(l.short).length, 8);
  }
  const vta = m.find((l) => l.kind === "vta")!;
  assert.equal(vta.ref, p.vti.vta.ref);
  assert.match(String(vta.build_args), new RegExp(`VTI_REF=${p.vti.vta.ref}\\nFEATURES=${p.vti.vta.features}`));
  assert.ok(String(p.vti.vta.features).split(",").includes("tsp"), "the VTA is built with tsp");
  assert.match(String(vta.extra_labels), /^org\.buildathon\.vta-features=.*tsp/);
  assert.equal(vta.file, "src/Dockerfile");
  const vtc = m.find((l) => l.kind === "vtc")!;
  assert.equal(vtc.ref, p.vti.vtc.ref);
  assert.equal(vtc.file, "docker/vtc.Dockerfile");
  const med = m.find((l) => l.kind === "mediator")!;
  assert.equal(med.ref, p.messaging.mediator.ref);
  assert.match(String(med.build_args), new RegExp(`MEDIATOR_REF=${p.messaging.mediator.ref}\\nFEATURES=${p.messaging.mediator.features}`));
  assert.equal(med.needs_src, false);
  for (const l of m) assert.ok(Number(l.timeout) >= 60 && Number(l.timeout) <= 180);
  // refs and labels agree with what pins:check reads
  assert.equal(vta.ref_label, "org.buildathon.vti-ref");
  assert.equal(med.ref_label, "org.buildathon.mediator-ref");
  assert.equal(r.out.push, "true");
  assert.equal(r.out.registry, p.images.registry);
  assert.equal(r.out.platforms, JSON.stringify(p.images.platforms));
});

test("plan step: one image, dry run, registry override; bad values are refused", { skip: !have("jq") }, () => {
  const one = plan({ SELECT: "mediator", PUSH: "false", REGISTRY_INPUT: "ghcr.io/some-org/" });
  assert.equal(one.status, 0, one.stderr);
  assert.equal(JSON.parse(one.out.matrix!).length, 2);
  assert.equal(one.out.push, "false");
  assert.equal(one.out.registry, "ghcr.io/some-org");
  assert.match(JSON.parse(one.out.kinds!)[0].repo, /^ghcr\.io\/some-org\/mediator-buildathon$/);
  for (const bad of [{ SELECT: "everything" }, { PUSH: "maybe" }, { REGISTRY_INPUT: "docker.io/x" }, { REGISTRY_INPUT: "ghcr.io/Upper" }, { REGISTRY_INPUT: "ghcr.io/a b" }]) {
    assert.notEqual(plan(bad).status, 0, JSON.stringify(bad));
  }
});

test("the build job adds swap before it builds (Rust builds were OOM-killed on the first real run)", () => {
  const names = wf.jobs.build!.steps.map((s) => s.name ?? "");
  const swap = names.indexOf("Add swap");
  assert.ok(swap >= 0 && swap < names.indexOf("Build"), "Add swap must come before Build");
});
