import assert from "node:assert/strict";
import { test } from "node:test";
import { devBanner } from "../banner.js";

function lines(env: Record<string, string | undefined>): string[] {
  const saved = { CI: process.env.CI, QUIET: process.env.QUIET, SHOWN: process.env.DEV_BANNER_SHOWN };
  for (const k of ["CI", "QUIET", "DEV_BANNER_SHOWN"]) delete process.env[k];
  Object.assign(process.env, env);
  const out: string[] = [];
  const log = console.log;
  console.log = (s: string) => void out.push(s);
  try { devBanner(); } finally { console.log = log; }
  for (const [k, v] of [["CI", saved.CI], ["QUIET", saved.QUIET], ["DEV_BANNER_SHOWN", saved.SHOWN]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return out;
}

test("banner prints once-line reminder", () => {
  const out = lines({});
  assert.equal(out.length, 1);
  assert.match(out[0], /DEV ONLY/);
});
test("banner is skipped for CI=1, QUIET=1 and when a parent printed it", () => {
  for (const e of [{ CI: "1" }, { QUIET: "1" }, { DEV_BANNER_SHOWN: "1" }]) assert.deepEqual(lines(e), []);
});
