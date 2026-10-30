import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { DEFAULT_VTC_URL, devProxy, VTA_PROXY, VTC_PROXY } from "../../scripts/lib/dev-proxy.ts";
import { agentUrl, farmId, type FarmTable } from "../../scripts/farm-select.ts";

// Reads the repo-root .env. DEV ONLY: VTA_CREDENTIAL holds a private key and is
// exposed to the page so the demo can act as the provisioned app.
//
// Every mode (local, tunnel, farm): the page calls /__vta and /__vtc on its own origin and Vite forwards to the URLs in the repo-root
// .env (public quick-tunnel hosts in tunnel mode, hosted agents in farm mode), so CORS never applies and any dev-server port works.
// Farm VTAs would refuse http://localhost:5173 anyway (their CORS list holds only the wallet extension).
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
  // VTC_APPLICANT=did:peer (tunnel only): apply as a did:peer:2 naming the stack's mediator (.vta/tunnel.json), so the VTC can push to it.
  const applicant = (process.env.VTC_APPLICANT ?? e.VTC_APPLICANT ?? "").trim().toLowerCase().replace(/^peer$/, "did:peer") === "did:peer" ? "did:peer" : "did:key";
  let mediatorDid: string | null = null;
  try { mediatorDid = tunnel ? (JSON.parse(readFileSync(new URL("../../.vta/tunnel.json", import.meta.url), "utf8")).mediatorDid ?? null) : null; } catch { /* no tunnel state */ }

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

  const proxy = devProxy({ vtaUrl: e.VTA_URL, vtcUrl: vtcUrl ?? DEFAULT_VTC_URL });

  return {
    envDir: "../..",
    envPrefix: ["VITE_", "VTA_", "VTC_"],
    plugins: [react()],
    define: {
      __FARM__: JSON.stringify(farm),
      __TUNNEL__: JSON.stringify(tunnel),
      __APPLICANT__: JSON.stringify(applicant),
      __MEDIATOR_DID__: JSON.stringify(mediatorDid),
      __VTA_BROWSER_URL__: JSON.stringify(VTA_PROXY),
      __VTA_URL__: JSON.stringify(e.VTA_URL ?? "http://localhost:8100"),
      __VTC_BROWSER_URL__: JSON.stringify(VTC_PROXY),
      __VTC_URL__: JSON.stringify(vtcUrl ?? "http://localhost:8200"),
      __FARM_INFO__: JSON.stringify(farm ? farmInfo : null),
      __PIN__: JSON.stringify(pin),
    },
    // 5173 is only the preferred port: the proxy keeps the page same-origin, so Vite may move to 5174 or you can pass `--port 3050`.
    server: { port: 5173, proxy },
    build: { target: "es2022" },
  };
});
