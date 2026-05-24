"use client";

/**
 * /site/rentals/v2 — Rental Hub (v2 beta)
 *
 * The unified surface for the rentals lifecycle. Replaces (eventually) the
 * separate /site/rentals list page, /site/rentals/[id] detail page, and the
 * three competing CTAs (New Request / Historical Record / New Rental). Each
 * row = one rental order showing its full Request -> Confirm -> Active ->
 * Returned -> Settled chain inline, with a live cost meter for active orders.
 *
 * Spec: docs/RentalHub_V2_redesign/README.md
 * Plan: C:\Users\Haribabu\.claude\plans\this-particular-folder-contains-merry-emerson.md
 */

import { useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PageHeader from "@/components/layout/PageHeader";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useRentalThreads } from "@/hooks/queries/useRentalThreads";
import {
  nextAction,
  overdueQueueItems,
  rentalCounts,
  toSettleQueueItems,
  type NextActionIntent,
} from "@/lib/rental-hub/nextAction";
import RentalHubKpiStrip from "@/components/rental-hub/RentalHubKpiStrip";
import RentalHubFilterChips, {
  type RentalFilterKey,
} from "@/components/rental-hub/RentalHubFilterChips";
import RentalThreadRow from "@/components/rental-hub/RentalThreadRow";
import OverdueQueue from "@/components/rental-hub/OverdueQueue";
import ToSettleQueue from "@/components/rental-hub/ToSettleQueue";
import {
  RentalHubDialogRouter,
  type RentalHubDialogRouterHandle,
} from "@/components/rental-hub/RentalHubDialogRouter";
import CreateRentalV2Dialog from "@/components/rental-hub/CreateRentalV2Dialog";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

const ACTIVE_STATUSES = new Set([
  "pending",
  "approved",
  "draft",
  "confirmed",
  "active",
  "partially_returned",
]);

function filterThreads(
  threads: RentalThread[],
  filter: RentalFilterKey,
): RentalThread[] {
  switch (filter) {
    case "active":
      return threads.filter(
        (t) =>
          !t.isCancelled &&
          t.effective_status !== "settled" &&
          ACTIVE_STATUSES.has(t.status),
      );
    case "action":
      return threads.filter((t) => nextAction(t) != null);
    case "overdue":
      return threads.filter(
        (t) => t.isOverdue && !t.isCancelled && t.effective_status !== "settled",
      );
    case "toSettle":
      return threads.filter(
        (t) => t.status === "completed" && t.effective_status !== "settled",
      );
    case "history":
      return threads.filter(
        (t) => t.isCancelled || t.effective_status === "settled",
      );
    case "all":
    default:
      return threads;
  }
}

export default function RentalHubV2Page() {
  const { selectedSite } = useSelectedSite();
  const { threads, rentalOrderById, isLoading, isError, error } = useRentalThreads(
    selectedSite?.id,
  );

  const [filter, setFilter] = useState<RentalFilterKey>("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const dialogRouterRef = useRef<RentalHubDialogRouterHandle>(null);

  const counts = useMemo(() => rentalCounts(threads), [threads]);
  const overdueItems = useMemo(() => overdueQueueItems(threads), [threads]);
  const toSettleItems = useMemo(() => toSettleQueueItems(threads), [threads]);
  const filtered = useMemo(() => filterThreads(threads, filter), [threads, filter]);

  const handleAction = (thread: RentalThread, intent?: NextActionIntent) => {
    dialogRouterRef.current?.openForThread(thread, intent);
  };

  // Default-filter fallback: if Active is empty but other buckets have rows,
  // auto-switch to "all" so the engineer sees something (better than blank).
  const visibleThreads = filtered.length > 0 ? filtered : threads;
  const fellBackToAll = filtered.length === 0 && threads.length > 0;

  if (!selectedSite) {
    return (
      <Box p={4}>
        <Alert severity="info">Please select a site to view the Rental Hub.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Rental Hub"
        subtitle="Equipment, scaffolding, centring — request to settle on one surface"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            New rental
          </Button>
        }
      />

      {isLoading && (
        <Box display="flex" alignItems="center" gap={2} py={2}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading rental threads…
          </Typography>
        </Box>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load rentals: {String((error as Error)?.message ?? error)}
        </Alert>
      )}

      {!isLoading && !isError && (
        <Stack spacing={2}>
          <RentalHubKpiStrip counts={counts} />

          <OverdueQueue items={overdueItems} onAction={handleAction} />
          <ToSettleQueue items={toSettleItems} onAction={handleAction} />

          <RentalHubFilterChips
            active={filter}
            onChange={setFilter}
            counts={counts}
          />

          {fellBackToAll && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              No rentals match <strong>{filterLabel(filter)}</strong>. Showing
              all {threads.length} rentals.
            </Alert>
          )}

          {threads.length === 0 ? (
            <Box
              sx={{
                background: hubTokens.card,
                border: `1px dashed ${hubTokens.border}`,
                borderRadius: "12px",
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontSize: 14, color: hubTokens.muted, mb: 0.5 }}>
                No rentals at this site yet.
              </Typography>
              <Typography sx={{ fontSize: 12, color: hubTokens.subtle }}>
                New rentals will appear here once you create one.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.25}>
              {visibleThreads.map((t) => (
                <RentalThreadRow
                  key={t.source_row_id}
                  thread={t}
                  selected={expandedId === t.source_row_id}
                  onSelect={() =>
                    setExpandedId((prev) => (prev === t.source_row_id ? null : t.source_row_id))
                  }
                  onAction={(thread) => handleAction(thread)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <RentalHubDialogRouter
        ref={dialogRouterRef}
        rentalOrderById={rentalOrderById}
      />

      <CreateRentalV2Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        siteId={selectedSite.id}
      />
    </Box>
  );
}

function filterLabel(filter: RentalFilterKey): string {
  switch (filter) {
    case "active":
      return "Active";
    case "action":
      return "Needs action";
    case "overdue":
      return "Overdue";
    case "toSettle":
      return "To settle";
    case "history":
      return "History";
    case "all":
      return "All";
  }
}
