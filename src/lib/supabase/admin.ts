import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The service-role key bypasses all RLS. It is read only from
 * SUPABASE_SERVICE_ROLE_KEY, on the server. It must never carry the
 * NEXT_PUBLIC_ prefix: Next.js inlines those into any client bundle that
 * references them.
 */
export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/**
 * Creates a Supabase admin client using the service role key.
 * This should ONLY be used in server-side code (API routes, server actions).
 * NEVER expose this client to the browser.
 */
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
