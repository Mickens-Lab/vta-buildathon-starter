import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import { agentUrl, farmId, type FarmTable } from "../../scripts/farm-select.ts";

// Reads the repo-root .env. DEV ONLY: VTA_CREDENTIAL holds a private key and is
// exposed to the page so the demo can act as the provisioned app.
//
// MODE=local and MODE=tunnel: the page calls the VTA/VTC directly (CORS allows 5173, 3000 and 8000; in tunnel mode the
//             URLs are the public quick-tunnel hosts from the repo-root .env).
// MODE=farm:  hosted VTAs/VTCs do not allow http://localhost:5173 (the farm's
//             default VTA CORS list holds only the wallet extension), so Vite
//             proxies /__vta and /__vtc to them and the page stays same-origin.
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

  const proxy: Record<string, ProxyOptions> = {};
  const via = (prefix: string, target: string) => ({ target, changeOrigin: true, rewrite: (p: string) => p.replace(new RegExp(`^${prefix}`), "") });
  if (farm && e.VTA_URL) proxy["/__vta"] = via("/__vta", e.VTA_URL);
  if (farm && vtcUrl) proxy["/__vtc"] = via("/__vtc", vtcUrl);

  return {
    envDir: "../..",
    envPrefix: ["VITE_", "VTA_", "VTC_"],
    plugins: [react()],
    define: {
      __FARM__: JSON.stringify(farm),
      __TUNNEL__: JSON.stringify(tunnel),
      __VTA_BROWSER_URL__: JSON.stringify(farm ? "/__vta" : e.VTA_URL ?? "http://localhost:8100"),
      __VTA_URL__: JSON.stringify(e.VTA_URL ?? "http://localhost:8100"),
      __VTC_BROWSER_URL__: JSON.stringify(farm ? "/__vtc" : vtcUrl ?? "http://localhost:8200"),
      __VTC_URL__: JSON.stringify(vtcUrl ?? "http://localhost:8200"),
      __FARM_INFO__: JSON.stringify(farm ? farmInfo : null),
      __PIN__: JSON.stringify(pin),
    },
    // Port 5173 is in the local VTA/VTC CORS allow-list (so are 3000 and 8000: pass `--port 3000`).
    server: { port: 5173, strictPort: true, proxy },
    build: { target: "es2022" },
  };
});
