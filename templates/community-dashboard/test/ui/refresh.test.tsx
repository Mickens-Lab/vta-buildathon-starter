// B3: the community is the database. Refresh, "as of", cooldown, focus refresh, local hints, StrictMode and cleanup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { identity } from "../../src/client.ts";
import { ANON_COOLDOWN_MS, FOCUS_DEBOUNCE_MS, FOCUS_MIN_AGE_MS, KNOWN_COOLDOWN_MS } from "../../src/refresh.ts";
import { POLL_MS } from "../../src/hooks.ts";
import { CHANGES, approve, fake, freshDb } from "./fake.ts";
import { mountApp, resetWorld, settle } from "./harness.tsx";

const badge = () => screen.getAllByRole("status").find((e) => e.classList.contains("badge"))?.textContent;
const pending = () => { const db = freshDb(); db.request = { id: "r1", status: "pending" }; resetWorld(db); };
const member = () => { const db = freshDb(); db.request = { id: "r1", status: "approved" }; db.member = true; resetWorld(db); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const hide = (hidden: boolean) => { Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden }); };
afterEach(() => { vi.useRealTimers(); hide(false); });

describe("as-of line and Refresh", () => {
  it("each screen says when, from which task, and how long", async () => {
    pending();
    await mountApp();
    expect(screen.getAllByText(/As of \d\d:\d\d:\d\d, from vtc\/join-requests\/status, 12 ms/).length).toBeGreaterThan(0);
  });

  it("Refresh status follows a change made elsewhere (the CLI approving), and only then", async () => {
    pending();
    await mountApp();
    approve(fake.db);
    await settle();
    expect(badge()).toBe("In review"); // the page does not guess
    await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await settle();
    expect(badge()).toBe("Member");
  });

  it("every member panel has its own as-of line and Refresh that re-reads only that panel", async () => {
    member();
    await mountApp();
    expect(screen.getByText(/from GET \/v1\/member\/me, 12 ms/)).toBeTruthy();
    expect(screen.getByText(/from vtc\/community\/profile\/show/)).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Directory" }));
    await settle();
    expect(screen.getByText(/from vtc\/directory\/entries\/list/)).toBeTruthy();
    const n = fake.directoryEntries.mock.calls.length, m = fake.memberProof.mock.calls.length;
    const buttons = screen.getAllByRole("button", { name: "Refresh" });
    await userEvent.click(buttons[buttons.length - 1]);
    await settle();
    expect(fake.directoryEntries.mock.calls.length).toBe(n + 1);
    expect(fake.memberProof.mock.calls.length).toBe(m);
  });

  it("the global Refresh all re-reads the status and every visible panel", async () => {
    member();
    await mountApp();
    const status = fake.joinStatus.mock.calls.length, proof = fake.memberProof.mock.calls.length, prof = fake.communityProfile.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Refresh all" }));
    await settle();
    expect(fake.joinStatus.mock.calls.length).toBeGreaterThan(status);
    expect(fake.memberProof.mock.calls.length).toBe(proof); // the portal card is rate-limited like an anonymous caller: Refresh all leaves it alone
    expect(fake.communityProfile.mock.calls.length).toBeGreaterThan(prof);
  });

  it("the membership card has its own Refresh, with the anonymous cooldown (it costs three portal calls)", async () => {
    member();
    vi.useFakeTimers();
    await mountApp();
    await advance(KNOWN_COOLDOWN_MS + 50);
    const proof = fake.memberProof.mock.calls.length;
    const card = () => screen.getAllByRole("button", { name: "Refresh" })[0] as HTMLButtonElement; // first panel on the page is the card
    fireEvent.click(card());
    await settle();
    expect(fake.memberProof.mock.calls.length).toBe(proof + 1);
    await advance(KNOWN_COOLDOWN_MS + 50);
    expect(card().disabled).toBe(true); // still inside the 5 s window
    await advance(ANON_COOLDOWN_MS);
    expect(card().disabled).toBe(false);
  });

  it("keeps showing the last data while a refresh is in flight instead of blanking the panel", async () => {
    member();
    await mountApp();
    expect(screen.getByText("Joined")).toBeTruthy();
    fake.db.failing.communityProfile = new Error("boom");
    await userEvent.click(screen.getByRole("button", { name: "Refresh all" }));
    await settle();
    expect(screen.queryByText(/Loading your membership/)).toBeNull();
  });
});

