import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkImageLabels, friendlyPullError, imageSpecs, imageStatus, parseImagesMode, registryBase, resolveImage, useImages, type Docker, type ImageKind,
} from "../lib/images.js";
import { buildLabels, labelArgs, DOCKERFILE_LABEL, NO_DIGEST_WARNING, pullTarget, undigested } from "../lib/images.js";
import { pins, type Pins } from "../pins.js";

const withDigest = (digests: Partial<Record<ImageKind, string | null>>): Pins => {
  const p = pins();
  for (const k of Object.keys(digests) as ImageKind[]) p.images[k].digest = digests[k] ?? null;
  return p;
};
// The real pins.json records digests once the workflow has run; these tests must not depend on that.
const bare = (): Pins => withDigest({ vta: null, vtc: null, mediator: null });
const D = "sha256:" + "a".repeat(64);

/** A fake Docker: `present` is the set of refs, `pullOk` decides pulls, `pulled` records them. */
const fake = (present: string[], pullErr?: string) => {
  const have = new Set(present);
  const pulled: string[] = [];
  const d: Docker = {
    has: (r) => have.has(r),
    pull: (r) => {
      pulled.push(r);
      if (pullErr !== undefined) return { ok: false, stderr: pullErr };
      have.add(r);
      return { ok: true, stderr: "" };
    },
  };
  return { d, pulled, have };
};

test("pins.json images section: registry, platforms, digests null or sha256", () => {
  const p = pins();
  assert.match(p.images.registry, /^ghcr\.io\/[a-z0-9-]+$/);
  assert.deepEqual(p.images.platforms, ["linux/amd64", "linux/arm64"]);
  for (const k of ["vta", "vtc", "mediator"] as const) {
    const d = p.images[k].digest;
    assert.ok(d === null || /^sha256:[0-9a-f]{64}$/.test(d), `${k} digest`);
  }
});

test("specs: names and tags come from the existing pins, tag is the short ref", () => {
  const s = imageSpecs(bare());
  const p = pins();
  assert.equal(s.vta.name, "vta-buildathon");
  assert.equal(s.vta.tagged, `${p.images.registry}/vta-buildathon:${p.vti.vta.ref.slice(0, 8)}`);
  assert.equal(s.vtc.tagged, `${p.images.registry}/vtc-buildathon:${p.vti.vtc.ref.slice(0, 8)}`);
  assert.equal(s.mediator.tagged, `${p.images.registry}/mediator-buildathon:${p.messaging.mediator.ref.slice(0, 8)}`);
  assert.equal(s.vta.local, "vta-buildathon:local");
  assert.equal(s.vta.pinned, s.vta.tagged, "no digest recorded: the tag");
  assert.equal(s.vta.refLabel, "org.buildathon.vti-ref");
  assert.equal(s.mediator.refLabel, "org.buildathon.mediator-ref");
});

test("specs: a recorded digest wins for pulling; a malformed one is rejected", () => {
  const s = imageSpecs(withDigest({ vta: D }));
  assert.equal(s.vta.pinned, `${s.vta.repo}@${D}`);
  assert.equal(s.vtc.pinned, s.vtc.tagged);
  assert.throws(() => imageSpecs(withDigest({ vta: "sha256:abc" })), /images\.vta\.digest/);
});

test("registry override: IMAGE_REGISTRY replaces pins, is validated, trailing slash dropped", () => {
  const p = pins();
  assert.equal(registryBase(p, "localhost:5000/team/"), "localhost:5000/team");
  assert.equal(registryBase(p, ""), p.images.registry);
  assert.equal(registryBase(p, undefined), p.images.registry);
  for (const bad of ["https://ghcr.io/x", "GHCR.io/Org", "ghcr.io/org name", "ghcr.io//x"]) assert.throws(() => registryBase(p, bad), /IMAGE_REGISTRY/);
  assert.equal(imageSpecs(p, "reg.example/x").vtc.repo, "reg.example/x/vtc-buildathon");
});

test("IMAGES mode parsing", () => {
  assert.equal(parseImagesMode(undefined), "auto");
  assert.equal(parseImagesMode(""), "auto");
  assert.equal(parseImagesMode(" Local "), "local");
  assert.equal(parseImagesMode("registry"), "registry");
  assert.throws(() => parseImagesMode("remote"), /IMAGES must be/);
});

test("auto: the pinned registry image present locally is used, even if a local build exists", () => {
  const s = imageSpecs(pins()).vta;
  const { d, pulled } = fake([s.pinned, s.local]);
  assert.deepEqual(resolveImage(s, d, { mode: "auto", pull: true }), { ok: true, kind: "vta", ref: s.pinned, source: "registry" });
  assert.deepEqual(pulled, []);
});

test("auto: a local build is used without touching the network", () => {
  const s = imageSpecs(pins()).vtc;
  const { d, pulled } = fake([s.local]);
  assert.deepEqual(resolveImage(s, d, { mode: "auto", pull: true }), { ok: true, kind: "vtc", ref: s.local, source: "local-build" });
  assert.deepEqual(pulled, []);
});

