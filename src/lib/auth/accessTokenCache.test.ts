import { describe, it, expect, beforeEach, vi } from "vitest";

describe("accessTokenCache", () => {
  beforeEach(() => {
    // Reset module state so each test starts from a cold cache.
    vi.resetModules();
  });

  it("returns null before any token is published", async () => {
    const { getCachedAccessToken } = await import("./accessTokenCache");
    expect(getCachedAccessToken()).toBeNull();
  });

  it("returns the last published token", async () => {
    const { setCachedAccessToken, getCachedAccessToken } = await import(
      "./accessTokenCache"
    );
    setCachedAccessToken("abc123");
    expect(getCachedAccessToken()).toBe("abc123");
  });

  it("overwrites with the newest token (e.g. on TOKEN_REFRESHED)", async () => {
    const { setCachedAccessToken, getCachedAccessToken } = await import(
      "./accessTokenCache"
    );
    setCachedAccessToken("old");
    setCachedAccessToken("new");
    expect(getCachedAccessToken()).toBe("new");
  });

  it("clears the token on sign-out (null)", async () => {
    const { setCachedAccessToken, getCachedAccessToken } = await import(
      "./accessTokenCache"
    );
    setCachedAccessToken("abc123");
    setCachedAccessToken(null);
    expect(getCachedAccessToken()).toBeNull();
  });
});
