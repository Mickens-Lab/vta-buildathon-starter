// Same-origin dev proxy for the browser templates. The page calls /__vta (and /__vtc) on its own origin and the Vite dev server
// forwards to the real VTA/VTC URL from the repo-root .env. The browser then never makes a cross-origin call, so CORS cannot refuse it on
// ANY port (Vite bumping 5173 to 5174, `--port 3050`). Used by templates/*/vite.config.ts; apps made by `npm run new` live in apps/<name>,
// the same depth, so they import it by the same relative path. DEV ONLY: it forwards whatever the page sends.
// No imports: Vite loads this file while bundling a vite.config.ts.

export const VTA_PROXY = "/__vta";
export const VTC_PROXY = "/__vtc";
export const DEFAULT_VTA_URL = "http://localhost:8100";
export const DEFAULT_VTC_URL = "http://localhost:8200";

/** The shape Vite's `server.proxy` takes (a structural subset of its ProxyOptions). */
export interface ProxyEntry {
  target: string;
  changeOrigin: boolean;
  rewrite: (path: string) => string;
  configure: (proxy: ProxyEvents) => void;
}
export interface ProxyEvents { on(event: string, fn: (...args: any[]) => void): unknown }

/** `http(s)://host[:port]` without a trailing slash, or an error that names the variable. */
export function normalizeTarget(url: string, name = "URL"): string {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`${name} is not a URL: "${url}" (expected something like ${DEFAULT_VTA_URL}).`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`${name} must start with http:// or https:// (got "${url}").`);
  return url.replace(/\/+$/, "");
}

/** What the browser should call instead of `target`: this page's own origin plus the prefix. */
export const sameOriginUrl = (prefix: string, origin: string): string => origin + prefix;

/** The 502 text a page sees when the VTA/VTC behind the proxy does not answer. Plain words, no stack. */
export const proxyDownMessage = (prefix: string, target: string, code?: string): string =>
  `The dev server could not reach ${target} (the page called ${prefix}${code ? `; ${code}` : ""}). Is the stack up? Run \`npm run doctor\`, then \`npm run up\`.`;

export function proxyEntry(prefix: string, target: string): ProxyEntry {
  return {
    target: normalizeTarget(target, prefix === VTC_PROXY ? "VTC_URL" : "VTA_URL"),
    changeOrigin: true,
    rewrite: (p) => {
      if (!(p === prefix || p.startsWith(prefix + "/") || p.startsWith(prefix + "?"))) return p;
      const rest = p.slice(prefix.length);
      return rest.startsWith("/") ? rest : "/" + rest;
    },
    configure(proxy) {
      // The server sees a request from the proxy, not from a browser page on some port.
      proxy.on("proxyReq", (req: { removeHeader(n: string): void }) => req.removeHeader("origin"));
      proxy.on("error", (err: { code?: string }, _req: unknown, res: { headersSent?: boolean; writeHead?: Function; end?: Function }) => {
        if (typeof res?.writeHead !== "function" || res.headersSent) return; // a WebSocket socket, or already answering
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end?.(proxyDownMessage(prefix, target, err?.code));
      });
    },
  };
}

/** `server.proxy` for a template: /__vta always (default local VTA), /__vtc when a VTC URL is given. */
export function devProxy(o: { vtaUrl?: string; vtcUrl?: string }): Record<string, ProxyEntry> {
  const out: Record<string, ProxyEntry> = { [VTA_PROXY]: proxyEntry(VTA_PROXY, o.vtaUrl || DEFAULT_VTA_URL) };
  if (o.vtcUrl) out[VTC_PROXY] = proxyEntry(VTC_PROXY, o.vtcUrl);
  return out;
}
