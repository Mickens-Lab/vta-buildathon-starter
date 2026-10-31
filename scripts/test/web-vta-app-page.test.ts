import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("web-vta-app page: every element id the script uses exists in the HTML", () => {
  const html = read("templates/web-vta-app/index.html");
  const ids = [...read("templates/web-vta-app/src/main.ts").matchAll(/(?:\$(?:<[^>]*>)?|getElementById)\("([a-z-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.includes("tunnel-banner") && ids.includes("status-panel"), "found the ids");
  for (const id of new Set(ids)) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("web-vta-app page: the tunnel banner is hidden unless the script fills it, and only tunnelBanner() decides", () => {
  assert.match(read("templates/web-vta-app/index.html"), /<p id="tunnel-banner"[^>]* hidden><\/p>/);
  const main = read("templates/web-vta-app/src/main.ts");
  assert.match(main, /const banner = tunnelBanner\(mode\);\nif \(banner\) \{/);
});
