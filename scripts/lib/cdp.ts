// A very small Chrome DevTools Protocol driver (no dependencies: Node 22 has WebSocket and fetch).
// Used by `npm run e2e`. Clicks are done IN the page (element.click()): a headless Chromium was seen to freeze on
// synthesised mouse input, and a JS click goes through the same React handlers.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sleep } from "./live.js";

export function findChrome(): string | undefined {
  const names = [process.env.CHROME, "chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"].filter(Boolean) as string[];
  for (const n of names) {
    if (n.includes("/")) { if (existsSync(n)) return n; continue; }
    for (const dir of (process.env.PATH ?? "").split(":")) {
      try { if (statSync(join(dir, n)).isFile()) return join(dir, n); } catch { /* next */ }
    }
  }
  return undefined;
}

export interface Problems { console: string[]; failedRequests: string[]; httpErrors: string[]; exceptions: string[] }

export class Browser {
  private proc!: ChildProcess;
  private port = 0;
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, { ok: (v: any) => void; bad: (e: Error) => void }>();
  problems: Problems = { console: [], failedRequests: [], httpErrors: [], exceptions: [] };
  private statuses = new Map<string, string>();

  /** `profile` is a user-data-dir that survives between launches (so localStorage does too). */
  static async launch(chrome: string, profile: string, size = { width: 1100, height: 900 }): Promise<Browser> {
    const b = new Browser();
    b.proc = spawn(chrome, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`, "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const portFile = join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !b.port; i++) {
      await sleep(100);
      try { b.port = Number(readFileSync(portFile, "utf8").split("\n")[0]); } catch { /* not yet */ }
    }
    if (!b.port) { b.proc.kill(); throw new Error("the browser did not open its debugging port"); }
    let targets: any[] = [];
    for (let i = 0; i < 50; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${b.port}/json/list`)).json(); if (targets.some((t) => t.type === "page")) break; } catch { /* retry */ }
      await sleep(100);
    }
    const page = targets.find((t) => t.type === "page");
    if (!page) { b.proc.kill(); throw new Error("no page target"); }
    b.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((ok, bad) => { b.ws.onopen = () => ok(); b.ws.onerror = () => bad(new Error("devtools socket failed")); });
    b.ws.onmessage = (m) => b.onMessage(JSON.parse(String(m.data)));
    await Promise.all(["Page", "Runtime", "Log", "Network"].map((d) => b.send(`${d}.enable`)));
    await b.send("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 1, mobile: false });
    return b;
  }

  private onMessage(m: any) {
    if (m.id && this.pending.has(m.id)) {
      const p = this.pending.get(m.id)!; this.pending.delete(m.id);
      m.error ? p.bad(new Error(`${m.error.message}`)) : p.ok(m.result);
      return;
    }
    const p = m.params;
    switch (m.method) {
      case "Runtime.consoleAPICalled": if (p.type === "error") this.problems.console.push(p.args.map((a: any) => a.value ?? a.description ?? "").join(" ")); break;
      case "Runtime.exceptionThrown": this.problems.exceptions.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "exception"); break;
      case "Network.requestWillBeSent": this.statuses.set(p.requestId, `${p.request.method} ${p.request.url}`); break;
      case "Network.responseReceived": if (p.response.status >= 400) this.problems.httpErrors.push(`${p.response.status} ${this.statuses.get(p.requestId) ?? p.response.url}`); break;
      case "Network.loadingFailed": if (!p.canceled) this.problems.failedRequests.push(`${p.errorText} ${this.statuses.get(p.requestId) ?? ""}`); break;
    }
  }

  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((ok, bad) => {
      const t = setTimeout(() => { this.pending.delete(id); bad(new Error(`${method} timed out`)); }, 20_000);
      this.pending.set(id, { ok: (v) => { clearTimeout(t); ok(v); }, bad: (e) => { clearTimeout(t); bad(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async goto(url: string) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'", 15_000);
  }

  async eval<T = any>(expression: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  }

  /** Poll a page expression until truthy. */
  async waitFor(expression: string, timeoutMs = 10_000, what = expression): Promise<void> {
    const end = Date.now() + timeoutMs;
    let last: unknown;
    while (Date.now() < end) {
      try { last = await this.eval(`Boolean(${expression})`); if (last) return; } catch (e) { last = e; }
      await sleep(150);
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for: ${what}`);
  }

  /** Visible text of the page body. */
  text(): Promise<string> { return this.eval("document.body.innerText"); }
  async waitText(re: RegExp, timeoutMs = 10_000) {
    await this.waitFor(`new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)}).test(document.body.innerText)`, timeoutMs, `page text ${re}`);
  }
  async gone(re: RegExp, timeoutMs = 5_000) {
    await this.waitFor(`!new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)}).test(document.body.innerText)`, timeoutMs, `page text to lose ${re}`);
  }

  /** JS click on the first enabled button or tab whose text (or aria-label) matches; a string matches the whole text. */
  async click(label: RegExp | string, opts: { timeoutMs?: number } = {}) {
    const re = label instanceof RegExp ? label : new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    const js = `(() => { const re = new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)});
      const name = (e) => ((e.getAttribute('aria-label') && !/^Connection/.test(e.getAttribute('aria-label'))) ? e.getAttribute('aria-label') : e.textContent).trim();
      const el = [...document.querySelectorAll('button, [role=tab]')].find((e) => re.test(name(e)) && !e.disabled);
      if (!el) return false; el.click(); return true; })()`;
    await this.waitFor(js, opts.timeoutMs ?? 8_000, `an enabled button matching ${re}`);
  }
  async isDisabled(label: RegExp): Promise<boolean> {
    return this.eval(`(() => { const re = new RegExp(${JSON.stringify(label.source)}, ${JSON.stringify(label.flags)}); const el = [...document.querySelectorAll('button')].find(e => re.test(e.textContent.trim())); return el ? el.disabled : null; })()`);
  }

  /** Type into a React-controlled input the way a user's keystrokes would end up: native setter plus an input event. */
  async fill(selector: string, value: string) {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)})`, 8_000, `field ${selector}`);
    await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  }

  async screenshot(file: string) {
    const r = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  }

  async close() {
    try { this.ws.close(); } catch { /* closed */ }
    this.proc.kill("SIGTERM");
    await sleep(300);
    if (this.proc.exitCode === null) this.proc.kill("SIGKILL");
  }
}

export function tmpProfile(): { dir: string; remove(): void } {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-profile-"));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
