import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAccess } from "@/lib/auth/admin";
import { invitePerson, resolveAdminCompany } from "@/lib/auth/people";

// Error messages for better user experience
const ERROR_MESSAGES: Record<string, string> = {
  "User already registered":
    "A user with this email address already exists. Please use a different email.",
  "Password should be at least 6 characters":
    "Password must be at least 6 characters long.",
  "Unable to validate email address: invalid format":
    "Please enter a valid email address.",
  "Signup requires a valid password":
    "Please provide a password for the new user.",
  "User not allowed":
    "Admin privileges are required. Please ensure SUPABASE_SERVICE_ROLE_KEY is configured correctly.",
  "Invalid API key":
    "Server configuration error. Please contact the administrator.",
  "service_role key is required":
    "Server is not properly configured for admin operations. Please add SUPABASE_SERVICE_ROLE_KEY to your environment variables.",
};

function getReadableError(error: any): string {
  const message =
    error?.message || error?.toString() || "An unknown error occurred";

  // Check for known error messages
  for (const [key, readable] of Object.entries(ERROR_MESSAGES)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return readable;
    }
  }

  // Return original message if no match found
  return message;
}

/**
 * Invite a person (admin only): auth user -> users row -> company_members row
 * for the admin's current company, each step undone if a later one fails.
 * The password is optional ("Leave empty if they will use Continue with Google").
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const access = await verifyAdminAccess(supabase);
    if (!access.authorized) {
      return NextResponse.json({ success: false, error: access.error }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    }

    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (configError: any) {
      return NextResponse.json(
        {
          success: false,
          error:
            configError.message ||
            "Server is not configured for admin operations. Please contact the administrator.",
        },
        { status: 500 }
      );
    }

    const company = await resolveAdminCompany(adminClient, access.userId, body.company_id);
    if (!company.ok) {
      return NextResponse.json({ success: false, error: company.error, code: company.code }, { status: company.status });
    }

    const result = await invitePerson(adminClient, body, company.companyId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error, code: result.code }, { status: result.status });
    }

    return NextResponse.json(
      { success: true, message: "Person invited", userId: result.userId },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error inviting person:", error);
    return NextResponse.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify admin access
    const { authorized, error: authError } = await verifyAdminAccess(supabase);
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: authError },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, email, name, phone, role, assigned_sites, status, password } =
      body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "User ID is required for updates." },
        { status: 400 }
      );
    }

    // Validate role if provided
    if (role) {
      const validRoles = ["admin", "office", "site_engineer"];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid role. Must be admin, office, or site_engineer.",
          },
          { status: 400 }
        );
      }
    }

    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (configError: any) {
      return NextResponse.json(
        {
          success: false,
          error:
            configError.message ||
            "Server is not configured for admin operations.",
        },
        { status: 500 }
      );
    }

    // Update user profile
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (role !== undefined) updateData.role = role;
    if (assigned_sites !== undefined)
      updateData.assigned_sites =
        assigned_sites?.length > 0 ? assigned_sites : null;
    if (status !== undefined) updateData.status = status;

    const { error: profileError } = await adminClient
      .from("users")
      .update(updateData)
      .eq("id", id);

    if (profileError) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to update user: ${getReadableError(profileError)}`,
        },
        { status: 400 }
      );
    }

    // Update password if provided
    if (password && password.length > 0) {
      if (password.length < 6) {
        return NextResponse.json(
          {
            success: false,
            error: "Password must be at least 6 characters long.",
          },
          { status: 400 }
        );
      }

      // Get the auth_id from the user profile
      const { data: userProfile } = await adminClient
        .from("users")
        .select("auth_id")
        .eq("id", id)
        .single();

      if (userProfile?.auth_id) {
        const { error: passwordError } =
          await adminClient.auth.admin.updateUserById(userProfile.auth_id, {
            password,
          });

        if (passwordError) {
          return NextResponse.json(
            {
              success: false,
              error: `User updated but password change failed: ${getReadableError(
                passwordError
              )}`,
            },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json(
      { success: true, message: "User updated successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }
}
