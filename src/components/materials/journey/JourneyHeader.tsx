"use client";

import React from "react";
import { Box, Typography, Chip, Button, alpha, useTheme } from "@mui/material";
import { OpenInNew as OpenInNewIcon } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import type { RequestJourney, JourneyOverallStatus } from "@/types/journey.types";

const STATUS_LABELS: Record<JourneyOverallStatus, string> = {
  pending_approval: "Pending Approval",
  ordered: "Ordered",
  delivery_pending: "Delivery Pending",
  delivery_verified: "Delivery Verified",
  vendor_paid: "Vendor Paid",
  settlement_done: "Settlement Done",
  complete: "Complete",
};

const STATUS_COLOR: Record<
  JourneyOverallStatus,
  "default" | "warning" | "info" | "primary" | "success" | "error"
> = {
  pending_approval: "warning",
  ordered: "info",
  delivery_pending: "info",
  delivery_verified: "primary",
  vendor_paid: "primary",
  settlement_done: "success",
  complete: "success",
};

interface JourneyHeaderProps {
  journey: RequestJourney;
  isFullPage: boolean;
}

export function JourneyHeader({ journey, isFullPage }: JourneyHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  const { request, overallStatus } = journey;

  // Derive subtitle from first request item qty if available
  const firstItem = request.items?.[0];
  const qtyLabel = firstItem
    ? `${firstItem.requested_qty} units`
    : null;

  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.75,
        borderBottom: `1px solid ${theme.palette.divider}`,
        background: alpha(theme.palette.background.default, 0.5),
      }}
    >
      {/* Top row: request number + full-page button */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
          mb: 0.75,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.65rem",
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
            }}
          >
            Request Journey
          </Typography>
          <Typography
            variant="subtitle2"
            sx={{
              fontSize: "0.9rem",
              fontWeight: 800,
              fontFamily: "monospace",
              letterSpacing: "0.02em",
              color: "text.primary",
            }}
          >
            {request.request_number}
          </Typography>
        </Box>

        {!isFullPage && (
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: "0.75rem !important" }} />}
            onClick={() =>
              router.push(`/site/material-requests/${request.id}`)
            }
            sx={{
              fontSize: "0.7rem",
              py: 0.25,
              px: 1,
              textTransform: "none",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            Full Page
          </Button>
        )}
      </Box>

      {/* Site name + material qty + status badge */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        {qtyLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.78rem" }}>
            {qtyLabel}
          </Typography>
        )}
        <Chip
          label={STATUS_LABELS[overallStatus]}
          color={STATUS_COLOR[overallStatus]}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.68rem",
            fontWeight: 700,
            "& .MuiChip-label": { px: 1 },
          }}
        />
        {journey.isGroupPO && (
          <Chip
            label="GROUP STOCK"
            size="small"
            sx={{
              height: 20,
              fontSize: "0.65rem",
              fontWeight: 700,
              bgcolor: "purple",
              color: "white",
              "& .MuiChip-label": { px: 1 },
            }}
          />
        )}
      </Box>
    </Box>
  );
}

export default JourneyHeader;
