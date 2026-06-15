"use client";

/**
 * Mobile-only bottom sheet showing one thread's full detail.
 *
 * On desktop the Hub expands `MaterialThreadExpanded` inline below the row; on
 * mobile that inline panel is gated off, so tapping a card did nothing. This
 * sheet is the mobile tap-through: it reuses `MaterialThreadExpanded` verbatim
 * (full action parity — corrections, attachments, usage log, Settle /
 * Push-to-expense) inside a `SwipeableDrawer`, matching the established
 * bottom-sheet pattern in `QuickUsageSheet`.
 */

import { Box, IconButton, SwipeableDrawer, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { hubTokens } from "@/lib/material-hub/tokens";
import { stageLabel } from "@/lib/material-hub/stageHelpers";
import { threadDisplayName } from "@/lib/material-hub/threadTitle";
import MaterialThreadExpanded from "./MaterialThreadExpanded";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface MaterialThreadDetailSheetProps {
  open: boolean;
  thread: MaterialThread | null;
  onClose: () => void;
}

export default function MaterialThreadDetailSheet({
  open,
  thread,
  onClose,
}: MaterialThreadDetailSheetProps) {
  const accent = thread?.kind === "group" ? hubTokens.pink : hubTokens.primary;
  const variantCount =
    thread?.variants && thread.variants.length > 1 ? thread.variants.length : 0;

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderRadius: "18px 18px 0 0",
          maxWidth: 520,
          mx: "auto",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          // Clip at the Paper so the inner body is the sole scroller — keeps the
          // sticky header pinned and stops the Paper itself from scrolling.
          overflow: "hidden",
        },
      }}
    >
      {thread && (
        <>
          {/* Sticky header */}
          <Box
            sx={{
              flexShrink: 0,
              background: hubTokens.card,
              borderTop: `3px solid ${accent}`,
              borderBottom: `1px solid ${hubTokens.hairline}`,
              padding: "8px 14px 12px",
            }}
          >
            {/* Drag handle */}
            <Box
              sx={{
                width: 36,
                height: 4,
                bgcolor: "#e0e0e0",
                borderRadius: 1,
                mx: "auto",
                mb: 1.25,
              }}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    mb: "3px",
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 10.5,
                      fontFamily: hubTokens.mono,
                      fontWeight: 600,
                      color: hubTokens.subtle,
                    }}
                  >
                    {thread.id}
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      padding: "2px 7px",
                      borderRadius: "5px",
                      background: hubTokens.bg,
                      color: hubTokens.muted,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                    }}
                  >
                    {stageLabel(thread.stage)}
                  </Box>
                </Box>
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: hubTokens.text,
                    letterSpacing: "-0.1px",
                  }}
                >
                  <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
                    {thread.qty}
                  </Box>{" "}
                  <Box component="span" sx={{ color: hubTokens.muted, fontWeight: 500 }}>
                    {thread.material_unit} ·
                  </Box>{" "}
                  {threadDisplayName(thread)}
                  {variantCount > 0 ? ` · ${variantCount} sizes` : ""}
                </Typography>
              </Box>
              <IconButton
                onClick={onClose}
                size="small"
                aria-label="Close details"
                sx={{ flexShrink: 0, mt: "-2px" }}
              >
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Scrollable body — MaterialThreadExpanded supplies its own padding
              and reflows to a single column at the xs breakpoint. `minHeight: 0`
              lets this flex child shrink below its content so `overflowY: auto`
              actually engages (without it the body grows to content height and
              the sheet can't be scrolled). */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              overscrollBehavior: "contain",
            }}
          >
            <MaterialThreadExpanded thread={thread} />
          </Box>
        </>
      )}
    </SwipeableDrawer>
  );
}
