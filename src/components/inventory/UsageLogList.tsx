"use client";

/**
 * Per-event usage log for one inventory item, shared by the Material Hub inline
 * panel and the standalone UsageHistoryDialog.
 *
 * Renders one row per usage event (qty · date · work · recorder · using site)
 * sourced from useUsageLog. When `canEdit` is set, each editable row gets Edit
 * and Delete affordances wired to the existing stock-reversing hooks:
 *   - group rows  → useUpdateBatchUsage / useDeleteBatchUsage (+ BatchUsageEditDialog)
 *   - pooled rows → useUpdateMaterialUsage / useDeleteMaterialUsage
 *
 * Settled / in-settlement group rows are locked (the settlement must be
 * reversed first) and rows used at a different site than the current one are
 * read-only — mirroring BatchUsageHistoryTab.
 */

import { useMemo, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LockIcon from "@mui/icons-material/Lock";
import { hubTokens } from "@/lib/material-hub/tokens";
import { formatDate } from "@/lib/formatters";
import {
  useUsageLog,
  type UsageLogItem,
  type UsageLogRow,
} from "@/hooks/queries/useUsageLog";
import {
  useUpdateBatchUsage,
  useDeleteBatchUsage,
} from "@/hooks/queries/useBatchUsage";
import {
  useUpdateMaterialUsage,
  useDeleteMaterialUsage,
} from "@/hooks/queries/useMaterialUsage";
import BatchUsageEditDialog from "@/components/materials/BatchUsageEditDialog";
import type { BatchUsageRecordWithDetails } from "@/types/material.types";

export interface UsageLogListProps {
  item: UsageLogItem | null;
  siteId: string | undefined;
  /** Show Edit/Delete affordances (subject to per-row locks). */
  canEdit?: boolean;
  /** Render a totals header above the rows (used by the dialog). */
  showHeader?: boolean;
  enabled?: boolean;
}

function fmtQty(n: number, unit: string) {
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)} ${unit}`;
}

function rowIsLocked(row: UsageLogRow): boolean {
  return (
    row.source === "batch" &&
    (row.settlement_status === "settled" ||
      row.settlement_status === "in_settlement")
  );
}

export default function UsageLogList({
  item,
  siteId,
  canEdit = false,
  showHeader = false,
  enabled = true,
}: UsageLogListProps) {
  const { rows, isLoading, totalUsed } = useUsageLog(item, siteId, enabled);

  const updateBatch = useUpdateBatchUsage();
  const deleteBatch = useDeleteBatchUsage();
  const updatePool = useUpdateMaterialUsage();
  const deletePool = useDeleteMaterialUsage();

  const [editRow, setEditRow] = useState<UsageLogRow | null>(null);
  const [poolEditRow, setPoolEditRow] = useState<UsageLogRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UsageLogRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saving =
    updateBatch.isPending ||
    deleteBatch.isPending ||
    updatePool.isPending ||
    deletePool.isPending;

  const unit = item?.material_unit ?? "";

  const variantLabel = (r: UsageLogRow) =>
    `${r.material_name ?? item?.material_name ?? "—"}${r.brand_name ? ` · ${r.brand_name}` : ""}`;

  // Per-site × per-variant rollup: answers "how much of each size did each
  // site use" — the cross-tab the inventory card (per-variant) and inter-site
  // block (per-site) each only show one axis of. Only worth showing when there
  // is more than one size or more than one site to break down.
  const summary = useMemo(() => {
    const bySite = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const site = r.usage_site_name ?? "This site";
      const variant = variantLabel(r);
      if (!bySite.has(site)) bySite.set(site, new Map());
      const m = bySite.get(site)!;
      m.set(variant, (m.get(variant) ?? 0) + r.quantity);
    }
    return Array.from(bySite.entries()).map(([site, variants]) => ({
      site,
      total: Array.from(variants.values()).reduce((s, n) => s + n, 0),
      variants: Array.from(variants.entries()).map(([name, qty]) => ({ name, qty })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const distinctVariants = useMemo(
    () => new Set(rows.map((r) => variantLabel(r))).size,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  );
  const showSummary = rows.length > 0 && (distinctVariants > 1 || summary.length > 1);

  // A row is editable when canEdit, not locked, and (for group) used at the
  // current site — matching BatchUsageHistoryTab's per-site gate.
  const canEditRow = (row: UsageLogRow): boolean => {
    if (!canEdit) return false;
    if (rowIsLocked(row)) return false;
    if (row.source === "batch" && siteId && row.usage_site_id && row.usage_site_id !== siteId)
      return false;
    return true;
  };

  const startEdit = (row: UsageLogRow) => {
    setActionError(null);
    if (row.source === "batch") setEditRow(row);
    else setPoolEditRow(row);
  };

  const handleBatchEditSave = async (updates: {
    quantity?: number;
    work_description?: string;
  }) => {
    if (!editRow || !editRow.batch_ref_code || !siteId) return;
    try {
      await updateBatch.mutateAsync({
        usageId: editRow.id,
        batchRefCode: editRow.batch_ref_code,
        siteId,
        updates,
      });
      setEditRow(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const handlePoolEditSave = async (quantity: number, work_description: string) => {
    if (!poolEditRow || !siteId) return;
    try {
      await updatePool.mutateAsync({
        id: poolEditRow.id,
        siteId,
        data: { quantity, work_description },
      });
      setPoolEditRow(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !siteId) return;
    try {
      if (deleteTarget.source === "batch" && deleteTarget.batch_ref_code) {
        await deleteBatch.mutateAsync({
          usageId: deleteTarget.id,
          batchRefCode: deleteTarget.batch_ref_code,
          siteId,
        });
      } else {
        await deletePool.mutateAsync({ id: deleteTarget.id, siteId });
      }
      setDeleteTarget(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Typography
        sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic", py: 1 }}
      >
        No usage events recorded yet.
      </Typography>
    );
  }

  return (
    <Box>
      {actionError && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {showHeader && (
        <Box
          sx={{
            px: 0.5,
            py: 0.75,
            mb: 0.5,
            borderBottom: `1px solid ${hubTokens.hairline}`,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: hubTokens.muted }}>
            {rows.length} event{rows.length === 1 ? "" : "s"}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: hubTokens.muted }}>
            Total used: {fmtQty(totalUsed, unit)}
          </Typography>
        </Box>
      )}

      {/* Per-site × per-size rollup */}
      {showSummary && (
        <Box
          sx={{
            mb: 1,
            p: 1,
            borderRadius: "8px",
            background: hubTokens.hairline,
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.4px",
              textTransform: "uppercase",
              color: hubTokens.subtle,
            }}
          >
            Used by site &amp; size
          </Typography>
          {summary.map((s) => (
            <Box key={s.site}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: hubTokens.text }}>
                  {s.site}
                </Typography>
                <Typography sx={{ fontSize: 11, color: hubTokens.muted, fontFamily: hubTokens.mono }}>
                  {fmtQty(s.total, unit)}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", pl: 1, mt: 0.25 }}>
                {s.variants.map((v) => (
                  <Box
                    key={v.name}
                    sx={{ display: "flex", gap: "5px", alignItems: "baseline", fontSize: 11.5 }}
                  >
                    <Box component="span" sx={{ color: hubTokens.muted }}>{v.name}</Box>
                    <Box component="span" sx={{ fontWeight: 700, color: hubTokens.text, fontFamily: hubTokens.mono }}>
                      {fmtQty(v.qty, unit)}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r) => {
          const locked = rowIsLocked(r);
          const editable = canEditRow(r);
          return (
            <Box
              key={r.id}
              sx={{
                py: 0.85,
                borderBottom: `1px solid ${hubTokens.hairline}`,
                "&:last-child": { borderBottom: "none" },
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 1,
                  }}
                >
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text }}>
                    {fmtQty(r.quantity, r.unit || unit)}
                    <Box
                      component="span"
                      sx={{ fontSize: 11.5, fontWeight: 500, color: hubTokens.muted, ml: 0.75 }}
                    >
                      {variantLabel(r)}
                    </Box>
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, whiteSpace: "nowrap" }}>
                    {formatDate(r.usage_date)}
                  </Typography>
                </Box>
                {r.work_description && (
                  <Typography sx={{ fontSize: 12, color: hubTokens.text, mt: 0.25 }}>
                    {r.work_description}
                  </Typography>
                )}
                <Box sx={{ display: "flex", gap: 1, mt: 0.1, flexWrap: "wrap", alignItems: "center" }}>
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
                  {locked && (
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                        fontSize: 10,
                        color: hubTokens.subtle,
                      }}
                    >
                      <LockIcon sx={{ fontSize: 11 }} /> {r.settlement_status}
                    </Box>
                  )}
                </Box>
              </Box>

              {canEdit && (
                <Box sx={{ display: "flex", gap: 0.25, flexShrink: 0 }}>
                  {editable ? (
                    <>
                      <Tooltip title="Edit usage">
                        <IconButton size="small" onClick={() => startEdit(r)} disabled={saving}>
                          <EditIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete usage">
                        <IconButton
                          size="small"
                          onClick={() => { setActionError(null); setDeleteTarget(r); }}
                          disabled={saving}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip
                      title={
                        locked
                          ? "Settled — reverse the settlement (Settlement block) before editing."
                          : "Recorded at another site — edit it from that site."
                      }
                    >
                      <span>
                        <IconButton size="small" disabled>
                          <LockIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Group-batch edit — reuse the full-featured dialog */}
      <BatchUsageEditDialog
        open={!!editRow}
        record={
          editRow
            ? ({
                id: editRow.id,
                batch_ref_code: editRow.batch_ref_code,
                quantity: editRow.quantity,
                unit: editRow.unit,
                unit_cost: editRow.unit_cost ?? 0,
                total_cost: editRow.total_cost ?? 0,
                usage_date: editRow.usage_date,
                work_description: editRow.work_description,
                settlement_status: editRow.settlement_status,
                material: { name: editRow.material_name, unit: editRow.unit } as any,
                brand: editRow.brand_name ? ({ brand_name: editRow.brand_name } as any) : null,
                usage_site: editRow.usage_site_name
                  ? { id: editRow.usage_site_id ?? "", name: editRow.usage_site_name }
                  : undefined,
              } as unknown as BatchUsageRecordWithDetails)
            : null
        }
        onClose={() => setEditRow(null)}
        onSave={handleBatchEditSave}
        isSaving={updateBatch.isPending}
      />

      {/* Pooled (own) edit — lightweight quantity/description form */}
      <PoolUsageEditDialog
        open={!!poolEditRow}
        row={poolEditRow}
        unit={unit}
        isSaving={updatePool.isPending}
        onClose={() => setPoolEditRow(null)}
        onSave={handlePoolEditSave}
      />

      {/* Shared delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => !saving && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Delete usage event?</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Typography sx={{ fontSize: 13.5 }}>
              This removes the {fmtQty(deleteTarget.quantity, deleteTarget.unit || unit)} usage
              {deleteTarget.work_description ? ` (“${deleteTarget.work_description}”)` : ""} recorded on{" "}
              {formatDate(deleteTarget.usage_date)} and restores that quantity to stock. This cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={saving}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={saving}>
            {saving ? "Deleting…" : "Delete & restore stock"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface PoolUsageEditDialogProps {
  open: boolean;
  row: UsageLogRow | null;
  unit: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (quantity: number, work_description: string) => void;
}

function PoolUsageEditDialog({
  open,
  row,
  unit,
  isSaving,
  onClose,
  onSave,
}: PoolUsageEditDialogProps) {
  const [quantity, setQuantity] = useState<number>(0);
  const [desc, setDesc] = useState<string>("");
  const [touched, setTouched] = useState(false);

  // Seed fields when a new row opens.
  if (open && row && !touched) {
    setQuantity(row.quantity);
    setDesc(row.work_description ?? "");
    setTouched(true);
  }
  if (!open && touched) setTouched(false);

  if (!row) return null;
  const invalid = quantity <= 0;

  return (
    <Dialog open={open} onClose={() => !isSaving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Edit usage</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 0.5 }}>
          <TextField
            label={`Quantity (${unit})`}
            type="number"
            size="small"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            error={invalid}
            helperText={invalid ? "Must be greater than 0" : `Original: ${row.quantity} ${unit}`}
            inputProps={{ min: 0.001, step: 0.001 }}
            fullWidth
          />
          <TextField
            label="Work description"
            size="small"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(quantity, desc)}
          disabled={isSaving || invalid}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
