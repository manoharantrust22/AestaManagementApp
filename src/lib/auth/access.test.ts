import { describe, expect, it } from "vitest";
import { AccessCheckError, hasAccess } from "./access";

type Row = { id: string; status: string; company_members: { company_id: string }[] | null };

function fakeClient(result: { data?: Row | null; error?: unknown; throws?: boolean }) {
  const calls: { table?: string; select?: string; eq?: [string, string] } = {};
  const query = {
    select: (cols: string) => ((calls.select = cols), query),
    eq: (col: string, val: string) => ((calls.eq = [col, val]), query),
    maybeSingle: async () => {
      if (result.throws) throw new Error("network down");
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
  const client = { from: (t: string) => ((calls.table = t), query) } as never;
  return { client, calls };
}

describe("hasAccess", () => {
  it("refuses with no_profile when there is no users row", async () => {
    const { client } = fakeClient({ data: null });
    expect(await hasAccess(client, "a1")).toEqual({ ok: false, reason: "no_profile" });
  });

  it.each(["inactive", "suspended"])("refuses %s users with inactive", async (status) => {
    const { client } = fakeClient({
      data: { id: "u1", status, company_members: [{ company_id: "c1" }] },
    });
    expect(await hasAccess(client, "a1")).toEqual({ ok: false, reason: "inactive" });
  });

  it.each([[[]], [null]])("refuses with no_company when memberships are %j", async (members) => {
    const { client } = fakeClient({
      data: { id: "u1", status: "active", company_members: members as never },
    });
    expect(await hasAccess(client, "a1")).toEqual({ ok: false, reason: "no_company" });
  });

  it("allows an active member and returns ids", async () => {
    const { client, calls } = fakeClient({
      data: {
        id: "u1",
        status: "active",
        company_members: [{ company_id: "c1" }, { company_id: "c2" }],
      },
    });
    expect(await hasAccess(client, "a1")).toEqual({
      ok: true,
      userId: "u1",
      companyIds: ["c1", "c2"],
    });
    // One query: users by auth_id with memberships embedded.
    expect(calls).toEqual({
      table: "users",
      select: "id, status, company_members(company_id)",
      eq: ["auth_id", "a1"],
    });
  });

  it("throws AccessCheckError (not a refusal) on a query error", async () => {
    const { client } = fakeClient({ error: { message: "boom" } });
    await expect(hasAccess(client, "a1")).rejects.toBeInstanceOf(AccessCheckError);
  });

  it("throws AccessCheckError when the request itself fails", async () => {
    const { client } = fakeClient({ throws: true });
    await expect(hasAccess(client, "a1")).rejects.toBeInstanceOf(AccessCheckError);
  });
});
