import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAdminAccess } from "@/lib/auth/admin";
import RegisterCompanyForm from "./RegisterCompanyForm";

// Server-side guard: only an active admin may open this page. The API it
// posts to (/api/admin/companies) repeats the same check.
export default async function RegisterCompanyPage() {
  const supabase = await createClient();
  const access = await verifyAdminAccess(supabase);
  if (!access.authorized) {
    redirect(access.authUserId ? "/site/dashboard" : "/login");
  }
  return <RegisterCompanyForm />;
}
