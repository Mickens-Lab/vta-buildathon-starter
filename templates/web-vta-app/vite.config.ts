import { readFileSync } from "node:fs";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { devProxy, VTA_PROXY, VTC_PROXY } from "../../scripts/lib/dev-proxy.ts";
import { agentUrl, farmId, type FarmTable } from "../../scripts/farm-select.ts";

// Reads the repo-root .env written by `npm run vta:provision`.
// DEV ONLY: VTA_CREDENTIAL holds a private key and is exposed to the page so
// the demo can act as the provisioned app. For anything real, keep the key on
// a backend, or let the user's wallet sign (see src/main.ts).
//
// Every mode: the page calls /__vta (and /__vtc) on its own origin and Vite forwards to VTA_URL (VTC_URL), so CORS never applies and
// any dev-server port works. Farm mode needs it anyway (a hosted VTA does not allow http://localhost:5173 in its CORS list).
export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, "../..", ["VTA_", "VTC_", "MODE", "FARM"]);
  const farm = (process.env.MODE ?? e.MODE) === "farm";
  const tunnel = (process.env.MODE ?? e.MODE) === "tunnel";
  // FARM=ic3|firstperson + FARM_AGENT=<name> derive the agent URL when VTA_URL is not set.
  const table: FarmTable = JSON.parse(readFileSync(new URL("../../scripts/farm-hosts.json", import.meta.url), "utf8"));
  const fe = (k: string) => process.env[k] ?? e[k];
  if (farm && !e.VTA_URL) {
    const u = agentUrl(table.farms[farmId(table, fe("FARM"))], process.env.VTA_URL, fe("FARM_AGENT"));
    if (u) e.VTA_URL = u;
  }
  const vtcUrl = process.env.VTC_URL ?? e.VTC_URL;
  const vtcDid = process.env.VTC_DID ?? e.VTC_DID;

  // The version this kit is pinned to, for the status panel's version check.
  const pins = JSON.parse(readFileSync(new URL("../../pins.json", import.meta.url), "utf8"));
  const pin = {
    version: pins.vti.vta.version as string,
    imageTag: `${pins.vti.vta.version}-${String(pins.vti.vta.ref).slice(0, 8)}`,
    portalDefault: /\d+\.\d+\.\d+/.exec(String(pins.farm?.portal?.imageTrap ?? ""))?.[0] ?? "0.56.0",
  };

  const fid = farmId(table, fe("FARM"));
  const fentry = table.farms[fid];
  const farmInfo = { id: fid, name: fentry.name, portalUrl: fentry.portalUrl, issues: fentry.issues };

  const proxy = devProxy({ vtaUrl: e.VTA_URL, vtcUrl });

  // Serve this template's README at /README.md (dev): the "dev-only key" badge links to it.
  const readme: Plugin = {
    name: "serve-readme",
    configureServer(s) {
      s.middlewares.use("/README.md", (_req, res) => {
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(readFileSync(new URL("./README.md", import.meta.url)));
      });
    },
  };

  return {
    envDir: "../..",
    envPrefix: ["VITE_", "VTA_"],
    plugins: [readme],
    define: {
      __FARM__: JSON.stringify(farm),
      __TUNNEL__: JSON.stringify(tunnel),
      __VTA_BROWSER_URL__: JSON.stringify(VTA_PROXY),
      __VTA_URL__: JSON.stringify(e.VTA_URL ?? "http://localhost:8100"),
      __FARM_INFO__: JSON.stringify(farm ? farmInfo : null),
      __PIN__: JSON.stringify(pin),
      __VTC__: JSON.stringify(vtcUrl ? { url: vtcUrl, browserUrl: VTC_PROXY, did: vtcDid } : null),
    },
    // 5173 is only the preferred port: the proxy keeps the page same-origin, so Vite may move to 5174 or you can pass `--port 3050`.
    server: { port: 5173, proxy },
    build: { target: "es2022" },
  };
});
