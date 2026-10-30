import assert from "node:assert/strict";
import { test } from "node:test";
import { createPoller, inflight } from "../src/poll.ts";

// A manual clock: timers run only when the test says so.
function clock() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    set: ((fn: () => void, ms: number) => { timers.set(++id, { fn, ms }); return id as any; }) as unknown as typeof setTimeout,
    clear: ((h: number) => { timers.delete(h); }) as unknown as typeof clearTimeout,
    pending: () => [...timers.values()].map((t) => t.ms),
    async fire() { const [k, t] = [...timers.entries()][0]; timers.delete(k); t.fn(); await new Promise((r) => setImmediate(r)); },
  };
}

test("the poller never fires immediately and stop() cancels the pending timer (StrictMode mount/cleanup/mount)", async () => {
  const c = clock();
  let n = 0;
  const mk = () => createPoller({ tick: async () => { n++; }, intervalMs: 10_000, setTimer: c.set, clearTimer: c.clear });
  const stop1 = mk(); stop1(); // first effect run, then its cleanup
  const stop2 = mk();          // second effect run
  assert.equal(n, 0);
  assert.deepEqual(c.pending(), [10_000]); // exactly one timer survives
  await c.fire();
  assert.equal(n, 1);
  stop2();
  assert.deepEqual(c.pending(), []);
});
test("paused ticks are skipped; failures back off and a success resets", async () => {
  const c = clock();
  let paused = true, fail = true, n = 0;
  const stop = createPoller({ tick: async () => { n++; if (fail) throw new Error("x"); }, intervalMs: 1000, maxMs: 4000, paused: () => paused, setTimer: c.set, clearTimer: c.clear });
  await c.fire(); assert.equal(n, 0);
  paused = false;
  await c.fire(); assert.equal(n, 1); assert.deepEqual(c.pending(), [2000]);
  await c.fire(); assert.deepEqual(c.pending(), [4000]);
  await c.fire(); assert.deepEqual(c.pending(), [4000]);
  fail = false;
  await c.fire(); assert.deepEqual(c.pending(), [1000]);
  stop();
});
test("inflight shares one request between concurrent callers of the same key", async () => {
  const run = inflight<number>();
  let calls = 0;
  const slow = () => new Promise<number>((r) => setTimeout(() => r(++calls), 5));
  const [a, b] = await Promise.all([run("k", slow), run("k", slow)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await run("k", slow);
  assert.equal(calls, 2);
});
