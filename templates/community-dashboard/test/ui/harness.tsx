import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "../../src/App.tsx";
import { callLog } from "../../src/client.ts";
import { refreshEpoch, resetCooldown } from "../../src/refresh.ts";
import { toasts } from "../../src/components/ui.tsx";
import { fake, freshDb, type Db } from "./fake.ts";

/** Reset everything module-level that a previous test may have left (the page is one long-lived module graph). */
export function resetWorld(db: Db = freshDb()) {
  vi.useRealTimers();
  localStorage.clear();
  callLog.set([]);
  toasts.set([]);
  resetCooldown();
  refreshEpoch.set(0);
  fake.reset(db);
}

export async function mountApp(opts: { strict?: boolean } = {}) {
  const ui = opts.strict ? <StrictMode><App /></StrictMode> : <App />;
  const r = render(ui);
  await settle();
  return r;
}

/** Let pending promises and effects finish (no timers advanced). */
export async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0); else { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); } });
  }
}
