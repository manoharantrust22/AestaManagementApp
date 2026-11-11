import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase admin client using the service role key.
 * This should ONLY be used in server-side code (API routes, server actions).
 * NEVER expose this client to the browser.
 */
/**
 * The service-role key bypasses all RLS, so it must never carry the
 * NEXT_PUBLIC_ prefix (Next.js inlines those into any client bundle that
 * references them). The old name is still read as a fallback so production
 * keeps working until SUPABASE_SERVICE_ROLE_KEY is added in Vercel; remove
 * the fallback (and the old Vercel variable) after that deploy.
 */
export function getServiceRoleKey(): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (key) return key;
  const legacy = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (legacy) {
    console.warn(
      "[supabase/admin] Using legacy NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY. Rename it to SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return legacy;
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. " +
        "Please add it to your .env.local file. " +
        "You can find it in your Supabase Dashboard > Project Settings > API > service_role key"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
