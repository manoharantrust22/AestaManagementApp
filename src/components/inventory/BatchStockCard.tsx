"use client";

import React from "react";
import { Box, Typography, Button, Chip } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import InventoryIcon from "@mui/icons-material/Inventory";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import type { ExtendedStockInventory } from "@/hooks/queries/useStockInventory";

interface Props {
  item: ExtendedStockInventory;
  onRecordUsage: (item: ExtendedStockInventory) => void;
}

export function BatchStockCard({ item, onRecordUsage }: Props) {
  const rawBrand = (item as any).brand as { brand_name?: string; variant_name?: string; image_url?: string | null } | null | undefined;
  const rawMaterial = item.material as any;
  const parentMaterial = rawMaterial?.parent_material as { id: string; name: string; image_url: string | null } | null | undefined;

  const brandLabel = rawBrand?.brand_name
    ? rawBrand.variant_name
      ? `${rawBrand.brand_name} ${rawBrand.variant_name}`
      : rawBrand.brand_name
    : null;
  const variantLabel = brandLabel ?? item.material?.name ?? "Unknown material";
  const materialName = parentMaterial?.name ? `${parentMaterial.name} · ${variantLabel}` : variantLabel;
  const materialCode = item.material?.code ?? null;
  const unit = item.material?.unit ?? "";
  const imageUrl = rawMaterial?.image_url ?? rawBrand?.image_url ?? parentMaterial?.image_url ?? null;

  // For shared batches the batch_unit_cost is the original purchase price; fall back to avg_unit_cost
  const unitCost =
    (item.is_shared && item.batch_unit_cost ? item.batch_unit_cost : item.avg_unit_cost) ?? 0;

  const qty = item.available_qty ?? item.current_qty ?? 0;

  return (
    <Box
      sx={{
        background: "#fff",
        borderRadius: 3,
        p: 1.25,
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.15s, transform 0.1s",
        "&:hover": {
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          transform: "translateY(-1px)",
        },
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {/* Header: avatar + name + code */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <EntityImageAvatar
          src={imageUrl}
          name={materialName}
          size={36}
          radius={8}
          fallbackIcon={<InventoryIcon />}
          tint="primary"
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {materialName}
          </Typography>
          {materialCode && (
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {materialCode}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Batch code */}
      {item.batch_code && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
          <LocalOfferIcon sx={{ fontSize: 12, color: "text.secondary" }} />
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.batch_code}
          </Typography>
        </Box>
      )}

      {/* Qty + price */}
      <Box>
        <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.1 }}>
          {qty} {unit}
        </Typography>
        {unitCost > 0 && (
          <Typography variant="caption" color="text.secondary">
            ₹{unitCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/{unit}
          </Typography>
        )}
      </Box>

      {/* Status chips */}
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        {item.is_shared ? (
          <Chip
            label="Shared"
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: "#e3f2fd", color: "#1565c0" }}
          />
        ) : (
          <Chip
            label="Own"
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: "#e8f5e9", color: "#2e7d32" }}
          />
        )}

        {item.settlement_state === "settled" && (
          <Chip
            label="✓ Settled"
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: "#e8f5e9", color: "#2e7d32" }}
          />
        )}
        {item.settlement_state === "pending" && (
          <Chip
            label="⏳ Pending"
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: "#fff8e1", color: "#f57f17" }}
          />
        )}

        {item.is_vendor_paid === false && (
          <Chip
            label="Vendor Unpaid"
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 600, bgcolor: "#ffebee", color: "#c62828" }}
          />
        )}
      </Box>

      <Button
        fullWidth
        variant="contained"
        size="small"
        startIcon={<PlayArrowIcon />}
        onClick={(e) => {
          e.stopPropagation();
          onRecordUsage(item);
        }}
        sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: 11, py: 0.75 }}
      >
        Record Usage
      </Button>
    </Box>
  );
}
