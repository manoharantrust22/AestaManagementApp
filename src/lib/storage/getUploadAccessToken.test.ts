import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Control the lock-free fallback token.
vi.mock("@/lib/auth/accessTokenCache", () => ({
  getCachedAccessToken: vi.fn((): string | null => null),
}));
// sessionManager is imported by uploadHelpers; stub it so importing the module
// under test doesn't pull in the real (browser-only) session machinery.
vi.mock("@/lib/auth/sessionManager", () => ({
  refreshSessionDeduped: vi.fn(async () => true),
}));

import { getUploadAccessToken } from "./uploadHelpers";
import { getCachedAccessToken } from "@/lib/auth/accessTokenCache";

const cachedMock = vi.mocked(getCachedAccessToken);

/** Minimal fake supabase client whose getSession behaviour the test controls. */
function makeSupabase(getSession: () => Promise<unknown>): SupabaseClient {
  return { auth: { getSession } } as unknown as SupabaseClient;
}

const sessionWith = (access_token: string | null) => ({
  data: { session: access_token ? { access_token } : null },
});

describe("getUploadAccessToken", () => {
  beforeEach(() => {
    cachedMock.mockReset();
    cachedMock.mockReturnValue(null);
  });

  it("returns the fresh token when getSession resolves fast", async () => {
    const supabase = makeSupabase(vi.fn(async () => sessionWith("fresh")));
    const token = await getUploadAccessToken(supabase, 1000);
    expect(token).toBe("fresh");
    expect(cachedMock).not.toHaveBeenCalled();
  });

  it("falls back to the cached token when getSession hangs past the timeout", async () => {
    cachedMock.mockReturnValue("cached");
    // never resolves
    const supabase = makeSupabase(vi.fn(() => new Promise<never>(() => {})));
    const token = await getUploadAccessToken(supabase, 10);
    expect(token).toBe("cached");
    expect(cachedMock).toHaveBeenCalled();
  });

  it("returns null when getSession hangs and the cache is empty", async () => {
    cachedMock.mockReturnValue(null);
    const supabase = makeSupabase(vi.fn(() => new Promise<never>(() => {})));
    const token = await getUploadAccessToken(supabase, 10);
    expect(token).toBeNull();
  });

  it("falls back to the cached token when getSession rejects", async () => {
    cachedMock.mockReturnValue("cached");
    const supabase = makeSupabase(vi.fn(async () => {
      throw new Error("lock contention");
    }));
    const token = await getUploadAccessToken(supabase, 1000);
    expect(token).toBe("cached");
  });

  it("does not throw an unhandled rejection when getSession rejects after the timeout already won", async () => {
    cachedMock.mockReturnValue("cached");
    const supabase = makeSupabase(
      vi.fn(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("late")), 30)
          )
      )
    );
    const token = await getUploadAccessToken(supabase, 10);
    expect(token).toBe("cached");
    // Give the late rejection time to settle; the internal .catch swallows it.
    await new Promise((r) => setTimeout(r, 40));
  });
});
