"use client";

/**
 * UsageDetailDrawer
 *
 * Drill-down panel that opens from a ledger material row and lists all
 * individual usage entries composing the aggregate total.  Displays full
 * provenance, a per-batch cross-site allocation table (via
 * useBatchSettlementSummary), and in-place correction affordances that reuse
 * the exact same mutation hooks and edit dialogs as UsageLogList.
 *
 * Rules copied from UsageLogList:
 *   - Batch rows locked when settlement_status === "settled"|"in_settlement"
 *   - Cross-site rows (consuming_site_id !== siteId) are read-only for the
 *     current site — edit from the owning site
 *   - Hooks must NOT be called inside .map() — per-batch detail uses the
 *     dedicated <BatchEntryDetail> child component
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Chip,
  Collapse,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Divider,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LockIcon from "@mui/icons-material/Lock";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { hubTokens } from "@/lib/material-hub/tokens";
import { formatDate, formatCurrency } from "@/lib/formatters";
import {
  useUpdateBatchUsage,
  useDeleteBatchUsage,
  useBatchSettlementSummary,
} from "@/hooks/queries/useBatchUsage";
import {
  useUpdateMaterialUsage,
  useDeleteMaterialUsage,
} from "@/hooks/queries/useMaterialUsage";
import {
  useUsageLedgerDetail,
  type LedgerDetailEntry,
} from "@/hooks/queries/useUsageLedgerDetail";
import BatchUsageEditDialog from "@/components/materials/BatchUsageEditDialog";
import PoolUsageEditDialog, {
  type PoolUsageEditRow,
} from "@/components/materials/PoolUsageEditDialog";
import type { BatchUsageRecordWithDetails } from "@/types/material.types";
import {
  BATCH_USAGE_SETTLEMENT_STATUS_LABELS,
  BATCH_USAGE_SETTLEMENT_STATUS_COLORS,
  type BatchUsageSettlementStatus,
} from "@/types/material.types";
import type { LedgerRow } from "@/hooks/queries/useMaterialUsageLedger";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface UsageDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  rows: LedgerRow[];
  materialId: string | null;
  materialName: string;
  /** Consuming-site used for own-stock edit/delete + the cross-site lock. */
  siteId: string | undefined;
  scopeKey: string;
  canEdit: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtQty(n: number, unit: string) {
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)} ${unit}`;
}

function entryIsLocked(entry: LedgerDetailEntry): boolean {
  return (
    entry.source === "batch" &&
    (entry.settlement_status === "settled" ||
      entry.settlement_status === "in_settlement")
  );
}

function canEditEntry(
  entry: LedgerDetailEntry,
  siteId: string | undefined,
  canEdit: boolean,
): boolean {
  if (!canEdit) return false;
  if (entryIsLocked(entry)) return false;
  if (
    entry.source === "batch" &&
    siteId &&
    entry.consuming_site_id &&
    entry.consuming_site_id !== siteId
  )
    return false;
  return true;
}

// ─── BatchEntryDetail ─────────────────────────────────────────────────────────
// Dedicated child component so useBatchSettlementSummary is called at the
// component top level — never inside a .map() callback.

interface BatchEntryDetailProps {
  entry: LedgerDetailEntry;
}

function BatchEntryDetail({ entry }: BatchEntryDetailProps) {
  const batchRefCode = entry.batch_ref_code ?? undefined;

  const { data: summary, isLoading } = useBatchSettlementSummary(batchRefCode);

  const { data: mpeInfo } = useQuery({
    queryKey: ["mpe-by-ref", batchRefCode],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("vendor_name, purchase_date, purchase_type")
        .eq("ref_code", batchRefCode!)
        .maybeSingle();
      if (error) return null;
      return data as {
        vendor_name: string | null;
        purchase_date: string | null;
        purchase_type: string | null;
      } | null;
    },
    enabled: !!batchRefCode,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Box sx={{ py: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <CircularProgress size={14} />
        <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
          Loading batch detail…
        </Typography>
      </Box>
    );
  }

  if (!summary) {
    return (
      <Typography
        sx={{ fontSize: 11, color: hubTokens.subtle, fontStyle: "italic" }}
      >
        Batch detail unavailable.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {/* Batch overview */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Payer
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.text }}>
            {summary.paying_site_name ?? "—"}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Total Amount
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.text, fontFamily: hubTokens.mono }}>
            {formatCurrency(summary.total_amount)}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Original / Used / Remaining
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.text, fontFamily: hubTokens.mono }}>
            {summary.original_qty} / {summary.used_qty} / {summary.remaining_qty}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Vendor
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.text }}>
            {mpeInfo?.vendor_name ?? "—"}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Purchased
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.text }}>
            {mpeInfo?.purchase_date ? formatDate(mpeInfo.purchase_date) : "—"}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Purchase Type
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.text }}>
            {mpeInfo?.purchase_type === "group_stock" ? "Group stock" : mpeInfo?.purchase_type != null ? "Own site" : "—"}
          </Typography>
        </Box>
      </Box>

      {/* Site allocations table */}
      {summary.site_allocations.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.4px",
              textTransform: "uppercase",
              color: hubTokens.subtle,
              mb: 0.5,
            }}
          >
            Cross-site allocations
          </Typography>
          <Box
            sx={{
              border: `1px solid ${hubTokens.hairline}`,
              borderRadius: "6px",
              overflow: "hidden",
            }}
          >
            {/* Header row */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 80px 80px 80px",
                gap: "4px",
                px: 1,
                py: 0.5,
                bgcolor: hubTokens.hairline,
              }}
            >
              {["Site", "Qty", "Amount", "Payer", "Status"].map((h) => (
                <Typography
                  key={h}
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: hubTokens.subtle,
                    textTransform: "uppercase",
                    letterSpacing: "0.3px",
                  }}
                >
                  {h}
                </Typography>
              ))}
            </Box>
            {summary.site_allocations.map((alloc, idx) => (
              <Box
                key={`${alloc.site_id}-${idx}`}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 60px 80px 80px 80px",
                  gap: "4px",
                  px: 1,
                  py: 0.5,
                  borderTop: `1px solid ${hubTokens.hairline}`,
                  bgcolor: alloc.is_payer ? hubTokens.successSoft : "transparent",
                }}
              >
                <Typography sx={{ fontSize: 11, color: hubTokens.text }}>
                  {alloc.site_name}
                </Typography>
                <Typography
                  sx={{ fontSize: 11, color: hubTokens.text, fontFamily: hubTokens.mono }}
                >
                  {alloc.quantity_used}
                </Typography>
                <Typography
                  sx={{ fontSize: 11, color: hubTokens.text, fontFamily: hubTokens.mono }}
                >
                  {formatCurrency(alloc.amount)}
                </Typography>
                <Box>
                  {alloc.is_payer && (
                    <Chip
                      label="Payer"
                      size="small"
                      color="success"
                      sx={{ height: 16, fontSize: 9, "& .MuiChip-label": { px: 0.75 } }}
                    />
                  )}
                </Box>
                <Box>
                  <Chip
                    label={
                      BATCH_USAGE_SETTLEMENT_STATUS_LABELS[
                        alloc.settlement_status as BatchUsageSettlementStatus
                      ] ?? alloc.settlement_status
                    }
                    size="small"
                    color={
                      BATCH_USAGE_SETTLEMENT_STATUS_COLORS[
                        alloc.settlement_status as BatchUsageSettlementStatus
                      ] ?? "default"
                    }
                    sx={{ height: 16, fontSize: 9, "& .MuiChip-label": { px: 0.75 } }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── OwnEntryDetail ───────────────────────────────────────────────────────────

interface OwnEntryDetailProps {
  entry: LedgerDetailEntry;
}

function OwnEntryDetail({ entry }: OwnEntryDetailProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
        Single-site entry — no cross-site allocation.
      </Typography>
      <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
        Verification:{" "}
        <Box
          component="span"
          sx={{ fontWeight: 700, color: entry.is_verified ? hubTokens.success : hubTokens.warn }}
        >
          {entry.is_verified ? "Verified" : "Not verified"}
        </Box>
      </Typography>
      {entry.section_id && (
        <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
          Section ID:{" "}
          <Box component="span" sx={{ fontFamily: hubTokens.mono, fontSize: 11 }}>
            {entry.section_id}
          </Box>
        </Typography>
      )}
    </Box>
  );
}

// ─── EntryRow ─────────────────────────────────────────────────────────────────
// Per-entry row — expansion is managed in parent state keyed by entry.id to
// avoid calling useBatchSettlementSummary unconditionally for all rows.

interface EntryRowProps {
  entry: LedgerDetailEntry;
  unit: string;
  /** The parent material name the drawer was opened for — used to tag variant entries. */
  parentName: string;
  siteId: string | undefined;
  canEdit: boolean;
  saving: boolean;
  onEdit: (entry: LedgerDetailEntry) => void;
  onDelete: (entry: LedgerDetailEntry) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

function EntryRow({
  entry,
  unit,
  parentName,
  siteId,
  canEdit,
  saving,
  onEdit,
  onDelete,
  expanded,
  onToggleExpand,
}: EntryRowProps) {
  const locked = entryIsLocked(entry);
  const editable = canEditEntry(entry, siteId, canEdit);
  // Show the specific grade/size when this entry is a variant of the parent.
  const variantLabel =
    entry.material_name && entry.material_name !== parentName
      ? entry.material_name
      : null;

  const settlementLabel =
    entry.settlement_status != null
      ? (BATCH_USAGE_SETTLEMENT_STATUS_LABELS[
          entry.settlement_status as BatchUsageSettlementStatus
        ] ?? entry.settlement_status)
      : null;

  const settlementColor =
    entry.settlement_status != null
      ? (BATCH_USAGE_SETTLEMENT_STATUS_COLORS[
          entry.settlement_status as BatchUsageSettlementStatus
        ] ?? ("default" as const))
      : ("default" as const);

  return (
    <Box
      sx={{
        borderBottom: `1px solid ${hubTokens.hairline}`,
        "&:last-child": { borderBottom: "none" },
        py: 1,
      }}
    >
      {/* Main row content */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Qty + date headline */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, minWidth: 0 }}>
              <Typography
                sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text }}
              >
                {fmtQty(entry.quantity, entry.unit || unit)}
              </Typography>
              {variantLabel && (
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    fontSize: 10.5,
                    color: hubTokens.primary,
                    bgcolor: hubTokens.primarySoft,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {variantLabel}
                </Box>
              )}
            </Box>
            <Typography
              sx={{
                fontSize: 11.5,
                color: hubTokens.muted,
                whiteSpace: "nowrap",
              }}
            >
              {formatDate(entry.usage_date)}
            </Typography>
          </Box>

          {/* Source + scope badges */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              mt: 0.5,
            }}
          >
            {entry.source === "batch" ? (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  fontSize: 10.5,
                  fontFamily: hubTokens.mono,
                  color: hubTokens.primary,
                  bgcolor: hubTokens.primarySoft,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: "4px",
                }}
              >
                Batch {entry.batch_ref_code ?? "—"}
              </Box>
            ) : (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  fontSize: 10.5,
                  color: hubTokens.muted,
                  bgcolor: hubTokens.hairline,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: "4px",
                }}
              >
                Own stock
              </Box>
            )}

            {entry.source === "batch" ? (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  fontSize: 10.5,
                  color: hubTokens.pink,
                  bgcolor: hubTokens.pinkSoft,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: "4px",
                }}
              >
                Group-cluster
                {entry.is_self_use === true ? " · Self-use" : ""}
              </Box>
            ) : (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  fontSize: 10.5,
                  color: hubTokens.muted,
                  bgcolor: hubTokens.hairline,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: "4px",
                }}
              >
                Single-site
              </Box>
            )}
          </Box>

          {/* Meta line: consuming site, by, created_at */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 8px",
              mt: 0.4,
              alignItems: "center",
            }}
          >
            <Typography sx={{ fontSize: 11, color: hubTokens.subtle }}>
              {entry.consuming_site_name}
            </Typography>
            {entry.recorded_by_name && entry.recorded_by_name !== "—" && (
              <Typography sx={{ fontSize: 11, color: hubTokens.subtle }}>
                · by {entry.recorded_by_name}
              </Typography>
            )}
            {entry.created_at && (
              <Typography sx={{ fontSize: 10.5, color: hubTokens.subtle }}>
                · recorded {formatDate(entry.created_at)}
              </Typography>
            )}
          </Box>

          {/* work_description */}
          {entry.work_description && (
            <Typography
              sx={{ fontSize: 12, color: hubTokens.text, mt: 0.4 }}
            >
              {entry.work_description}
            </Typography>
          )}

          {/* Chips row */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              mt: 0.5,
              alignItems: "center",
            }}
          >
            {/* Settlement chip — batch only */}
            {entry.source === "batch" && settlementLabel && (
              <Chip
                label={settlementLabel}
                size="small"
                color={settlementColor}
                sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
              />
            )}
            {/* Unverified chip — own only */}
            {entry.source === "own" && entry.is_verified === false && (
              <Chip
                icon={<WarningAmberIcon sx={{ fontSize: "12px !important" }} />}
                label="Unverified"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
              />
            )}
            {/* Lock indicator (inline, for locked batch rows) */}
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
                <LockIcon sx={{ fontSize: 11 }} />
                {entry.settlement_status}
              </Box>
            )}
          </Box>
        </Box>

        {/* Action buttons */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          {/* Expand toggle */}
          <Tooltip title={expanded ? "Collapse detail" : "Expand detail"}>
            <IconButton size="small" onClick={onToggleExpand}>
              {expanded ? (
                <ExpandLessIcon sx={{ fontSize: 15 }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 15 }} />
              )}
            </IconButton>
          </Tooltip>

          {/* Edit / Delete / Lock */}
          {canEdit && (
            <>
              {editable ? (
                <>
                  <Tooltip title="Edit usage">
                    <IconButton
                      size="small"
                      onClick={() => onEdit(entry)}
                      disabled={saving}
                    >
                      <EditIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete usage">
                    <IconButton
                      size="small"
                      onClick={() => onDelete(entry)}
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
                      ? "Settled — reverse the settlement first."
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
            </>
          )}
        </Box>
      </Box>

      {/* Expandable detail section */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box
          sx={{
            mt: 1,
            ml: 1,
            pl: 1.5,
            borderLeft: `2px solid ${hubTokens.hairline}`,
          }}
        >
          {entry.source === "batch" ? (
            <BatchEntryDetail entry={entry} />
          ) : (
            <OwnEntryDetail entry={entry} />
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export default function UsageDetailDrawer({
  open,
  onClose,
  rows,
  materialId,
  materialName,
  siteId,
  scopeKey,
  canEdit,
}: UsageDetailDrawerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // ── Data ──────────────────────────────────────────────────────────────────
  const { entries, isLoading } = useUsageLedgerDetail(rows, materialId, scopeKey);

  // ── Mutation hooks ────────────────────────────────────────────────────────
  const updateBatch = useUpdateBatchUsage();
  const deleteBatch = useDeleteBatchUsage();
  const updatePool = useUpdateMaterialUsage();
  const deletePool = useDeleteMaterialUsage();

  const saving =
    updateBatch.isPending ||
    deleteBatch.isPending ||
    updatePool.isPending ||
    deletePool.isPending;

  // ── Local UI state ────────────────────────────────────────────────────────
  const [editBatchEntry, setEditBatchEntry] = useState<LedgerDetailEntry | null>(null);
  const [editPoolEntry, setEditPoolEntry] = useState<LedgerDetailEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LedgerDetailEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Collapse any expanded rows when the drawer switches to a different material.
  useEffect(() => {
    setExpandedIds(new Set());
  }, [materialId]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const unit = entries[0]?.unit ?? "";

  const { totalQty, totalCost, batchCount, ownCount } = useMemo(() => {
    let tQty = 0;
    let tCost = 0;
    let batch = 0;
    let own = 0;
    for (const e of entries) {
      tQty += e.quantity;
      tCost += e.total_cost ?? 0;
      if (e.source === "batch") batch++;
      else own++;
    }
    return { totalQty: tQty, totalCost: tCost, batchCount: batch, ownCount: own };
  }, [entries]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (entry: LedgerDetailEntry) => {
    setActionError(null);
    if (entry.source === "batch") setEditBatchEntry(entry);
    else setEditPoolEntry(entry);
  };

  const startDelete = (entry: LedgerDetailEntry) => {
    setActionError(null);
    setDeleteTarget(entry);
  };

  const handleBatchEditSave = async (updates: {
    quantity?: number;
    work_description?: string;
    usage_site_id?: string;
  }) => {
    if (!editBatchEntry || !editBatchEntry.batch_ref_code || !siteId) return;
    try {
      await updateBatch.mutateAsync({
        usageId: editBatchEntry.id,
        batchRefCode: editBatchEntry.batch_ref_code,
        siteId,
        updates,
      });
      setEditBatchEntry(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const handlePoolEditSave = async (quantity: number, work_description: string) => {
    if (!editPoolEntry || !siteId) return;
    try {
      await updatePool.mutateAsync({
        id: editPoolEntry.id,
        siteId,
        data: { quantity, work_description },
      });
      setEditPoolEntry(null);
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

  // ── Synthesize BatchUsageRecordWithDetails for the edit dialog ─────────────
  // Mirrors UsageLogList lines ~418-444 exactly, adapted to LedgerDetailEntry.
  const batchEditRecord: BatchUsageRecordWithDetails | null = editBatchEntry
    ? ({
        id: editBatchEntry.id,
        batch_ref_code: editBatchEntry.batch_ref_code,
        quantity: editBatchEntry.quantity,
        unit: editBatchEntry.unit,
        unit_cost: editBatchEntry.unit_cost ?? 0,
        total_cost: editBatchEntry.total_cost ?? 0,
        usage_date: editBatchEntry.usage_date,
        work_description: editBatchEntry.work_description,
        settlement_status: editBatchEntry.settlement_status,
        // The ledger view doesn't expose settlement_id; null is the safe
        // fallback. Locked rows never reach this dialog (canEditEntry gates
        // settled/in_settlement), so the status-string check is sufficient.
        settlement_id: null,
        usage_site_id: editBatchEntry.consuming_site_id,
        material: { name: materialName, unit: editBatchEntry.unit } as any,
        brand: null,
        usage_site: {
          id: editBatchEntry.consuming_site_id,
          name: editBatchEntry.consuming_site_name,
        },
      } as unknown as BatchUsageRecordWithDetails)
    : null;

  // PoolUsageEditDialog reads only id/quantity/work_description (PoolUsageEditRow).
  const poolEditRow: PoolUsageEditRow | null = editPoolEntry
    ? {
        id: editPoolEntry.id,
        quantity: editPoolEntry.quantity,
        work_description: editPoolEntry.work_description,
      }
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Drawer
        anchor={isMobile ? "bottom" : "right"}
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: isMobile ? "100%" : 480,
            height: isMobile ? "90vh" : "100%",
            borderTopLeftRadius: isMobile ? "16px" : 0,
            borderTopRightRadius: isMobile ? "16px" : 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* ── Header ── */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${hubTokens.hairline}`,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              flex: 1,
              fontSize: 16,
              fontWeight: 700,
              color: hubTokens.text,
            }}
          >
            {materialName}
          </Typography>
          <IconButton size="small" onClick={onClose} edge="end">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* ── Body (scrollable) ── */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5 }}>
          {/* Error alert */}
          {actionError && (
            <Alert
              severity="error"
              sx={{ mb: 1.5 }}
              onClose={() => setActionError(null)}
            >
              {actionError}
            </Alert>
          )}

          {/* Loading state */}
          {isLoading && entries.length === 0 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 6,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          )}

          {/* Empty state */}
          {!isLoading && entries.length === 0 && (
            <Typography
              sx={{
                fontSize: 13,
                color: hubTokens.subtle,
                fontStyle: "italic",
                py: 2,
                textAlign: "center",
              }}
            >
              No usage entries found.
            </Typography>
          )}

          {entries.length > 0 && (
            <>
              {/* ── Summary strip ── */}
              <Box
                sx={{
                  mb: 1.5,
                  p: 1.25,
                  borderRadius: "8px",
                  bgcolor: hubTokens.hairline,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px 20px",
                  alignItems: "center",
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Total
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text, fontFamily: hubTokens.mono }}>
                    {fmtQty(totalQty, unit)}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Cost
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text, fontFamily: hubTokens.mono }}>
                    {formatCurrency(totalCost)}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Entries
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text }}>
                    {entries.length}
                  </Typography>
                </Box>
                <Box>
                  <Chip
                    label={`${batchCount} batch · ${ownCount} own`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 10.5,
                      bgcolor: hubTokens.card,
                      color: hubTokens.muted,
                      "& .MuiChip-label": { px: 1 },
                    }}
                  />
                </Box>
              </Box>

              <Divider sx={{ mb: 1 }} />

              {/* ── Entry rows ── */}
              <Box>
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    unit={unit}
                    parentName={materialName}
                    siteId={siteId}
                    canEdit={canEdit}
                    saving={saving}
                    onEdit={startEdit}
                    onDelete={startDelete}
                    expanded={expandedIds.has(entry.id)}
                    onToggleExpand={() => handleToggleExpand(entry.id)}
                  />
                ))}
              </Box>
            </>
          )}
        </Box>
      </Drawer>

      {/* ── Batch edit dialog ── */}
      <BatchUsageEditDialog
        open={!!editBatchEntry}
        record={batchEditRecord}
        onClose={() => setEditBatchEntry(null)}
        onSave={handleBatchEditSave}
        isSaving={updateBatch.isPending}
      />

      {/* ── Pool (own-stock) edit dialog ── */}
      <PoolUsageEditDialog
        open={!!editPoolEntry}
        row={poolEditRow}
        unit={unit}
        isSaving={updatePool.isPending}
        onClose={() => setEditPoolEntry(null)}
        onSave={handlePoolEditSave}
      />

      {/* ── Delete confirm dialog ── */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => !saving && setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          Delete usage event?
        </DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Box>
              <Typography sx={{ fontSize: 13.5 }}>
                This removes the{" "}
                {fmtQty(deleteTarget.quantity, deleteTarget.unit || unit)}{" "}
                usage
                {deleteTarget.work_description
                  ? ` ("${deleteTarget.work_description}")`
                  : ""}{" "}
                recorded on {formatDate(deleteTarget.usage_date)} and restores
                that quantity to stock. This cannot be undone.
              </Typography>
              {deleteTarget.source === "batch" && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  Group-batch deletes may not fully restore shared stock —
                  verify the Inventory block afterward.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={saving}
          >
            {saving ? "Deleting…" : "Delete & restore stock"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