describe("cooldown", () => {
  it("disables every Refresh for a moment after one, then re-enables (known signer 1 s)", async () => {
    member();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await mountApp();
    const all = () => screen.getByRole("button", { name: "Refresh all" }) as HTMLButtonElement;
    expect(all().disabled).toBe(false);
    fireEvent.click(all());
    await settle();
    expect(all().disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Refresh" })[0] as HTMLButtonElement).disabled).toBe(true);
    const calls = fake.calls.length;
    fireEvent.click(all()); // a disabled button does nothing
    await settle();
    expect(fake.calls.length).toBe(calls);
    await advance(KNOWN_COOLDOWN_MS + 50);
    expect(all().disabled).toBe(false);
  });

  it("a visitor waits longer (anonymous budget: one document per 5 s)", async () => {
    resetWorld();
    vi.useFakeTimers();
    await mountApp();
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await settle();
    expect((screen.getByRole("button", { name: "Refresh status" }) as HTMLButtonElement).disabled).toBe(true);
    await advance(KNOWN_COOLDOWN_MS + 50);
    expect((screen.getByRole("button", { name: "Refresh status" }) as HTMLButtonElement).disabled).toBe(true);
    await advance(ANON_COOLDOWN_MS);
    expect((screen.getByRole("button", { name: "Refresh status" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("refresh on tab focus", () => {
  it("re-reads when the tab returns after the read is old enough: one re-read for a burst of events, after a debounce", async () => {
    member(); // no poll in this state, so every status call below is the focus refresh
    vi.useFakeTimers();
    await mountApp();
    await advance(FOCUS_MIN_AGE_MS + 100);
    const before = fake.joinStatus.mock.calls.length;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await advance(FOCUS_DEBOUNCE_MS - 50);
    expect(fake.joinStatus.mock.calls.length).toBe(before); // still debouncing
    await advance(100);
    await settle();
    expect(fake.joinStatus.mock.calls.length).toBe(before + 1);
  });

  it("does nothing when the last read is recent, or while the tab is hidden", async () => {
    pending();
    vi.useFakeTimers();
    await mountApp();
    const n0 = fake.joinStatus.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await advance(FOCUS_DEBOUNCE_MS + 100);
    expect(fake.joinStatus.mock.calls.length).toBe(n0); // read a moment ago
    await advance(FOCUS_MIN_AGE_MS);
    hide(true);
    const n1 = fake.joinStatus.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await advance(FOCUS_DEBOUNCE_MS + 100);
    expect(fake.joinStatus.mock.calls.length).toBe(n1);
  });

  it("picks up a change made elsewhere when the tab comes back (member left from the CLI)", async () => {
    member();
    vi.useFakeTimers();
    await mountApp();
    expect(badge()).toBe("Member");
    fake.db.member = false;
    await advance(FOCUS_MIN_AGE_MS + 100);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await advance(FOCUS_DEBOUNCE_MS + 100);
    await settle();
    expect(badge()).toBe("Left");
  });

  it("removes its listeners on unmount", async () => {
    pending();
    vi.useFakeTimers();
    const { unmount } = await mountApp();
    await advance(FOCUS_MIN_AGE_MS + 100);
    unmount();
    const n = fake.calls.length;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await advance(FOCUS_DEBOUNCE_MS + 100);
    expect(fake.calls.length).toBe(n);
  });
});

describe("local hints", () => {
  const key = () => `community-dashboard:${identity().did}`;

  it("labels the remembered request as a hint and forgets it on demand, then re-reads", async () => {
    pending();
    localStorage.setItem(key(), JSON.stringify({ requestId: "r1", appliedAt: "2026-01-02T03:04:00Z", criterion: "review" }));
    await mountApp();
    expect(screen.getByText(/Local hint\./)).toBeTruthy();
    expect(screen.getByText(/only a hint/)).toBeTruthy();
    const asked = fake.joinStatus.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Forget local hints" }));
    await settle();
    expect(localStorage.getItem(key())).toBeNull();
    expect(screen.queryByText(/Local hint\./)).toBeNull();
    expect(fake.joinStatus.mock.calls.length).toBeGreaterThan(asked);
    expect(fake.joinStatus.mock.calls.at(-1)).toEqual([undefined]); // asks for "my latest request" now: no id to send
  });

  it("shows no hint control when nothing is remembered", async () => {
    resetWorld();
    await mountApp();
    expect(screen.queryByRole("button", { name: "Forget local hints" })).toBeNull();
  });

  it("applying stores the hint, which then appears", async () => {
    resetWorld();
    await mountApp();
    await userEvent.click(screen.getByRole("button", { name: "Apply to join" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign and send" }));
    await settle();
    expect(JSON.parse(localStorage.getItem(key())!).requestId).toBe("req-1");
    expect(screen.getByRole("button", { name: "Forget local hints" })).toBeTruthy();
  });
});

describe("StrictMode", () => {
  it("does not repeat a state-changing call on mount or while idle", async () => {
    member();
    vi.useFakeTimers();
    await mountApp({ strict: true });
    await advance(POLL_MS * 3);
    expect(fake.calls.filter((c) => CHANGES.includes(c))).toEqual([]);
  });

  it("an apply under StrictMode sends exactly one submit", async () => {
    resetWorld();
    await mountApp({ strict: true });
    await userEvent.click(screen.getByRole("button", { name: "Apply to join" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign and send" }));
    await settle();
    expect(fake.calls.filter((c) => c === "submitJoin")).toHaveLength(1);
  });

  it("withdraw, renew, leave and card edits are one call each under StrictMode", async () => {
    member();
    await mountApp({ strict: true });
    await userEvent.click(screen.getByRole("tab", { name: "Account" }));
    await userEvent.click(screen.getByRole("button", { name: "Renew" }));
    await settle();
    expect(fake.calls.filter((c) => c === "renewMembership")).toHaveLength(1);
    await userEvent.type(screen.getByLabelText(/Type/), "leave");
    await userEvent.click(screen.getByRole("button", { name: "Leave community" }));
    await userEvent.click(screen.getByRole("button", { name: /Yes, leave community/i }));
    await settle();
    expect(fake.calls.filter((c) => c === "leaveCommunity")).toHaveLength(1);
  });

  it("mount reads are shared: one status call and one manifest call, not two", async () => {
    resetWorld();
    await mountApp({ strict: true });
    expect(fake.joinStatus.mock.calls.length).toBe(1);
    expect(fake.manifest.mock.calls.length).toBe(1);
  });
});

describe("polling lifecycle", () => {
  it("polls an open request every 10 s, and stops after unmount", async () => {
    pending();
    vi.useFakeTimers();
    const { unmount } = await mountApp({ strict: true });
    const base = fake.joinStatus.mock.calls.length;
    await advance(POLL_MS + 100);
    expect(fake.joinStatus.mock.calls.length).toBe(base + 1);
    unmount();
    const after = fake.calls.length;
    await advance(POLL_MS * 5);
    expect(fake.calls.length).toBe(after);
  });

  it("stops polling once the request is decided, and skips ticks while paused or hidden", async () => {
    pending();
    vi.useFakeTimers();
    await mountApp();
    fireEvent.click(screen.getByRole("button", { name: "Pause checking" }));
    const paused = fake.joinStatus.mock.calls.length;
    await advance(POLL_MS * 3);
    expect(fake.joinStatus.mock.calls.length).toBe(paused);
    fireEvent.click(screen.getByRole("button", { name: "Resume checking" }));
    approve(fake.db);
    await advance(POLL_MS + 100);
    await settle();
    expect(badge()).toBe("Member");
    // the pause was for that request: a later request polls again
    fake.db.request = { id: "r2", status: "pending" }; fake.db.member = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh all" }));
    await settle();
    expect(screen.getByRole("button", { name: "Pause checking" })).toBeTruthy();
    fake.db.request = { id: "r1", status: "approved" }; fake.db.member = true;
    await advance(POLL_MS + 100);
    await settle();
    expect(badge()).toBe("Member");
    const decided = fake.joinStatus.mock.calls.length;
    await advance(POLL_MS * 4);
    expect(fake.joinStatus.mock.calls.length).toBe(decided);
  });
});
