// Framework-free helpers for side effects that must not double-fire (React StrictMode runs effects twice in dev).

/**
 * Call `tick` every `intervalMs`, never overlapping, never immediately (the caller already has fresh data).
 * Skips a tick while `paused()` is true. After a failure of `tick` the next wait doubles up to `maxMs`
 * (so a rate limit or an outage is not hammered). Returns `stop()`, which also cancels a pending timer.
 */
export function createPoller(o: {
  tick: () => Promise<unknown>;
  intervalMs: number;
  maxMs?: number;
  paused?: () => boolean;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): () => void {
  const set = o.setTimer ?? setTimeout;
  const clear = o.clearTimer ?? clearTimeout;
  let stopped = false;
  let wait = o.intervalMs;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (stopped) return;
    handle = set(async () => {
      if (stopped) return;
      if (!o.paused?.()) {
        try { await o.tick(); wait = o.intervalMs; } catch { wait = Math.min(wait * 2, o.maxMs ?? o.intervalMs * 6); }
      }
      schedule();
    }, wait);
  };
  schedule();
  return () => { stopped = true; if (handle !== undefined) clear(handle); };
}

/** Share one in-flight promise per key: a second caller while the first is pending gets the same promise (one request, not two). */
export function inflight<T>(): (key: string, fn: () => Promise<T>) => Promise<T> {
  const live = new Map<string, Promise<T>>();
  return (key, fn) => {
    const hit = live.get(key);
    if (hit) return hit;
    const p = fn().finally(() => live.delete(key));
    live.set(key, p);
    return p;
  };
}
