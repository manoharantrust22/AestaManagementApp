"use client";

import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { Place as PlaceIcon, Payments as PaymentsIcon } from "@mui/icons-material";

export type OriginSiteChipProps = {
  /** The site that owns the row (material_requests.site_id / purchase_orders.site_id / etc.) */
  originatingSiteId?: string | null;
  /** The site that actually paid (material_purchase_expenses.paying_site_id). Defaults to originating site. */
  payingSiteId?: string | null;
  /** The site the user is currently viewing the row from. */
  currentSiteId: string;
  /** Sibling group sites (incl. current site) used to resolve names. */
  groupSites: Array<{ id: string; name: string }>;
  /** Compact dense rendering — true on table rows, false on cards. */
  dense?: boolean;
};

/**
 * Renders "From: <Site>" and (if different) "Paid by: <Site>" chips for
 * group-stock records. Renders nothing when both fields point at the
 * current site (avoid visual noise on self-originating rows).
 */
export default function OriginSiteChip({
  originatingSiteId,
  payingSiteId,
  currentSiteId,
  groupSites,
  dense = false,
}: OriginSiteChipProps) {
  const origin = originatingSiteId ?? null;
  const payer = payingSiteId ?? originatingSiteId ?? null;

  const showOrigin = origin && origin !== currentSiteId;
  const showPayer = payer && payer !== currentSiteId && payer !== origin;

  if (!showOrigin && !showPayer) return null;

  const nameOf = (siteId: string) =>
    groupSites.find((s) => s.id === siteId)?.name ?? "Other site";

  const size = dense ? "small" : "small";
  const sx = dense
    ? { height: 20, fontSize: "0.7rem", "& .MuiChip-icon": { fontSize: "0.85rem", ml: 0.5 } }
    : { fontSize: "0.75rem" };

  return (
    <Box sx={{ display: "inline-flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
      {showOrigin && (
        <Tooltip title="Originating site (request created here)">
          <Chip
            size={size}
            icon={<PlaceIcon />}
            label={
              <Typography component="span" sx={{ fontSize: "inherit" }}>
                From: <strong>{nameOf(origin)}</strong>
              </Typography>
            }
            variant="outlined"
            color="info"
            sx={sx}
          />
        </Tooltip>
      )}
      {showPayer && (
        <Tooltip title="Site that paid the vendor">
          <Chip
            size={size}
            icon={<PaymentsIcon />}
            label={
              <Typography component="span" sx={{ fontSize: "inherit" }}>
                Paid by: <strong>{nameOf(payer!)}</strong>
              </Typography>
            }
            variant="outlined"
            color="warning"
            sx={sx}
          />
        </Tooltip>
      )}
    </Box>
  );
}
