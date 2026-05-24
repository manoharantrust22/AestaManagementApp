"use client";

/**
 * Lightweight audit panel for a single inventory card.
 *
 * Two sources, chosen by what the card represents:
 *   - GROUP batch (batch_code = expense.ref_code) → batch_usage_records
 *     filtered by batch_ref_code (one row per usage event).
 *   - OWN / pooled pool ((site, material[, brand])) → daily_material_usage
 *     filtered by site + material (+ brand if present).
 *
 * Read-only by design — for editing/deleting, the office uses the existing
 * BatchUsageHistoryTab on /site/inter-site-settlement. This dialog answers
 * "who recorded what, on which date, for what work" without that footprint.
 */

import { useMemo } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { hubTokens } from "@/lib/material-hub/tokens";
import { formatDate } from "@/lib/formatters";

export interface UsageHistoryItem {
  material_id?: string;
  brand_id?: string | null;
  material_name: string;
  material_unit: string;
  batch_code: string | null;
  kind: "own" | "group";
}

export interface UsageHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string | undefined;
  item: UsageHistoryItem | null;
}

interface UsageRow {
  id: string;
  usage_date: string;
  quantity: number;
  work_description: string | null;
  recorded_by_name: string | null;
  usage_site_name: string | null;
}

export default function UsageHistoryDialog({
  open,
  onClose,
  siteId,
  item,
}: UsageHistoryDialogProps) {
  const supabase = createClient();
  const isBatchExact = !!item?.batch_code && item.kind === "group";

  const { data: rows = [], isLoading } = useQuery<UsageRow[]>({
    queryKey: [
      "usage-history",
      isBatchExact ? "batch" : "pool",
      item?.batch_code ?? null,
      siteId ?? null,
      item?.material_id ?? null,
      item?.brand_id ?? null,
    ],
    enabled: open && !!item && !!siteId,
    queryFn: async () => {
      if (!item || !siteId) return [];
      if (isBatchExact && item.batch_code) {
        const { data, error } = await (supabase as any)
          .from("batch_usage_records")
          .select(
            `id, usage_date, quantity, work_description,
             usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name),
             recorded_by_user:users!batch_usage_records_recorded_by_fkey(name)`
          )
          .eq("batch_ref_code", item.batch_code)
          .order("usage_date", { ascending: false });
        if (error) throw error;
        return ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          usage_date: r.usage_date,
          quantity: Number(r.quantity ?? 0),
          work_description: r.work_description ?? null,
          recorded_by_name: r.recorded_by_user?.name ?? null,
          usage_site_name: r.usage_site?.name ?? null,
        }));
      }
      // Own / pooled: filter by (site, material, brand-or-null).
      let q = (supabase as any)
        .from("daily_material_usage")
        .select(
          `id, usage_date, quantity, work_description, brand_id,
           created_by_user:users!daily_material_usage_created_by_fkey(name)`
        )
        .eq("site_id", siteId)
        .order("usage_date", { ascending: false });
      if (item.material_id) q = q.eq("material_id", item.material_id);
      const { data, error } = await q;
      if (error) throw error;
      // Brand-side filter client-side so brand_id=null entries also surface
      // when the card's brand is null (the bucket has merged variants).
      const brandFilter = item.brand_id ?? null;
      return ((data ?? []) as any[])
        .filter((r) => (r.brand_id ?? null) === brandFilter || brandFilter === null)
        .map((r) => ({
          id: r.id,
          usage_date: r.usage_date,
          quantity: Number(r.quantity ?? 0),
          work_description: r.work_description ?? null,
          recorded_by_name: r.created_by_user?.name ?? null,
          usage_site_name: null,
        }));
    },
  });

  const totalUsed = useMemo(
    () => rows.reduce((s, r) => s + r.quantity, 0),
    [rows]
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          py: 1.5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            Usage history
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            {item?.material_name ?? "—"}
            {item?.batch_code ? ` · ${item.batch_code}` : ""}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress size={24} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography sx={{ fontSize: 13, color: hubTokens.muted }}>
              No usage records found for this{" "}
              {isBatchExact ? "batch" : "material pool"}.
            </Typography>
            {!isBatchExact && (
              <Typography
                sx={{
                  fontSize: 11,
                  color: hubTokens.subtle,
                  mt: 1,
                  fontStyle: "italic",
                }}
              >
                Own-PO purchases share a pool by (material, brand) — history is
                pool-wide, not per-batch.
              </Typography>
            )}
          </Box>
        ) : (
          <Box>
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: `1px solid ${hubTokens.hairline}`,
                background: hubTokens.hairline,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: hubTokens.muted }}>
                {rows.length} record{rows.length === 1 ? "" : "s"}
              </Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: hubTokens.muted }}>
                Total used: {totalUsed.toFixed(totalUsed % 1 === 0 ? 0 : 1)}{" "}
                {item?.material_unit ?? ""}
              </Typography>
            </Box>
            {rows.map((r) => (
              <Box
                key={r.id}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: `1px solid ${hubTokens.hairline}`,
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {r.quantity.toFixed(r.quantity % 1 === 0 ? 0 : 1)}{" "}
                    <Box component="span" sx={{ fontSize: 11, fontWeight: 500, color: hubTokens.muted }}>
                      {item?.material_unit ?? ""}
                    </Box>
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
                    {formatDate(r.usage_date)}
                  </Typography>
                </Box>
                {r.work_description && (
                  <Typography sx={{ fontSize: 12, color: hubTokens.text, mt: 0.5 }}>
                    {r.work_description}
                  </Typography>
                )}
                <Box sx={{ display: "flex", gap: 1, mt: 0.25, flexWrap: "wrap" }}>
                  {r.recorded_by_name && (
                    <Typography sx={{ fontSize: 11, color: hubTokens.subtle }}>
                      by {r.recorded_by_name}
                    </Typography>
                  )}
                  {r.usage_site_name && (
                    <Typography sx={{ fontSize: 11, color: hubTokens.subtle }}>
                      · used at {r.usage_site_name}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
