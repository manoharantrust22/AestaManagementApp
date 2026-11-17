import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  exchange: { data: { user: { id: "auth-1", email: "hari@neramclasses.com" } }, error: null } as {
    data: { user: { id: string; email?: string } | null };
    error: { message: string; code?: string } | null;
  },
  access: { ok: true, userId: "u1", companyIds: ["c1"] } as unknown,
  accessThrows: false,
  signOut: vi.fn(async () => ({ error: null })),
  setCookie: vi.fn(),
  lastLogin: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: state.setCookie, get: () => undefined, getAll: () => [] }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => state.exchange,
      signOut: state.signOut,
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ update: (v: unknown) => ({ eq: async (...a: unknown[]) => state.lastLogin(v, ...a) }) }),
  }),
}));
vi.mock("@/lib/auth/access", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/access")>();
  return {
    ...real,
    hasAccess: async () => {
      if (state.accessThrows) throw new real.AccessCheckError("down");
      return state.access;
    },
  };
});

import { GET } from "./route";

const call = (qs: string) => GET(new NextRequest(`https://app.aesta.co.in/auth/callback${qs}`));
const where = (res: Response) => {
  const u = new URL(res.headers.get("location")!);
  return u.pathname + u.search;
};

beforeEach(() => {
  state.exchange = { data: { user: { id: "auth-1", email: "hari@neramclasses.com" } }, error: null };
  state.access = { ok: true, userId: "u1", companyIds: ["c1"] };
  state.accessThrows = false;
  state.signOut.mockClear();
  state.setCookie.mockClear();
  state.lastLogin.mockClear();
});

describe("/auth/callback", () => {
  it("signs in and goes to a safe next path, stamping last_login_at", async () => {
    const res = await call("?code=abc&next=%2Ftasks%3Fid%3D1");
    expect(res.status).toBe(307);
    expect(where(res)).toBe("/tasks?id=1");
    expect(state.lastLogin).toHaveBeenCalledWith(expect.objectContaining({ last_login_at: expect.any(String) }), "id", "u1");
  });

  it.each(["//evil.com", "https://evil.com/x", "/\\evil.com"])("never follows next=%j off-site", async (next) => {
    const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://app.aesta.co.in");
    expect(loc.pathname).toBe("/site/dashboard");
  });

  it("refused: signs out and sends to /no-access with the email cookie", async () => {
    state.access = { ok: false, reason: "no_company" };
    const res = await call("?code=abc");
    expect(where(res)).toBe("/no-access?reason=no_company");
    expect(state.signOut).toHaveBeenCalled();
    expect(state.setCookie).toHaveBeenCalledWith("aesta_no_access_email", "hari@neramclasses.com", expect.objectContaining({ httpOnly: true }));
    expect(state.lastLogin).not.toHaveBeenCalled();
  });

  it("provider error (sign-ups off): back to /login with the error, no exchange", async () => {
    const res = await call("?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error_code")).toBe("signup_disabled");
  });

  it("no code: back to /login", async () => {
    expect(where(await call(""))).toBe("/login?error=missing_code");
  });

  it("failed exchange: back to /login", async () => {
    state.exchange = { data: { user: null }, error: { message: "bad verifier", code: "bad_code_verifier" } };
    expect(where(await call("?code=x"))).toBe("/login?error=exchange_failed&error_code=bad_code_verifier");
  });

  it("access check down: does not sign out (middleware decides next)", async () => {
    state.accessThrows = true;
    const res = await call("?code=abc");
    expect(where(res)).toBe("/site/dashboard");
    expect(state.signOut).not.toHaveBeenCalled();
  });
});
