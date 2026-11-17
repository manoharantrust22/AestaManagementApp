import { describe, expect, it } from "vitest";
import { verifyAdminAccess } from "./admin";

function fakeClient(opts: {
  user: { id: string } | null;
  profile?: { id: string; role: string; status: string } | null;
  error?: unknown;
}) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: opts.profile ?? null, error: opts.error ?? null }),
  };
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: () => query,
  } as never;
}

describe("verifyAdminAccess", () => {
  it("refuses when signed out", async () => {
    const r = await verifyAdminAccess(fakeClient({ user: null }));
    expect(r.authorized).toBe(false);
    expect(r.authUserId).toBeNull();
  });

  it("refuses when there is no users row", async () => {
    const r = await verifyAdminAccess(fakeClient({ user: { id: "a1" }, profile: null }));
    expect(r).toMatchObject({ authorized: false, authUserId: "a1" });
  });

  it.each(["office", "site_engineer"])("refuses role %s", async (role) => {
    const r = await verifyAdminAccess(
      fakeClient({ user: { id: "a1" }, profile: { id: "u1", role, status: "active" } })
    );
    expect(r.authorized).toBe(false);
  });

  it.each(["inactive", "suspended"])("refuses an admin who is %s", async (status) => {
    const r = await verifyAdminAccess(
      fakeClient({ user: { id: "a1" }, profile: { id: "u1", role: "admin", status } })
    );
    expect(r.authorized).toBe(false);
  });

  it("refuses when the profile lookup errors", async () => {
    const r = await verifyAdminAccess(
      fakeClient({ user: { id: "a1" }, error: { message: "boom" } })
    );
    expect(r.authorized).toBe(false);
  });

  it("allows an active admin", async () => {
    const r = await verifyAdminAccess(
      fakeClient({ user: { id: "a1" }, profile: { id: "u1", role: "admin", status: "active" } })
    );
    expect(r).toEqual({ authorized: true, error: null, authUserId: "a1", userId: "u1" });
  });
});
