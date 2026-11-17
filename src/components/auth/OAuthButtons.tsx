"use client";

import { useState } from "react";
import { Box, ButtonBase, CircularProgress, Stack, Typography } from "@mui/material";
import type { LoginMethod } from "@/lib/auth/redirect";

export type OAuthProvider = Extract<LoginMethod, "azure" | "google">;

/** Official four-square Microsoft logo (21×21, brand colours). */
function MicrosoftLogo() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Official Google "G" (standard colour mark). */
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/*
 * Brand rules (light theme):
 *  - Microsoft: white fill, 1px #8C8C8C border, #5E5E5E Segoe UI Semibold 15px,
 *    the four-square logo on the left, square corners.
 *  - Google: white fill, 1px #747775 border, #1F1F1F Roboto Medium 14px,
 *    the standard "G" on the left, 4px corners.
 * Both are 48px tall here (≥44px touch target) and share one width.
 */
const BRAND = {
  azure: {
    label: "Continue with Microsoft",
    logo: <MicrosoftLogo />,
    border: "#8C8C8C",
    color: "#5E5E5E",
    font: '"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif',
    weight: 600,
    size: "15px",
    radius: 0,
  },
  google: {
    label: "Continue with Google",
    logo: <GoogleLogo />,
    border: "#747775",
    color: "#1F1F1F",
    font: 'Roboto, Arial, "Segoe UI", sans-serif',
    weight: 500,
    size: "14px",
    radius: "4px",
  },
} as const;

export default function OAuthButtons({
  order,
  lastUsed,
  disabled,
  onSelect,
}: {
  order: OAuthProvider[];
  lastUsed: LoginMethod | null;
  disabled?: boolean;
  onSelect: (provider: OAuthProvider) => Promise<void>;
}) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  return (
    <Stack spacing={1.5}>
      {order.map((p) => {
        const b = BRAND[p];
        const busy = pending === p;
        return (
          <ButtonBase
            key={p}
            data-testid={`oauth-${p}`}
            disabled={disabled || !!pending}
            aria-busy={busy || undefined}
            onClick={async () => {
              setPending(p);
              try {
                await onSelect(p);
              } finally {
                // On success the page is already navigating away; on failure
                // the caller shows the message and the buttons come back.
                setPending(null);
              }
            }}
            sx={{
              width: "100%",
              height: 48,
              px: "12px",
              gap: "12px",
              justifyContent: "center",
              bgcolor: "#FFFFFF",
              border: `1px solid ${b.border}`,
              borderRadius: b.radius,
              color: b.color,
              fontFamily: b.font,
              fontWeight: b.weight,
              fontSize: b.size,
              lineHeight: "20px",
              position: "relative",
              transition: "background-color 150ms ease, box-shadow 150ms ease",
              "&:hover": { bgcolor: "#F7F8F8" },
              "&:active": { bgcolor: "#EEF0F1" },
              "&.Mui-focusVisible, &:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: 2,
              },
              "&.Mui-disabled": { opacity: busy ? 1 : 0.6 },
            }}
          >
            <Box component="span" sx={{ display: "inline-flex", width: 21, justifyContent: "center" }}>
              {busy ? <CircularProgress size={18} sx={{ color: b.color }} aria-label="Opening" /> : b.logo}
            </Box>
            <span>{b.label}</span>
            {lastUsed === p && (
              <Typography
                component="span"
                variant="caption"
                sx={{
                  position: "absolute",
                  right: 10,
                  display: { xs: "none", sm: "inline" },
                  color: "text.secondary",
                  fontSize: "0.75rem",
                }}
              >
                Last used
              </Typography>
            )}
          </ButtonBase>
        );
      })}
    </Stack>
  );
}
