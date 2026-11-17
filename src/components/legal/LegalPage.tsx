import type { ReactNode } from "react";
import { Box, Container, Divider, Link, Stack, Typography } from "@mui/material";

// Shared shell for the public legal pages (/privacy, /terms). These are
// linked from Google's sign-in consent screen, so they must load signed out.
// Reading width is capped near 70 characters; body text stays at 16px.

export const LEGAL_CONTACT_EMAIL = "aestabuilders@gmail.com";
export const LEGAL_COMPANY = "Aesta Architects & Engineers";

type Section = { heading: string; body: ReactNode };

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  other,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: Section[];
  other: { href: string; label: string };
}) {
  return (
    <Box component="main" sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 3, sm: 6 } }}>
      <Container maxWidth={false} sx={{ maxWidth: 760, px: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1} sx={{ mb: 3, ml: -1, flexWrap: "wrap" }}>
          <NavLink href="/login">Back to sign in</NavLink>
          <NavLink href={other.href}>{other.label}</NavLink>
        </Stack>

        <Typography variant="h4" component="h1" fontWeight={700} sx={{ fontSize: { xs: 28, sm: 34 } }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3, fontSize: 14, maxWidth: "70ch" }}>
          Aesta Construction Manager, by {LEGAL_COMPANY}, Pudukkottai, Tamil Nadu. Last updated {updated}.
        </Typography>

        <Box sx={{ maxWidth: "70ch" }}>
          <Typography component="div" sx={bodySx}>
            {intro}
          </Typography>

          {sections.map((s) => (
            <Box component="section" key={s.heading} sx={{ mt: 4 }}>
              <Typography variant="h6" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                {s.heading}
              </Typography>
              <Typography component="div" sx={bodySx}>
                {s.body}
              </Typography>
            </Box>
          ))}

          <Divider sx={{ my: 5 }} />
          <Typography sx={{ ...bodySx, color: "text.secondary" }}>
            Questions? Email{" "}
            <Link href={`mailto:${LEGAL_CONTACT_EMAIL}`} underline="always">
              {LEGAL_CONTACT_EMAIL}
            </Link>
            .
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

const bodySx = {
  fontSize: 16,
  lineHeight: 1.65,
  color: "text.primary",
  "& p": { m: 0, mb: 1.5 },
  "& ul": { m: 0, mb: 1.5, pl: 3 },
  "& li": { mb: 0.75 },
  "& a": { color: "primary.main", textDecorationColor: "currentColor" },
  "& a:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: "2px" },
} as const;

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      underline="hover"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 44,
        px: 1,
        fontWeight: 600,
        borderRadius: 1,
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
      }}
    >
      {children}
    </Link>
  );
}
