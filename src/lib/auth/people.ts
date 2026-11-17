import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inviting a person and changing a login email (Settings > Users, admin only).
 *
 * Inviting pre-creates the account: when the person first taps "Continue with
 * Google/Microsoft", Supabase links that login to this account because the
 * verified emails match. No invite email is sent.
 *
 * Takes the service-role client as an argument so the steps and their undo
 * can be tested without a database.
 */

type Admin = SupabaseClient<any, any, any>;

export type PersonRole = "admin" | "office" | "site_engineer";
export const PERSON_ROLES: readonly PersonRole[] = ["admin", "office", "site_engineer"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export type PeopleResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; status: number; error: string; code: string };

const fail = (status: number, code: string, error: string) => ({ ok: false as const, status, code, error });

const EMAIL_TAKEN = "This email is already used by another account. Use a different email.";

/** users.email match, case-insensitive (LIKE wildcards escaped). */
async function emailUsedInUsers(admin: Admin, email: string, exceptUserId?: string): Promise<boolean> {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  let q = admin.from("users").select("id").ilike("email", pattern).limit(1);
  if (exceptUserId) q = q.neq("id", exceptUserId);
  const { data, error } = await q;
  if (error) throw new Error(`email check: ${error.message}`);
  return (data ?? []).length > 0;
}

function isEmailExistsError(err: { message?: string; code?: string; status?: number } | null | undefined) {
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();
  return text.includes("email_exists") || text.includes("already been registered") || text.includes("already registered");
}

/**
 * The company an admin acts for: the one they picked in the app when they
 * belong to it, else their primary membership, else their first. Never a
 * company they don't belong to.
 */
export async function resolveAdminCompany(
  admin: Admin,
  adminUserId: string,
  requested: unknown
): Promise<PeopleResult<{ companyId: string; companyIds: string[] }>> {
  const { data, error } = await admin
    .from("company_members")
    .select("company_id, is_primary")
    .eq("user_id", adminUserId);
  if (error) return fail(500, "server", "Could not read your company. Please try again.");
  const rows = (data ?? []) as { company_id: string; is_primary: boolean | null }[];
  if (!rows.length) return fail(403, "no_company", "Your account is not part of a company.");
  const ids = rows.map((r) => r.company_id);
  const pick =
    (typeof requested === "string" && ids.includes(requested) && requested) ||
    rows.find((r) => r.is_primary)?.company_id ||
    ids[0];
  return { ok: true, companyId: pick, companyIds: ids };
}

/** Fields read from the request body: email, name, phone, role, assigned_sites, password. */
export type InviteInput = Record<string, unknown>;

/**
 * Creates, in order: the auth user (email confirmed; password only if
 * given), the users row, and the company_members row. Any failure undoes the
 * earlier steps. An email that already exists is refused.
 */
export async function invitePerson(
  admin: Admin,
  input: InviteInput,
  companyId: string
): Promise<PeopleResult<{ userId: string; authUserId: string }>> {
  const email = normalizeEmail(input.email);
  if (!email) return fail(400, "invalid", "Please enter a valid email address.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return fail(400, "invalid", "Please enter the person's name.");
  if (!PERSON_ROLES.includes(input.role as PersonRole)) {
    return fail(400, "invalid", "Choose a role: admin, office or site engineer.");
  }
  const role = input.role as PersonRole;
  const password = typeof input.password === "string" ? input.password : "";
  if (password && password.length < 6) {
    return fail(400, "invalid", "A password must be at least 6 characters, or leave it empty.");
  }
  const phone = typeof input.phone === "string" && input.phone.trim() ? input.phone.trim() : null;
  const sites = Array.isArray(input.assigned_sites)
    ? input.assigned_sites.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];

  if (await emailUsedInUsers(admin, email)) return fail(409, "email_taken", EMAIL_TAKEN);

  // 1. auth user
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
    user_metadata: { name },
  });
  if (authErr || !created?.user) {
    if (isEmailExistsError(authErr)) return fail(409, "email_taken", EMAIL_TAKEN);
    return fail(400, "auth_failed", `Could not create the account: ${authErr?.message ?? "unknown error"}`);
  }
  const authUserId = created.user.id;

  // 2. users row
  const { data: row, error: rowErr } = await admin
    .from("users")
    .insert({
      auth_id: authUserId,
      email,
      name,
      phone,
      role,
      assigned_sites: role !== "admin" && sites.length ? sites : null,
      status: "active",
    })
    .select("id")
    .single();
  if (rowErr || !row) {
    await admin.auth.admin.deleteUser(authUserId);
    return fail(400, "profile_failed", `Could not save the person: ${rowErr?.message ?? "unknown error"}`);
  }
  const userId = (row as { id: string }).id;

  // 3. company membership (this is what lets them past the app lock)
  const { error: memberErr } = await admin.from("company_members").insert({
    company_id: companyId,
    user_id: userId,
    role: role === "admin" ? "admin" : "member",
    is_primary: true,
  });
  if (memberErr) {
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(authUserId);
    return fail(400, "member_failed", `Could not add the person to the company: ${memberErr.message}`);
  }

  return { ok: true, userId, authUserId };
}

/**
 * Change the email a person signs in with. Their user id, sites, tasks and
 * task-hub link stay the same. Refused when another account uses the email,
 * or when the person is not in one of the admin's companies.
 */
export async function changeLoginEmail(
  admin: Admin,
  input: { userId: unknown; email: unknown },
  adminCompanyIds: string[]
): Promise<PeopleResult<{ email: string; previous: string }>> {
  const email = normalizeEmail(input.email);
  if (!email) return fail(400, "invalid", "Please enter a valid email address.");
  if (typeof input.userId !== "string" || !input.userId) return fail(400, "invalid", "Choose a person.");

  const { data: person, error: personErr } = await admin
    .from("users")
    .select("id, auth_id, email, company_members(company_id)")
    .eq("id", input.userId)
    .maybeSingle();
  if (personErr) return fail(500, "server", "Could not read that person. Please try again.");
  const p = person as {
    id: string;
    auth_id: string | null;
    email: string;
    company_members: { company_id: string }[] | null;
  } | null;
  if (!p || !(p.company_members ?? []).some((m) => adminCompanyIds.includes(m.company_id))) {
    return fail(404, "not_found", "That person is not in your company.");
  }
  if (!p.auth_id) return fail(400, "no_login", "That person has no login account yet.");
  if (p.email.toLowerCase() === email) return fail(400, "same_email", "That is already their login email.");

  if (await emailUsedInUsers(admin, email, p.id)) return fail(409, "email_taken", EMAIL_TAKEN);

  const { error: authErr } = await admin.auth.admin.updateUserById(p.auth_id, { email, email_confirm: true });
  if (authErr) {
    if (isEmailExistsError(authErr)) return fail(409, "email_taken", EMAIL_TAKEN);
    return fail(400, "auth_failed", `Could not change the login email: ${authErr.message}`);
  }

  const { error: rowErr } = await admin.from("users").update({ email }).eq("id", p.id);
  if (rowErr) {
    // Put the login back so the two never disagree.
    await admin.auth.admin.updateUserById(p.auth_id, { email: p.email, email_confirm: true });
    return fail(400, "profile_failed", `Could not change the login email: ${rowErr.message}`);
  }

  return { ok: true, email, previous: p.email };
}
