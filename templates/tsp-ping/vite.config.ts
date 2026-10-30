import { existsSync, readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

// MODE=tunnel only. Defaults for the form come from the stack `npm run up` started: .vta/tunnel.json (the mediator
// DID) and the repo-root .env (VTA_DID, and VTA_CREDENTIAL for the app identity). DEV ONLY: like web-vta-app, this puts
// the app's private key in the page. A TSP login needs a DID on the VTA's ACL; a throwaway did:key is refused (403).
//
// The mediator must allow this page's origin: start the stack with MEDIATOR_CORS_ALLOW_ORIGIN=http://localhost:3000
// (docs/MODES.md, "Browser access"). 3000 is also in the VTA's and VTC's default CORS list.
export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, "../..", ["VTA_", "MODE"]);
  let mediatorDid = "";
  const f = new URL("../../.vta/tunnel.json", import.meta.url);
  if (existsSync(f)) mediatorDid = JSON.parse(readFileSync(f, "utf8")).mediatorDid ?? "";
  return {
    envDir: "../..",
    define: {
      __DEFAULTS__: JSON.stringify({ vtaDid: e.VTA_DID ?? "", mediatorDid, credential: e.VTA_CREDENTIAL ?? "" }),
    },
    server: { port: 3000, strictPort: true },
    build: { target: "es2022" },
  };
});
