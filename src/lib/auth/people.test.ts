import { describe, expect, it, vi } from "vitest";
import { changeLoginEmail, invitePerson, normalizeEmail, resolveAdminCompany } from "./people";

type Res = { data?: unknown; error?: { message: string; code?: string } | null };

/**
 * A tiny stand-in for the service-role client. `answers[table][op]` is what
 * the query resolves to (op = the first write/read verb used: select, insert,
 * update, delete). Every call is recorded in `log`.
 */
function fakeAdmin(opts: {
  answers?: Record<string, Partial<Record<"select" | "insert" | "update" | "delete", Res>>>;
  createUser?: Res;
  updateUserById?: Res[];
}) {
  const log: Array<{ table: string; op: string; args: unknown[] }> = [];
  const updateAnswers = [...(opts.updateUserById ?? [{ data: {}, error: null }])];
  const auth = {
    admin: {
      createUser: vi.fn(async () => opts.createUser ?? { data: { user: { id: "auth-new" } }, error: null }),
      deleteUser: vi.fn(async () => ({ error: null })),
      updateUserById: vi.fn(async () => updateAnswers.shift() ?? { data: {}, error: null }),
    },
  };
  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" | null = null;
    const b: Record<string, unknown> = {};
    const chain = (name: string) =>
      (...args: unknown[]) => {
        if (["select", "insert", "update", "delete"].includes(name) && (!op || name !== "select")) {
          op = name as typeof op;
        }
        log.push({ table, op: name, args });
        return b;
      };
    for (const m of ["select", "insert", "update", "delete", "eq", "neq", "ilike", "limit"]) b[m] = chain(m);
    const answer = () => opts.answers?.[table]?.[op ?? "select"] ?? { data: null, error: null };
    b.single = async () => answer();
    b.maybeSingle = async () => answer();
    b.then = (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad);
    return b;
  };
  return { client: { auth, from } as never, auth, log };
}

const base = { email: "Ajith@Gmail.com ", name: "Ajith Kumar", role: "site_engineer" };

describe("normalizeEmail", () => {
  it("trims and lowercases", () => expect(normalizeEmail("  A@B.Co ")).toBe("a@b.co"));
  it.each(["", "nope", "a@b", 5, null])("rejects %j", (v) => expect(normalizeEmail(v)).toBeNull());
});

