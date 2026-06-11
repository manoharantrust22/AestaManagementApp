import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the Supabase browser client so ensureFreshSession()/refreshSessionDeduped()
// hit fakes instead of the network. The canary/warm-up in healConnectionPool is a
// no-op here because we leave NEXT_PUBLIC_SUPABASE_URL unset (runPoolCanary returns
// true immediately), so no global fetch or realtime mock is needed.
const { getSessionMock, refreshSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
    },
  }),
}));

const NOW_SECONDS = () => Math.floor(Date.now() / 1000);
const sessionExpiringIn = (seconds: number) => ({
  access_token: "tok",
  expires_at: NOW_SECONDS() + seconds,
});

async function freshManager() {
  // Fresh singleton per test so private state (lastSessionCheckTime, the
  // post-idle flag) doesn't leak between cases.
  vi.resetModules();
  const mod = await import("./sessionManager");
  return mod.default;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  getSessionMock.mockResolvedValue({
    data: { session: sessionExpiringIn(3600) },
    error: null,
  });
  refreshSessionMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ensureFreshSession — normal (non-idle) path", () => {
  it("does NOT refresh a token that is comfortably valid", async () => {
    const mgr = await freshManager();
    getSessionMock.mockResolvedValue({
      data: { session: sessionExpiringIn(3600) },
      error: null,
    });

    await mgr.ensureFreshSession();

    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("refreshes when the token is within 5 minutes of expiry", async () => {
    const mgr = await freshManager();
    getSessionMock.mockResolvedValue({
      data: { session: sessionExpiringIn(60) }, // < 5 min
      error: null,
    });

    await mgr.ensureFreshSession();

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never dispatches the deprecated 'session-check-timeout' event", async () => {
    const mgr = await freshManager();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await mgr.ensureFreshSession();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as Event).type);
    expect(types).not.toContain("session-check-timeout");
  });
});

describe("ensureFreshSession — post-idle path (heal first, refresh only if needed)", () => {
  it("heals the pool and proceeds WITHOUT a token refresh when the token is still valid", async () => {
    const mgr = await freshManager();
    // Put the manager into the post-idle state directly (avoids simulating 15 min
    // of idle + activity-debounce timers).
    (mgr as unknown as { state: Record<string, unknown> }).state.needsRefreshOnNextMutation = true;
    getSessionMock.mockResolvedValue({
      data: { session: sessionExpiringIn(3600) },
      error: null,
    });

    await mgr.ensureFreshSession();

    // Valid token → no forced refresh (this is what kept the false banner away
    // and the save fast).
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("refreshes the token after idle when it is near expiry", async () => {
    const mgr = await freshManager();
    (mgr as unknown as { state: Record<string, unknown> }).state.needsRefreshOnNextMutation = true;
    getSessionMock.mockResolvedValue({
      data: { session: sessionExpiringIn(30) }, // inside the 120s post-idle buffer
      error: null,
    });

    await mgr.ensureFreshSession();

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it("resolves (does not reject) and shows no banner when the check is slow", async () => {
    vi.useFakeTimers();
    const mgr = await freshManager();
    (mgr as unknown as { state: Record<string, unknown> }).state.needsRefreshOnNextMutation = true;
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    // getSession never settles → forces the safety timeout to win the race.
    getSessionMock.mockReturnValue(new Promise(() => {}));

    const p = mgr.ensureFreshSession();
    // Advance past the post-idle safety timeout (15s).
    await vi.advanceTimersByTimeAsync(15001);

    await expect(p).resolves.toBeUndefined();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as Event).type);
    expect(types).not.toContain("session-check-timeout");
  });
});

describe("softRecoverSession", () => {
  it("refreshes the session (used by the banner's Refresh button, no reload)", async () => {
    const mgr = await freshManager();
    const mod = await import("./sessionManager");

    await mod.softRecoverSession();

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    // sanity: same singleton instance backs the named export
    expect(typeof mgr.ensureFreshSession).toBe("function");
  });
});
