"use client";

/**
 * One inventory batch shown as a card. Top: MaterialAvatar tile (category-
 * themed gradient or photo). Body: type/batch chip row, material name + spec,
 * big mono remaining qty, stacked usage bar (per-site colors for group),
 * legend, footer (vendor + payer + amount + action button).
 *
 * Mirrors the Inventory Card anatomy in
 * docs/MaterialHub_Redesign/proto-inventory.jsx.
 */

import { Box, Button, Typography } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { fmtQty } from "@/lib/formatters";
import MaterialAvatar from "./MaterialAvatar";

export interface InventoryItemView {
  id: string;
  kind: "own" | "group";
  /** Material + brand identity (needed to find the matching stock_inventory
   *  row when the user clicks "Log usage" on a pooled own-PO card). */
  material_id?: string;
  brand_id?: string | null;
  material_name: string;
  material_spec?: string | null;
  material_unit: string;
  material_category: string | null;
  material_image_url?: string | null;
  batch_code: string | null;
  vendor_name: string | null;
  payer_site_name: string | null;
  received_qty: number;
  remaining_qty: number;
  used_qty: number;
  total_value: number;
  is_advance?: boolean;
  is_spot?: boolean;
  /** Brand variant (e.g. "TNPL", "ARM Cement"). Surfaced as a chip when present. */
  brand_name?: string | null;
  brand_variant?: string | null;
  brand_image_url?: string | null;
  /** True when remaining_qty is the shared site bucket (own POs don't separate
   *  batches at the inventory level). Card shows a hint when true. */
  remaining_is_pooled?: boolean;
  /** Purchase date — shown on per-batch cards as a small footer date. */
  purchased_at?: string | null;
}

export interface InventoryCardProps {
  item: InventoryItemView;
  onLogUsage?: (item: InventoryItemView) => void;
  onViewHistory?: (item: InventoryItemView) => void;
}

