"use client";

import type { ReactNode } from "react";
import { Box, Dialog, Drawer, Typography, IconButton, useMediaQuery } from "@mui/material";
import Close from "@mui/icons-material/Close";
import { WS_MOBILE_BREAKPOINT, wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";

/**
 * A centred modal on desktop, a slide-up bottom sheet on mobile. All four Workspace
 * actions use it so the same form renders correctly on phone and desktop.
 */
export function ResponsiveSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const mobile = useMediaQuery(`(max-width:${WS_MOBILE_BREAKPOINT}px)`);

  const header = (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: 2.25, pt: 2, pb: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.02em" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: 12.5, color: wsColors.muted }} noWrap>
            {subtitle}
          </Typography>
        )}
      </Box>
      <IconButton size="small" onClick={onClose} sx={{ mt: -0.5, mr: -0.5 }}>
        <Close sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  );

  const body = (
    <>
      {header}
      <Box sx={{ px: 2.25, pb: 1, flex: 1, overflowY: "auto" }}>{children}</Box>
      {footer && (
        <Box
          sx={{
            px: 2.25,
            py: 1.75,
            borderTop: `1px solid ${wsColors.hairline2}`,
            display: "flex",
            gap: 1,
            justifyContent: "flex-end",
          }}
        >
          {footer}
        </Box>
      )}
    </>
  );

  if (mobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            maxHeight: "92vh",
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
          },
        }}
      >
        <Box sx={{ width: 38, height: 4, borderRadius: 999, bgcolor: wsColors.hairline, mx: "auto", mt: 1 }} />
        {body}
      </Drawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: `${wsRadius.card}px`,
          boxShadow: wsShadow.modal,
        },
      }}
    >
      {body}
    </Dialog>
  );
}
