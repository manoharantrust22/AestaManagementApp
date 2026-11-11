import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEV_EMAIL = "haribabu@nerasmclasses.onmicrosoft.com";
const DEV_PASSWORD = "Padma@123";

export async function POST() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // Look up the user by email
  const { data: listData, error: listError } =
    await adminClient.auth.admin.listUsers({ perPage: 50 });
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const user = listData.users.find((u) => u.email === DEV_EMAIL);
  if (!user) {
    return NextResponse.json(
      { error: `Dev user not found: ${DEV_EMAIL}` },
      { status: 404 }
    );
  }

  // Update password through GoTrue admin API — guarantees correct bcrypt format
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { password: DEV_PASSWORD }
  );
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
