// Refresh policy, framework-free. The VTC is the database: this page keeps no authoritative copy, so it re-reads
// instead of guessing, but it must not hammer the community while doing so.
//
// Budgets (docs/VTC-SURFACE.md): a signer with no ACL entry shares one per-address anonymous budget (burst 10, then
// one document per 5 s); a known signer (member) has its own (burst 60, then one per 500 ms).
import { createStore } from "./store.ts";

/** Minimum gap between two manual refreshes for a member (one refresh is a few calls; the budget refills 1 per 500 ms). */
export const KNOWN_COOLDOWN_MS = 1_000;
/** The same for a visitor or applicant, assumed anonymous (inferred: an applicant may have an ACL entry, which is not verified). */
export const ANON_COOLDOWN_MS = 5_000;
/** Returning to the tab only re-reads if the last read is at least this old. */
export const FOCUS_MIN_AGE_MS = 15_000;
/** Focus and visibility events often arrive together; act once, after this quiet period. */
export const FOCUS_DEBOUNCE_MS = 400;

/** The time before which no refresh may start. Shared by every Refresh button so they disable together. */
export const cooldownUntil = createStore<number>(0);

/** Take the cooldown: true (and the window starts) if a refresh may run now, false if one ran too recently. */
export function tryRefresh(ms: number, now: number = Date.now()): boolean {
  if (now < cooldownUntil.get()) return false;
  cooldownUntil.set(now + ms);
  return true;
}
export function resetCooldown() { cooldownUntil.set(0); }

/** Bumped by a global refresh; every panel read re-runs when it changes. */
export const refreshEpoch = createStore<number>(0);
export const bumpEpoch = () => refreshEpoch.set((n) => n + 1);

/** Call `fn` once, `ms` after the last `call()`; `cancel()` drops a pending call. */
export function debounce(fn: () => void, ms: number, set: typeof setTimeout = setTimeout, clear: typeof clearTimeout = clearTimeout) {
  let h: ReturnType<typeof setTimeout> | undefined;
  return {
    call() { if (h !== undefined) clear(h); h = set(() => { h = undefined; fn(); }, ms); },
    cancel() { if (h !== undefined) clear(h); h = undefined; },
  };
}

/** One signed call as the Under-the-hood log recorded it, reduced to what a panel prints. */
export interface Freshness { at: Date; task: string; ms: number; ok: boolean }

export interface LoggedLike { type: string; startedAt: string; durationMs: number; ok: boolean }

/** The newest log entry whose type contains `match` (the log is newest first). */
export function freshnessFrom(log: readonly LoggedLike[], match: string, taskName: (t: string) => string): Freshness | undefined {
  const c = log.find((e) => e.type.includes(match));
  if (!c) return undefined;
  const start = new Date(c.startedAt).getTime();
  return { at: new Date(Number.isNaN(start) ? Date.now() : start + c.durationMs), task: taskName(c.type), ms: c.durationMs, ok: c.ok };
}

export function describeFreshness(f: Freshness | undefined): string {
  if (!f) return "Not read yet.";
  const ms = f.ms < 1000 ? `${Math.round(f.ms)} ms` : `${(f.ms / 1000).toFixed(1)} s`;
  return `As of ${f.at.toLocaleTimeString([], { hour12: false })}, from ${f.task}, ${ms}${f.ok ? "" : " (refused)"}`;
}
