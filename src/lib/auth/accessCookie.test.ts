import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetAccessCookieKeyForTests,
  ACCESS_COOKIE_TTL_SECONDS,
  signAccessCookie,
  verifyAccessCookie,
} from "./accessCookie";

const NOW = 1_800_000_000_000;

describe("access cookie", () => {
  const saved = process.env.ACCESS_COOKIE_SECRET;
  beforeEach(() => {
    process.env.ACCESS_COOKIE_SECRET = "test-secret";
    __resetAccessCookieKeyForTests();
  });
  afterEach(() => {
    process.env.ACCESS_COOKIE_SECRET = saved;
    __resetAccessCookieKeyForTests();
  });

  it("verifies a cookie it signed for the same user", async () => {
    const v = await signAccessCookie("auth-1", NOW);
    expect(await verifyAccessCookie(v!, "auth-1", NOW + 1000)).toBe(true);
  });

  it("rejects another user's cookie", async () => {
    const v = await signAccessCookie("auth-1", NOW);
    expect(await verifyAccessCookie(v!, "auth-2", NOW)).toBe(false);
  });

  it("rejects after the TTL", async () => {
    const v = await signAccessCookie("auth-1", NOW);
    expect(await verifyAccessCookie(v!, "auth-1", NOW + ACCESS_COOKIE_TTL_SECONDS * 1000)).toBe(
      false
    );
  });

  it("rejects a tampered expiry or signature", async () => {
    const v = (await signAccessCookie("auth-1", NOW))!;
    const [ver, id, exp, sig] = v.split(".");
    expect(await verifyAccessCookie([ver, id, String(Number(exp) + 60), sig].join("."), "auth-1", NOW)).toBe(false);
    const badSig = sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA");
    expect(await verifyAccessCookie([ver, id, exp, badSig].join("."), "auth-1", NOW)).toBe(false);
  });

  it("rejects a cookie signed with a different secret", async () => {
    const v = await signAccessCookie("auth-1", NOW);
    process.env.ACCESS_COOKIE_SECRET = "other-secret";
    __resetAccessCookieKeyForTests();
    expect(await verifyAccessCookie(v!, "auth-1", NOW)).toBe(false);
  });

  it("rejects junk and missing values", async () => {
    expect(await verifyAccessCookie(undefined, "auth-1", NOW)).toBe(false);
    expect(await verifyAccessCookie("v1.auth-1.notanumber.x", "auth-1", NOW)).toBe(false);
    expect(await verifyAccessCookie("garbage", "auth-1", NOW)).toBe(false);
  });
});
