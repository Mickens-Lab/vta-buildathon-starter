import { defineConfig, loadEnv } from "vite";
import { devProxy, VTA_PROXY } from "../../scripts/lib/dev-proxy.ts";

// DEV ONLY: the app credential from the repo-root .env (written by `npm run up`) is embedded in the page, which means the private key is
// readable in the browser. Fine for a local playground, never for anything deployed (docs/SECURITY.md).
// The page calls /__vta on its own origin and Vite forwards it to VTA_URL, so the VTA's CORS list never applies and any port works
// (Vite moves to 5174 when 5173 is busy; `npm run dev -- --port 3050` is fine too). ../../scripts/lib/dev-proxy.ts is shared by the
// templates; an app made with `npm run new` sits at the same depth, so this import keeps working there.
export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, "../..", ["VTA_"]);
  return {
    envDir: "../..",
    define: { __CRED__: JSON.stringify({ credential: e.VTA_CREDENTIAL ?? "", url: VTA_PROXY, target: e.VTA_URL ?? "http://localhost:8100", context: e.VTA_CONTEXT ?? "my-app" }) },
    server: { port: 5173, proxy: devProxy({ vtaUrl: e.VTA_URL }) },
    build: { target: "es2022" },
  };
});
