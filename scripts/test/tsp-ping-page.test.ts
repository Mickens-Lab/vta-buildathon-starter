import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("tsp-ping page: every element id the script uses exists in the HTML", () => {
  const html = read("templates/tsp-ping/index.html");
  const ids = [...read("templates/tsp-ping/src/main.ts").matchAll(/(?:\$(?:<[^>]*>)?|getElementById)\("([a-z]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 6, "found the ids");
  for (const id of new Set(ids)) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("tsp-ping page: port 3000 (in the VTA/VTC CORS defaults), strict, and no credential in tracked files", () => {
  const cfg = read("templates/tsp-ping/vite.config.ts");
  assert.match(cfg, /port: 3000, strictPort: true/);
  assert.match(read("templates/tsp-ping/package.json"), /vite --port 3000/);
  assert.doesNotMatch(read("templates/tsp-ping/index.html"), /value="[^"]+"/, "no prefilled values in the HTML");
});
