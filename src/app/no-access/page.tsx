import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Box, Button, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import { LockPerson } from "@mui/icons-material";
import { createClient } from "@/lib/supabase/server";
import { NO_ACCESS_EMAIL_COOKIE } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "No access | Aesta",
  robots: { index: false },
};

// Shown to anyone refused by hasAccess. The reason code in the URL is for
// logs only — never shown to the person.
export default async function NoAccessPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(NO_ACCESS_EMAIL_COOKIE)?.value ?? "";
  const email = /^[^\s@]+@[^\s@]+$/.test(raw) && raw.length <= 254 ? raw : null;

  async function signOutAction() {
    "use server";
    const supabase = await createClient();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Already signed out by the access check; nothing left to revoke.
    }
    (await cookies()).delete(NO_ACCESS_EMAIL_COOKIE);
    redirect("/login");
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)", borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
            <Box
              aria-hidden
              sx={{
                display: "inline-flex",
                bgcolor: "warning.light",
                color: "warning.contrastText",
                borderRadius: "50%",
                p: 2,
                mb: 2,
              }}
            >
              <LockPerson sx={{ fontSize: 40 }} />
            </Box>

            <Typography variant="h5" component="h1" fontWeight={700} gutterBottom>
              You don&apos;t have access to Aesta yet
            </Typography>

            <Typography color="text.secondary" sx={{ mb: 4 }}>
              {email ? (
                <>
                  This account (
                  <Box component="span" sx={{ fontWeight: 600, color: "text.primary", wordBreak: "break-all" }}>
                    {email}
                  </Box>
                  ) has not been added.
                </>
              ) : (
                "This account has not been added."
              )}{" "}
              Ask your company admin to add you, then try again.
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center">
              <Button
                href="/login"
                variant="contained"
                size="large"
                sx={{ minHeight: 48, textTransform: "none", fontWeight: 600 }}
              >
                Use a different account
              </Button>
              <Box component="form" action={signOutAction} sx={{ display: "flex" }}>
                <Button
                  type="submit"
                  variant="outlined"
                  size="large"
                  fullWidth
                  sx={{ minHeight: 48, textTransform: "none", fontWeight: 600 }}
                >
                  Sign out
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
