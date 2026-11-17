// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const signOut = vi.fn();
const hasAccessMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser, signOut } }),
}));

vi.mock("@/lib/auth/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/access")>()),
  hasAccess: (...args: unknown[]) => hasAccessMock(...args),
}));

import { updateSession } from "./middleware";
import { AccessCheckError } from "@/lib/auth/access";
import { ACCESS_COOKIE } from "@/lib/auth/accessCookie";

const USER = { id: "auth-1", email: "person@example.com" };

function req(path: string, init: { headers?: Record<string, string>; cookie?: string } = {}) {
  const headers: Record<string, string> = {
    ...init.headers,
    cookie: ["sb-proj-auth-token.0=abc", "sb-proj-auth-token.1=def", init.cookie]
      .filter(Boolean)
      .join("; "),
  };
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

function expired(res: Response, name: string) {
  const all = res.headers.getSetCookie();
  return all.some((c) => c.startsWith(`${name}=;`) && /Max-Age=0/i.test(c));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ACCESS_COOKIE_SECRET = "test-secret";
  getUser.mockResolvedValue({ data: { user: USER } });
  signOut.mockResolvedValue({ error: null });
});

describe("updateSession access check", () => {
  it("lets an allowed user through and caches the yes", async () => {
    hasAccessMock.mockResolvedValue({ ok: true, userId: "u1", companyIds: ["c1"] });
    const res = await updateSession(req("/site/dashboard"));
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${ACCESS_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=300/);

    // Second request with that cookie skips the query.
    const value = cookie!.split(";")[0].split("=")[1];
    hasAccessMock.mockClear();
    const res2 = await updateSession(req("/site/attendance", { cookie: `${ACCESS_COOKIE}=${value}` }));
    expect(res2.status).toBe(200);
    expect(hasAccessMock).not.toHaveBeenCalled();
  });

  it("always re-checks /api/auth/access, even with a cached yes", async () => {
    hasAccessMock.mockResolvedValue({ ok: true, userId: "u1", companyIds: ["c1"] });
    const first = await updateSession(req("/site/dashboard"));
    const value = first.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${ACCESS_COOKIE}=`))!
      .split(";")[0]
      .split("=")[1];
    hasAccessMock.mockClear();
    await updateSession(req("/api/auth/access", { cookie: `${ACCESS_COOKIE}=${value}` }));
    expect(hasAccessMock).toHaveBeenCalledTimes(1);
  });

  it.each(["no_profile", "inactive", "no_company"] as const)(
    "page request refused (%s): signs out and redirects to /no-access",
    async (reason) => {
      hasAccessMock.mockResolvedValue({ ok: false, reason });
      const res = await updateSession(req("/site/dashboard"));
      expect(res.status).toBe(307);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.pathname).toBe("/no-access");
      expect(loc.searchParams.get("reason")).toBe(reason);
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(expired(res, "sb-proj-auth-token.0")).toBe(true);
      expect(expired(res, "sb-proj-auth-token.1")).toBe(true);
      expect(expired(res, ACCESS_COOKIE)).toBe(true);
      expect(res.headers.getSetCookie().some((c) => c.startsWith("aesta_no_access_email=person%40example.com") || c.startsWith("aesta_no_access_email=person@example.com"))).toBe(true);
    }
  );

  it("API request refused: 403 JSON with code no_access", async () => {
    hasAccessMock.mockResolvedValue({ ok: false, reason: "inactive" });
    const res = await updateSession(req("/api/admin/users"));
    expect(res.status).toBe(403);
    expect(res.headers.get("X-No-Access")).toBe("true");
    expect(await res.json()).toEqual({ error: "You don't have access to Aesta.", code: "no_access" });
    expect(expired(res, "sb-proj-auth-token.0")).toBe(true);
  });

  it("RSC request refused: 403 JSON (no redirect) so the client can navigate", async () => {
    hasAccessMock.mockResolvedValue({ ok: false, reason: "no_company" });
    const res = await updateSession(req("/site/dashboard", { headers: { RSC: "1" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("X-No-Access")).toBe("true");
    expect(res.headers.get("location")).toBeNull();
  });

  it("never caches a no", async () => {
    hasAccessMock.mockResolvedValue({ ok: false, reason: "inactive" });
    const res = await updateSession(req("/site/dashboard"));
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${ACCESS_COOKIE}=v1.`))).toBe(false);
  });

  it("check failure: page passes through, API gets 503, nobody is signed out", async () => {
    hasAccessMock.mockRejectedValue(new AccessCheckError("down"));
    const page = await updateSession(req("/site/dashboard"));
    expect(page.status).toBe(200);
    const api = await updateSession(req("/api/admin/users"));
    expect(api.status).toBe(503);
    expect((await api.json()).code).toBe("access_check_failed");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("public routes skip the check", async () => {
    for (const p of ["/no-access", "/auth/callback", "/forgot-password", "/reset-password"]) {
      await updateSession(req(p));
    }
    expect(hasAccessMock).not.toHaveBeenCalled();
  });

  it("Neram's signed event push needs no session; the events sync still does", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const push = await updateSession(req("/api/neram/events"));
    expect(push.status).toBe(200);
    expect(push.headers.get("location")).toBeNull();

    const sync = await updateSession(req("/api/neram/events/sync"));
    expect(new URL(sync.headers.get("location")!).pathname).toBe("/login");
  });

  it("privacy and terms open signed out (Google consent screen links)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const p of ["/privacy", "/terms"]) {
      const res = await updateSession(req(p));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
    // Exact paths only.
    const other = await updateSession(req("/privacy-admin"));
    expect(new URL(other.headers.get("location")!).pathname).toBe("/login");
  });

  it("signed-out page request still goes to /login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateSession(req("/site/dashboard"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(hasAccessMock).not.toHaveBeenCalled();
  });
});