test("auto: nothing local -> pull the pinned image", () => {
  const s = imageSpecs(withDigest({ vta: D })).vta;
  const { d, pulled } = fake([]);
  assert.deepEqual(resolveImage(s, d, { mode: "auto", pull: true }), { ok: true, kind: "vta", ref: `${s.repo}@${D}`, source: "pulled" });
  assert.deepEqual(pulled, [`${s.repo}@${D}`]);
});

test("auto without pull permission reports needsPull and both ways out", () => {
  const s = imageSpecs(pins()).mediator;
  const r = resolveImage(s, fake([]).d, { mode: "auto", pull: false });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.needsPull, true);
    assert.match(r.message, /images:pull mediator/);
    assert.match(r.message, /images:build mediator/);
  }
});

test("auto: pull fails -> a friendly message that names the local build", () => {
  const s = imageSpecs(pins()).vta;
  const r = resolveImage(s, fake([], "Error response from daemon: Get \"https://ghcr.io/v2/\": dial tcp: lookup ghcr.io: no such host").d, { mode: "auto", pull: true });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.message, /registry could not be reached/);
    assert.match(r.message, /npm run images:build vta/);
    assert.match(r.message, /IMAGES=local/);
  }
});

test("IMAGES=local: only the local tag, never pulls, tells you how to build or unset", () => {
  const s = imageSpecs(pins()).vta;
  const none = fake([s.pinned]);
  const r = resolveImage(s, none.d, { mode: "local", pull: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /IMAGES=local.*images:build vta.*unset IMAGES/);
  assert.deepEqual(none.pulled, []);
  assert.deepEqual(resolveImage(s, fake([s.local]).d, { mode: "local", pull: true }), { ok: true, kind: "vta", ref: s.local, source: "local-build" });
});

test("IMAGES=registry: no fallback to a local build", () => {
  const s = imageSpecs(pins()).vta;
  const f = fake([s.local], "denied");
  const r = resolveImage(s, f.d, { mode: "registry", pull: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /no fallback/);
  assert.deepEqual(f.pulled, [s.pinned]);
});

test("explicit override beats the mode and is never replaced", () => {
  const s = imageSpecs(pins()).vta;
  const f = fake(["mine:1", s.local, s.pinned]);
  assert.deepEqual(resolveImage(s, f.d, { mode: "local", override: "mine:1", pull: true }), { ok: true, kind: "vta", ref: "mine:1", source: "env" });
  const miss = resolveImage(s, fake([s.local]).d, { mode: "auto", override: "mine:2", pull: false });
  assert.equal(miss.ok, false);
  if (!miss.ok) assert.match(miss.message, /VTA_IMAGE=mine:2 is not present/);
});

test("friendly pull errors cover network, daemon, missing and denied", () => {
  assert.match(friendlyPullError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock", "x"), /Docker is not running/);
  assert.match(friendlyPullError("dial tcp: i/o timeout", "x"), /could not be reached/);
  assert.match(friendlyPullError("manifest unknown", "r/x:1"), /r\/x:1 is not published/);
  assert.match(friendlyPullError("no matching manifest for linux/s390x", "x"), /CPU architecture/);
  assert.match(friendlyPullError("denied: requested access to the resource is denied", "x"), /private|public/);
  assert.match(friendlyPullError("???", "x"), /docker pull failed/);
});

test("imageStatus: ready, pullable, missing (doctor hook)", () => {
  const s = imageSpecs(pins());
  const d = fake([s.vta.local, s.vtc.pinned]).d;
  const rows = imageStatus(s, d, "auto");
  assert.deepEqual(rows.map((r) => [r.kind, r.state]), [["vta", "ready"], ["vtc", "ready"], ["mediator", "pullable"]]);
  assert.equal(rows[2]!.fix, "npm run images:pull mediator");
  const local = imageStatus(s, d, "local", ["vtc"]);
  assert.equal(local[0]!.state, "missing");
  assert.equal(imageStatus(s, d, "auto", ["vta"], { vta: "x:1" })[0]!.state, "missing");
});

test("useImages exports the choice for compose and honours an override", () => {
  const p = pins();
  const s = imageSpecs(p);
  const saved = { ...process.env };
  try {
    delete process.env.VTA_IMAGE;
    delete process.env.VTC_IMAGE;
    const env: Record<string, string> = { IMAGES: "auto", VTC_IMAGE: "custom:9" };
    const f = fake([s.vta.pinned, "custom:9"]);
    const out = useImages(p, ["vta", "vtc"], { pull: false, quiet: true, docker: f.d, get: (k) => env[k] });
    assert.deepEqual(out.map((o) => o.ok && o.source), ["registry", "env"]);
    assert.equal(process.env.VTA_IMAGE, s.vta.pinned);
    assert.equal(process.env.VTC_IMAGE, "custom:9", "an override (even one from .env) is exported for child processes");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("compose defaults are the local tags the resolver knows, and the scripts exist", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
  const compose = read("docker-compose.yml");
  const s = imageSpecs(pins());
  for (const k of ["vta", "vtc", "mediator"] as const) {
    assert.ok(compose.includes(`\${${s[k].envVar}:-${s[k].local}}`), `${k}: compose default must be ${s[k].local}`);
  }
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  assert.equal(scripts["images:pull"], "tsx scripts/images-pull.ts");
});

test("pins:check rows: labels, features, digest", () => {
  const p = withDigest({ vta: D });
  const s = imageSpecs(p);
  const good = { "org.buildathon.vti-ref": p.vti.vta.ref, "org.buildathon.vta-features": p.vti.vta.features!, "org.opencontainers.image.revision": "0123456789abcdef" };
  const rows = checkImageLabels(s.vta, p, s.vta.pinned, "registry", good, [`${s.vta.repo}@${D}`]);
  assert.deepEqual(rows.map((r) => r.ok), [true, true, true, null]);
  assert.match(rows[3]!.detail, /01234567/);
  // wrong ref, features without tsp, other digest
  const bad = checkImageLabels(s.vta, p, "r", "registry", { "org.buildathon.vti-ref": "f".repeat(40), "org.buildathon.vta-features": "setup,rest" }, [`${s.vta.repo}@sha256:${"b".repeat(64)}`]);
  assert.deepEqual(bad.map((r) => r.ok), [false, false, false]);
  assert.match(bad[2]!.detail, /images:pull -- vta --force/);
});

test("pins:check rows: a registry image without labels is drift, a local one only info; no digest recorded is info", () => {
  const s = imageSpecs(pins());
  assert.deepEqual(checkImageLabels(s.vtc, pins(), "r", "registry", {}, []).map((r) => r.ok), [false, null]);
  assert.deepEqual(checkImageLabels(s.vtc, pins(), "vtc-buildathon:local", "local", {}, []).map((r) => r.ok), [null]);
  const m = checkImageLabels(s.mediator, pins(), "m", "registry", { "org.buildathon.mediator-ref": pins().messaging.mediator.ref }, []);
  assert.deepEqual(m.map((r) => r.ok), [true, null]);
  const vtaLocal = checkImageLabels(s.vta, pins(), "vta-buildathon:local", "local", {}, []);
  assert.deepEqual(vtaLocal.map((r) => r.ok), [null, null]);
});

test("buildLabels: what a local build records, per image, and VTI_LOCAL says so", () => {
  const p = pins();
  const sha = "a".repeat(64);
  const vta = buildLabels("vta", p, { dockerfileSha256: sha });
  assert.equal(vta["org.buildathon.vti-ref"], p.vti.vta.ref);
  assert.equal(vta["org.buildathon.pinned-ref"], p.vti.vta.ref);
  assert.equal(vta["org.buildathon.vta-features"], p.vti.vta.features);
  assert.ok(vta["org.buildathon.vta-features"]!.split(",").includes("tsp"));
  assert.equal(vta[DOCKERFILE_LABEL], sha);
  assert.equal(vta["org.buildathon.build-origin"], "local");
  assert.equal(vta["org.buildathon.upstream-source"], p.vti.repo);
  const vtc = buildLabels("vtc", p, { dockerfileSha256: sha });
  assert.equal(vtc["org.buildathon.vti-ref"], p.vti.vtc.ref);
  assert.ok(!("org.buildathon.vta-features" in vtc));
  const med = buildLabels("mediator", p, { dockerfileSha256: sha });
  assert.equal(med["org.buildathon.mediator-ref"], p.messaging.mediator.ref);
  assert.equal(med["org.buildathon.upstream-source"], p.messaging.mediator.repo);
  assert.ok(!("org.buildathon.vti-ref" in med));
  assert.equal(buildLabels("vta", p, { dockerfileSha256: sha, ref: "local" })["org.buildathon.vti-ref"], "local");
  assert.deepEqual(labelArgs({ a: "1", b: "x=y" }), ["--label", "a=1", "--label", "b=x=y"]);
});

test("pullTarget: a recorded digest is always pulled by digest; --by-digest refuses a tag; otherwise the tag with a warning flag", () => {
  const D = `sha256:${"a".repeat(64)}`;
  const withD = structuredClone(bare()); withD.images.vtc.digest = D;
  const s = imageSpecs(withD);
  for (const by of [true, false]) {
    const t = pullTarget(s.vtc, by);
    assert.deepEqual(t, { ok: true, ref: `${s.vtc.repo}@${D}`, byTag: false });
  }
  const none = imageSpecs(bare());
  const refused = pullTarget(none.vta, true);
  assert.equal(refused.ok, false);
  assert.match((refused as { message: string }).message, /Nothing was pulled/);
  assert.deepEqual(pullTarget(none.vta, false), { ok: true, ref: none.vta.tagged, byTag: true });
  assert.deepEqual(undigested(none), ["vta", "vtc", "mediator"]);
  assert.deepEqual(undigested(s), ["vta", "mediator"]);
  assert.match(NO_DIGEST_WARNING, /TAG.*moved/);
});
