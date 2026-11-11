import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

// Verify admin access
// Temporarily allowing all authenticated users during development
async function verifyAdminAccess(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      error: "You must be logged in to perform this action.",
    };
  }

  // Allow all authenticated users during development
  return { authorized: true, error: null };
}

export async function POST(request: NextRequest) {
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
    const { email, password, name, phone, role, assigned_sites, status } = body;

    // Validate required fields
    if (!email || !name || !role || !password) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields. Please provide email, name, role, and password.",
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        {
          success: false,
          error: "Password must be at least 6 characters long.",
        },
        { status: 400 }
      );
    }

    // Validate role
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

    // Create auth user
    const { data: authData, error: authCreateError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authCreateError) {
      return NextResponse.json(
        { success: false, error: getReadableError(authCreateError) },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to create user account. Please try again.",
        },
        { status: 500 }
      );
    }

    // Create user profile in database
    const { error: profileError } = await adminClient.from("users").insert({
      auth_id: authData.user.id,
      email,
      name,
      phone: phone || null,
      role,
      assigned_sites: assigned_sites?.length > 0 ? assigned_sites : null,
      status: status || "active",
    });

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        {
          success: false,
          error: `Failed to create user profile: ${getReadableError(
            profileError
          )}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "User created successfully",
        userId: authData.user.id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating user:", error);
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
