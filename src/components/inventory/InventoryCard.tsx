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

import { Box, Typography } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import MaterialAvatar from "./MaterialAvatar";

export interface InventoryItemView {
  id: string;
  kind: "own" | "group";
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
}

export interface InventoryCardProps {
  item: InventoryItemView;
}

export default function InventoryCard({ item }: InventoryCardProps) {
  const lowThreshold = item.received_qty > 0 ? item.received_qty * 0.2 : 0;
  const isLow = item.remaining_qty > 0 && item.remaining_qty < lowThreshold;
  const isEmpty = item.remaining_qty <= 0;
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
        imageUrl={item.material_image_url ?? null}
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

        {/* Title + spec */}
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.text }}>
            {item.material_name}
          </Typography>
          {item.material_spec && (
            <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
              {item.material_spec}
            </Typography>
          )}
        </Box>

        {/* Big mono remaining */}
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
            {item.material_unit} · of {item.received_qty.toFixed(0)}
          </Typography>
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
      </Box>
    </Box>
  );
}
