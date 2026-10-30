import { defineConfig, loadEnv } from "vite";

// DEV ONLY: the app credential from the repo-root .env (written by `npm run up`) is embedded in the page, which means the private key is
// readable in the browser. Fine for a local playground, never for anything deployed (docs/SECURITY.md).
// The local VTA allows the origins http://localhost:5173, :3000 and :8000; if 5173 is busy start with `npm run dev -- --port 3000`.
export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, "../..", ["VTA_"]);
  return {
    envDir: "../..",
    define: { __CRED__: JSON.stringify({ credential: e.VTA_CREDENTIAL ?? "", url: e.VTA_URL ?? "http://localhost:8100", context: e.VTA_CONTEXT ?? "my-app" }) },
    server: { port: 5173, strictPort: true },
    build: { target: "es2022" },
  };
});
