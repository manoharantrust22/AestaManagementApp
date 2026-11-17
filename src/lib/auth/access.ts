import type { SupabaseClient } from "@supabase/supabase-js";

/** Short-lived cookie (set on refusal) so /no-access can show the account. */
export const NO_ACCESS_EMAIL_COOKIE = "aesta_no_access_email";

export type AccessRefusal = "no_profile" | "inactive" | "no_company";

export type AccessResult =
  | { ok: true; userId: string; companyIds: string[] }
  | { ok: false; reason: AccessRefusal };

/** Thrown when the check itself could not run (network, PostgREST error). */
export class AccessCheckError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AccessCheckError";
  }
}

/**
 * The one rule for who may use Aesta: a `users` row for this auth id, with
 * `status = 'active'`, and at least one `company_members` row.
 *
 * One query: the users row plus its company memberships (embedded via the
 * company_members.user_id FK). Pass the caller's session client so RLS sees
 * the real user.
 *
 * A failed query throws AccessCheckError rather than returning a refusal:
 * "could not check" must never be confused with "no", or a network blip
 * would sign everyone out.
 */
export async function hasAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  authUserId: string
): Promise<AccessResult> {
  let data: { id: string; status: string; company_members: { company_id: string }[] | null } | null;
  try {
    const res = await supabase
      .from("users")
      .select("id, status, company_members(company_id)")
      .eq("auth_id", authUserId)
      .maybeSingle();
    if (res.error) throw res.error;
    data = res.data as typeof data;
  } catch (err) {
    throw new AccessCheckError("Access check failed", err);
  }

  if (!data) return { ok: false, reason: "no_profile" };
  if (data.status !== "active") return { ok: false, reason: "inactive" };

  const companyIds = (data.company_members ?? []).map((m) => m.company_id);
  if (companyIds.length === 0) return { ok: false, reason: "no_company" };

  return { ok: true, userId: data.id, companyIds };
}
