import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAccessResult =
  | { authorized: true; error: null; authUserId: string; userId: string }
  | { authorized: false; error: string; authUserId: string | null; userId: null };

/**
 * Only an active admin may use the admin APIs and admin-only pages.
 *
 * The caller passes the *session* client (cookies), not the service-role
 * client: we must read the profile of the person making the request. The
 * `users` row is looked up by `auth_id`, and both `role = 'admin'` and
 * `status = 'active'` are required. Anything else (no session, no profile,
 * non-admin role, inactive/suspended) is refused; callers answer 403.
 */
export async function verifyAdminAccess(
  // Typed loosely so both the generated-Database client and plain clients fit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<AdminAccessResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      error: "You must be logged in to perform this action.",
      authUserId: null,
      userId: null,
    };
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (error || !profile || profile.role !== "admin" || profile.status !== "active") {
    return {
      authorized: false,
      error: "Only an admin can do this.",
      authUserId: user.id,
      userId: null,
    };
  }

  return {
    authorized: true,
    error: null,
    authUserId: user.id,
    userId: profile.id as string,
  };
}