describe("invitePerson", () => {
  it("creates auth user, users row and company membership, without a password", async () => {
    const f = fakeAdmin({
      answers: { users: { select: { data: [] }, insert: { data: { id: "u-new" } } }, company_members: { insert: { error: null } } },
    });
    const r = await invitePerson(f.client, base, "c1");
    expect(r).toEqual({ ok: true, userId: "u-new", authUserId: "auth-new" });
    expect(f.auth.admin.createUser).toHaveBeenCalledWith({
      email: "ajith@gmail.com",
      email_confirm: true,
      user_metadata: { name: "Ajith Kumar" },
    });
    const member = f.log.find((l) => l.table === "company_members" && l.op === "insert");
    expect(member?.args[0]).toEqual({ company_id: "c1", user_id: "u-new", role: "member", is_primary: true });
  });

  it("passes the password only when given", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: [] }, insert: { data: { id: "u" } } } } });
    await invitePerson(f.client, { ...base, password: "secret1" }, "c1");
    expect(f.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ password: "secret1" }));
  });

  it("refuses an email already in users, before creating anything", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: [{ id: "u-old" }] } } } });
    const r = await invitePerson(f.client, base, "c1");
    expect(r).toMatchObject({ ok: false, status: 409, code: "email_taken" });
    expect(f.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("refuses an email the auth server already has", async () => {
    const f = fakeAdmin({
      answers: { users: { select: { data: [] } } },
      createUser: { data: null, error: { message: "A user with this email address has already been registered", code: "email_exists" } },
    });
    expect(await invitePerson(f.client, base, "c1")).toMatchObject({ ok: false, status: 409, code: "email_taken" });
  });

  it("undoes the auth user when the users row fails", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: [] }, insert: { data: null, error: { message: "boom" } } } } });
    const r = await invitePerson(f.client, base, "c1");
    expect(r).toMatchObject({ ok: false, code: "profile_failed" });
    expect(f.auth.admin.deleteUser).toHaveBeenCalledWith("auth-new");
  });

  it("undoes the users row and auth user when the membership fails", async () => {
    const f = fakeAdmin({
      answers: {
        users: { select: { data: [] }, insert: { data: { id: "u-new" } }, delete: { error: null } },
        company_members: { insert: { error: { message: "fk" } } },
      },
    });
    const r = await invitePerson(f.client, base, "c1");
    expect(r).toMatchObject({ ok: false, code: "member_failed" });
    expect(f.log.some((l) => l.table === "users" && l.op === "delete")).toBe(true);
    expect(f.auth.admin.deleteUser).toHaveBeenCalledWith("auth-new");
  });

  it.each([
    [{ ...base, email: "bad" }, /valid email/],
    [{ ...base, name: " " }, /name/],
    [{ ...base, role: "owner" }, /role/],
    [{ ...base, password: "123" }, /6 characters/],
  ])("validates %j", async (input, msg) => {
    const f = fakeAdmin({});
    const r = await invitePerson(f.client, input, "c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(f.auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe("resolveAdminCompany", () => {
  const rows = [
    { company_id: "c1", is_primary: false },
    { company_id: "c2", is_primary: true },
  ];
  it("uses the company picked in the app when the admin belongs to it", async () => {
    const f = fakeAdmin({ answers: { company_members: { select: { data: rows } } } });
    expect(await resolveAdminCompany(f.client, "u1", "c1")).toMatchObject({ ok: true, companyId: "c1" });
  });
  it("never a company the admin is not in: falls back to primary", async () => {
    const f = fakeAdmin({ answers: { company_members: { select: { data: rows } } } });
    expect(await resolveAdminCompany(f.client, "u1", "c-other")).toMatchObject({ ok: true, companyId: "c2" });
  });
  it("refuses an admin with no company", async () => {
    const f = fakeAdmin({ answers: { company_members: { select: { data: [] } } } });
    expect(await resolveAdminCompany(f.client, "u1", null)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("changeLoginEmail", () => {
  const person = {
    id: "u2",
    auth_id: "auth-2",
    email: "ajithkumar@nerasmclasses.onmicrosoft.com",
    company_members: [{ company_id: "c1" }],
  };

  it("moves auth email and users.email; id stays", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: person }, update: { error: null } } } });
    // select is used twice (person, then the email check); the email check
    // returns the same object, so make the second look empty:
    let calls = 0;
    const origFrom = (f.client as { from: (t: string) => unknown }).from;
    (f.client as { from: (t: string) => unknown }).from = (t: string) => {
      const b = origFrom(t) as Record<string, unknown>;
      if (t === "users") {
        calls++;
        if (calls === 2) b.then = (ok: (r: Res) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      }
      return b;
    };
    const r = await changeLoginEmail(f.client, { userId: "u2", email: "Ajith@Gmail.com" }, ["c1"]);
    expect(r).toEqual({ ok: true, email: "ajith@gmail.com", previous: person.email });
    expect(f.auth.admin.updateUserById).toHaveBeenCalledWith("auth-2", { email: "ajith@gmail.com", email_confirm: true });
    const upd = f.log.find((l) => l.table === "users" && l.op === "update");
    expect(upd?.args[0]).toEqual({ email: "ajith@gmail.com" });
  });

  it("refuses a person outside the admin's companies", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: person } } } });
    expect(await changeLoginEmail(f.client, { userId: "u2", email: "a@b.co" }, ["c9"])).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(f.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("refuses an email another account uses (auth says so)", async () => {
    const f = fakeAdmin({
      answers: { users: { select: { data: person } } },
      updateUserById: [{ data: null, error: { message: "Email address already registered", code: "email_exists" } }],
    });
    // email check: person object has no length -> treated as not taken; auth then refuses.
    const r = await changeLoginEmail(f.client, { userId: "u2", email: "taken@x.co" }, ["c1"]);
    expect(r).toMatchObject({ ok: false, status: 409, code: "email_taken" });
  });

  it("puts the auth email back when users.email cannot be saved", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: person }, update: { error: { message: "unique" } } } } });
    const r = await changeLoginEmail(f.client, { userId: "u2", email: "new@x.co" }, ["c1"]);
    expect(r).toMatchObject({ ok: false, code: "profile_failed" });
    expect(f.auth.admin.updateUserById).toHaveBeenLastCalledWith("auth-2", { email: person.email, email_confirm: true });
  });

  it("refuses the same email", async () => {
    const f = fakeAdmin({ answers: { users: { select: { data: person } } } });
    expect(
      await changeLoginEmail(f.client, { userId: "u2", email: person.email.toUpperCase() }, ["c1"])
    ).toMatchObject({ ok: false, code: "same_email" });
  });
});
