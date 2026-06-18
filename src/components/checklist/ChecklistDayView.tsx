"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { ChevronLeft, ChevronRight, EventAvailable } from "@mui/icons-material";
import ChecklistItemRow, { type ItemRowHandlers } from "./ChecklistItemRow";
import DeferDialog from "./DeferDialog";
import StockConfirmDialog from "./StockConfirmDialog";
import StaleMaterialsHint from "./StaleMaterialsHint";
import { useMyChecklist } from "@/hooks/queries/useChecklistCompliance";
import {
  useSetChecklistEntry,
  useClearChecklistEntry,
  useConfirmStock,
} from "@/hooks/mutations/useChecklistEntry";
import {
  DONE_STATUSES,
  addDaysISO,
  todayISO,
  type ChecklistComplianceRow,
} from "@/types/checklist.types";

function dateLabel(date: string): string {
  const today = todayISO();
  if (date === today) return "Today";
  if (date === addDaysISO(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function ChecklistDayView({
  userId,
  companyId,
  siteId,
  date,
  onDateChange,
}: {
  userId: string | undefined;
  companyId: string | undefined;
  siteId: string | undefined;
  date: string;
  onDateChange: (next: string) => void;
}) {
  const router = useRouter();
  const { data: rows = [], isLoading } = useMyChecklist({ userId, companyId, siteId, date });

  const setEntry = useSetChecklistEntry();
  const clearEntry = useClearChecklistEntry();
  const confirmStock = useConfirmStock();
  const saving = setEntry.isPending || clearEntry.isPending || confirmStock.isPending;

  const [deferRow, setDeferRow] = useState<ChecklistComplianceRow | null>(null);
  const [stockRow, setStockRow] = useState<ChecklistComplianceRow | null>(null);

  const base = (row: ChecklistComplianceRow) => ({
    templateId: row.template_id,
    itemKey: row.item_key,
    userId: userId as string,
    siteId: row.site_id,
    businessDate: date,
  });

  const handlers: ItemRowHandlers = {
    onGo: (row) => row.deep_link_path && router.push(row.deep_link_path),
    onDefer: (row) => setDeferRow(row),
    onMarkDone: (row) => setEntry.mutate({ ...base(row), status: "done" }),
    onMarkNA: (row) => setEntry.mutate({ ...base(row), status: "na" }),
    onConfirmStock: (row) => setStockRow(row),
    onUndo: (row) =>
      clearEntry.mutate({
        templateId: row.template_id,
        userId: userId as string,
        siteId: row.site_id,
        businessDate: date,
      }),
  };

  const total = rows.length;
  const doneCount = rows.filter((r) => DONE_STATUSES.includes(r.status)).length;
  const deferred = rows.filter((r) => r.status === "deferred_pending").length;
  const missed = rows.filter((r) => r.status === "missed").length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const canGoForward = date < todayISO();

  return (
    <Box>
      {/* Date navigation + progress */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <IconButton onClick={() => onDateChange(addDaysISO(date, -1))} aria-label="Previous day">
          <ChevronLeft />
        </IconButton>
        <Stack alignItems="center" spacing={0.25}>
          <Typography variant="subtitle1" fontWeight={600}>
            {dateLabel(date)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {date}
          </Typography>
        </Stack>
        <IconButton
          onClick={() => canGoForward && onDateChange(addDaysISO(date, 1))}
          disabled={!canGoForward}
          aria-label="Next day"
        >
          <ChevronRight />
        </IconButton>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <EventAvailable fontSize="small" color="action" />
          <Typography variant="body2" color="text.secondary">
            {doneCount} of {total} done
          </Typography>
          {deferred > 0 && <Chip size="small" color="info" label={`${deferred} deferred`} />}
          {missed > 0 && <Chip size="small" color="error" label={`${missed} missed`} />}
        </Stack>
        <LinearProgress
          variant="determinate"
          value={pct}
          color={missed > 0 ? "error" : pct === 100 ? "success" : "primary"}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : total === 0 ? (
        <Alert severity="info">No checklist items configured for your role yet.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((row) => (
            <ChecklistItemRow
              key={`${row.template_id}-${row.site_id ?? "u"}`}
              row={row}
              saving={saving}
              handlers={handlers}
            >
              {row.detection_source === "material_usage" &&
                !DONE_STATUSES.includes(row.status) && (
                  <StaleMaterialsHint
                    siteId={row.site_id ?? siteId}
                    usageHref={row.deep_link_path ?? "/site/inventory?tab=usage"}
                  />
                )}
            </ChecklistItemRow>
          ))}
        </Stack>
      )}

      {/* Defer dialog */}
      <DeferDialog
        open={!!deferRow}
        itemLabel={deferRow?.label ?? ""}
        requireReason={deferRow?.requires_defer_reason ?? true}
        saving={saving}
        onClose={() => setDeferRow(null)}
        onConfirm={(reason) => {
          if (deferRow) {
            setEntry.mutate({
              ...base(deferRow),
              status: "deferred",
              deferredTo: addDaysISO(date, 1),
              deferReason: reason || null,
            });
          }
          setDeferRow(null);
        }}
      />

      {/* Stock confirmation dialog */}
      <StockConfirmDialog
        open={!!stockRow}
        saving={saving}
        onClose={() => setStockRow(null)}
        onConfirm={(matches, note) => {
          if (stockRow && stockRow.site_id) {
            confirmStock.mutate({
              siteId: stockRow.site_id,
              businessDate: date,
              confirmedBy: userId as string,
              stockMatches: matches,
              discrepancyNote: note || null,
            });
          }
          setStockRow(null);
        }}
      />
    </Box>
  );
}
