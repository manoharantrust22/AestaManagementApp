"use client";

import { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  IconButton,
  Link,
  Tooltip,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  ReceiptLong as BillIcon,
} from "@mui/icons-material";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  useEquipmentVendorPricesForIds,
  useDeleteEquipmentVendorPrice,
} from "@/hooks/queries/useEquipmentVendorPrices";
import EquipmentPriceDialog from "./EquipmentPriceDialog";
import type { EquipmentWithDetails } from "@/types/equipment.types";

interface EquipmentVariantPricesProps {
  equipment: EquipmentWithDetails;
  canEdit?: boolean;
}

export default function EquipmentVariantPrices({
  equipment,
  canEdit = false,
}: EquipmentVariantPricesProps) {
  const variants = equipment.variants || [];

  // Price targets: each size when the tool has variants, else the tool itself.
  const targets =
    variants.length > 0
      ? variants.map((v) => ({ id: v.id, label: v.variant_label || v.name }))
      : [{ id: equipment.id, label: equipment.name }];

  const ids = targets.map((t) => t.id);
  const { data: byId = {} } = useEquipmentVendorPricesForIds(ids);
  const deletePrice = useDeleteEquipmentVendorPrice();

  const [priceTarget, setPriceTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  return (
    <Box>
      {targets.map((t) => {
        const prices = byId[t.id] || [];
        // Prices come back sorted cheapest-first.
        const cheapestId = prices.length > 1 ? prices[0].id : null;
        return (
          <Paper key={t.id} variant="outlined" sx={{ mb: 1.5, p: 1.5 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: prices.length ? 1 : 0,
              }}
            >
              <Typography variant="subtitle2">{t.label}</Typography>
              {canEdit && (
                <Button size="small" onClick={() => setPriceTarget(t)}>
                  Add price
                </Button>
              )}
            </Box>

            {prices.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No store prices yet.
              </Typography>
            ) : (
              prices.map((p) => {
                const isCheapest = p.id === cheapestId;
                const storeLabel = p.vendor?.name || p.store_name || "Store";
                return (
                  <Box
                    key={p.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      py: 0.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <Typography variant="body2" noWrap>
                          {storeLabel}
                        </Typography>
                        {isCheapest && (
                          <Chip label="Cheapest" color="success" size="small" />
                        )}
                        {p.bill_url && (
                          <Tooltip title="View bill">
                            <Link
                              href={p.bill_url}
                              target="_blank"
                              rel="noopener"
                              sx={{ display: "inline-flex" }}
                            >
                              <BillIcon fontSize="small" color="action" />
                            </Link>
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(p.recorded_date)}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography
                        variant="body2"
                        fontWeight="medium"
                        color={isCheapest ? "success.main" : undefined}
                      >
                        {formatCurrency(p.price)}
                      </Typography>
                      {canEdit && (
                        <Tooltip title="Remove price">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deletePrice.mutate(p.id)}
                            disabled={deletePrice.isPending}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                );
              })
            )}
          </Paper>
        );
      })}

      <EquipmentPriceDialog
        open={!!priceTarget}
        onClose={() => setPriceTarget(null)}
        equipmentId={priceTarget?.id || ""}
        targetLabel={priceTarget?.label}
      />
    </Box>
  );
}
