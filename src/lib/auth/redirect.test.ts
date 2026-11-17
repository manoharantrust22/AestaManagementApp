import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, oauthErrorMessage, readLoginMethod, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    "//evil.com",
    "//evil.com/site/dashboard",
    "https://evil.com",
    "http://evil.com/x",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    "%2F%2Fevil.com",
  ])("rejects %j", (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("rejects null / undefined", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath(undefined)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it.each(["/login", "/login?x=1", "/auth/callback?code=1", "/no-access", "/dev-login"])(
    "does not land on %j (loops)",
    (raw) => expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN)
  );

  it.each([
    ["/site/dashboard", "/site/dashboard"],
    ["/tasks?id=abc", "/tasks?id=abc"],
    ["/site/attendance?site=s1#today", "/site/attendance?site=s1#today"],
    ["%2Ftasks%3Fid%3D1", "/tasks?id=1"],
  ])("keeps a same-site path %j", (raw, want) => {
    expect(safeNextPath(raw)).toBe(want);
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//x", "/tasks")).toBe("/tasks");
  });
});

describe("oauthErrorMessage", () => {
  it("is null when there is no error", () => {
    expect(oauthErrorMessage({})).toBeNull();
  });

  it("explains a refused sign-up (stranger with Google)", () => {
    expect(
      oauthErrorMessage({
        error: "access_denied",
        code: "signup_disabled",
        description: "Signups not allowed for this instance",
      })
    ).toBe("This account has not been added to Aesta. Ask your company admin.");
  });

  it("explains a Microsoft account from another organisation", () => {
    expect(
      oauthErrorMessage({
        error: "server_error",
        description: "AADSTS50020: User account from identity provider does not exist in tenant",
      })
    ).toBe("Use your Neram work account, or ask your company admin.");
  });

  it("says cancelled for access_denied without a sign-up error", () => {
    expect(oauthErrorMessage({ error: "access_denied", description: "The user cancelled" })).toMatch(/cancelled/);
  });

  it("falls back to plain words, never the raw text", () => {
    const msg = oauthErrorMessage({ error: "exchange_failed", description: "PKCE verifier mismatch xyz" });
    expect(msg).toBe("Could not sign you in. Please try again.");
  });
});

describe("readLoginMethod", () => {
  it.each(["azure", "google", "password"])("reads %s", (m) => expect(readLoginMethod(m)).toBe(m));
  it.each([null, "", "facebook"])("ignores %j", (m) => expect(readLoginMethod(m)).toBeNull());
});