export default function InventoryCard({
  item,
  onLogUsage,
  onViewHistory,
}: InventoryCardProps) {
  // EMPTY/LOW badges only apply to batch-exact cards. For shared-pool cards
  // (own POs merged into a (site, material, brand) bucket), the displayed
  // "remaining" is the pool's state — not this specific batch's — so a 0 pool
  // doesn't mean this 10-bag TNPL purchase is "EMPTY". Suppress the badge to
  // avoid misleading the engineer.
  const trackBatchState = !item.remaining_is_pooled;
  const lowThreshold = item.received_qty > 0 ? item.received_qty * 0.2 : 0;
  const isLow =
    trackBatchState &&
    item.remaining_qty > 0 &&
    item.remaining_qty < lowThreshold;
  const isEmpty = trackBatchState && item.remaining_qty <= 0;
  const accent = item.kind === "group" ? hubTokens.pink : hubTokens.primary;
  const usedPct =
    item.received_qty > 0 ? (item.used_qty / item.received_qty) * 100 : 0;

  return (
    <Box
      sx={{
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <MaterialAvatar
        category={item.material_category}
        materialName={item.material_name}
        imageUrl={item.brand_image_url ?? item.material_image_url ?? null}
        badge={
          isEmpty
            ? { label: "EMPTY", tone: "danger" }
            : isLow
              ? { label: "LOW", tone: "warn" }
              : null
        }
      />
      <Box sx={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Tags row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <Box
            component="span"
            sx={{
              padding: "2px 8px",
              borderRadius: "5px",
              background: item.kind === "group" ? hubTokens.pinkSoft : hubTokens.primarySoft,
              color: item.kind === "group" ? hubTokens.pink : hubTokens.primary,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.4px",
              textTransform: "uppercase",
            }}
          >
            {item.kind}
          </Box>
          {item.is_advance && (
            <Box
              component="span"
              sx={{
                padding: "2px 8px",
                borderRadius: "5px",
                background: hubTokens.warnSoft,
                color: hubTokens.warn,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Advance
            </Box>
          )}
          {item.is_spot && (
            <Box
              component="span"
              sx={{
                padding: "2px 8px",
                borderRadius: "5px",
                background: hubTokens.warnSoft,
                color: hubTokens.warn,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Spot
            </Box>
          )}
          {item.batch_code && (
            <Box
              component="span"
              sx={{
                marginLeft: "auto",
                fontFamily: hubTokens.mono,
                fontSize: 10.5,
                color: hubTokens.subtle,
                fontWeight: 600,
              }}
            >
              {item.batch_code}
            </Box>
          )}
        </Box>

        {/* Title + spec + brand */}
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.text }}>
            {item.material_name}
          </Typography>
          {(item.brand_name || item.brand_variant) && (
            <Box sx={{ display: "flex", alignItems: "center", gap: "6px", mt: "2px" }}>
              <Box
                component="span"
                sx={{
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: hubTokens.hairline,
                  fontSize: 10,
                  fontWeight: 700,
                  color: hubTokens.muted,
                  letterSpacing: "0.3px",
                  textTransform: "uppercase",
                }}
              >
                {item.brand_name ?? "—"}
                {item.brand_variant ? ` · ${item.brand_variant}` : ""}
              </Box>
            </Box>
          )}
          {item.material_spec && (
            <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
              {item.material_spec}
            </Typography>
          )}
        </Box>

        {/* Big mono remaining — labeled so "0" is unambiguous (it's qty LEFT,
            not qty used). Engineers were reading "0 bag · of 10" as "0 used
            out of 10" instead of "0 left out of 10 received". */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.6px",
              textTransform: "uppercase",
              color: hubTokens.subtle,
            }}
          >
            {item.remaining_is_pooled ? "In shared pool" : "Remaining"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <Typography
              sx={{
                fontSize: 30,
                fontWeight: 800,
                fontFamily: hubTokens.mono,
                letterSpacing: "-1px",
                color: isEmpty ? hubTokens.subtle : isLow ? hubTokens.warn : hubTokens.text,
                lineHeight: 1,
              }}
            >
              {item.remaining_qty.toFixed(item.remaining_qty % 1 === 0 ? 0 : 1)}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: hubTokens.muted,
              }}
            >
              {item.material_unit} left
              {" · "}
              <Box component="span" sx={{ color: hubTokens.subtle }}>
                {item.used_qty.toFixed(item.used_qty % 1 === 0 ? 0 : 1)} used
              </Box>
              {" · "}
              <Box component="span" sx={{ color: hubTokens.subtle }}>
                {fmtQty(item.received_qty)} received
              </Box>
            </Typography>
          </Box>
        </Box>

        {/* Usage bar */}
        <Box
          sx={{
            height: 8,
            borderRadius: "4px",
            background: hubTokens.hairline,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              width: `${Math.min(usedPct, 100)}%`,
              height: "100%",
              background: accent,
            }}
          />
        </Box>
        {item.remaining_is_pooled && (
          <Typography
            sx={{
              fontSize: 10,
              color: hubTokens.subtle,
              fontStyle: "italic",
              marginTop: "-4px",
            }}
          >
            Remaining is the site&apos;s shared pool for this material — own-site
            POs aren&apos;t tracked per batch yet.
          </Typography>
        )}

        {/* Footer */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${hubTokens.hairline}`,
            paddingTop: "10px",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 11.5,
                color: hubTokens.muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.vendor_name ?? "—"}
            </Typography>
            {item.payer_site_name && (
              <Box
                component="span"
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: hubTokens.pink,
                  letterSpacing: "0.3px",
                  textTransform: "uppercase",
                }}
              >
                Payer · {item.payer_site_name}
              </Box>
            )}
          </Box>
          <Typography
            sx={{
              fontFamily: hubTokens.mono,
              fontSize: 12.5,
              fontWeight: 700,
              color: hubTokens.text,
            }}
          >
            {inr(item.total_value)}
          </Typography>
        </Box>

        {/* Action row: when fully consumed, replace "Log usage" with a
            "Completed" badge + "View history →" link so the user can audit
            who recorded what, instead of being offered an action that would
            just fail with "Insufficient stock". */}
        {item.remaining_qty <= 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "8px 10px",
              borderRadius: "6px",
              background: hubTokens.hairline,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Box
                component="span"
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: hubTokens.subtle,
                }}
              />
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                  color: hubTokens.muted,
                }}
              >
                {item.remaining_is_pooled ? "Pool empty" : "Completed"}
              </Typography>
            </Box>
            {onViewHistory && (
              <Button
                size="small"
                variant="text"
                onClick={() => onViewHistory(item)}
                sx={{
                  textTransform: "none",
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: hubTokens.muted,
                  padding: "2px 6px",
                  minWidth: 0,
                  "&:hover": { background: "transparent", color: accent },
                }}
              >
                View history →
              </Button>
            )}
          </Box>
        ) : (
          onLogUsage && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onLogUsage(item)}
              sx={{
                textTransform: "none",
                fontSize: 12,
                fontWeight: 600,
                borderColor: hubTokens.border,
                color: accent,
                "&:hover": {
                  borderColor: accent,
                  background:
                    item.kind === "group" ? hubTokens.pinkSoft : hubTokens.primarySoft,
                },
              }}
            >
              Log usage →
            </Button>
          )
        )}
      </Box>
    </Box>
  );
}
