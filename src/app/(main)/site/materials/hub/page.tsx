"use client";

/**
 * /site/materials/hub — Material Hub
 *
 * The unified surface for the materials lifecycle. Replaces (eventually) the
 * separate /site/material-requests, /site/purchase-orders,
 * /site/delivery-verification, /site/material-expenses and /site/spot-purchase
 * pages. Each row = one thread (a single material request) showing its full
 * Req → Approve → PO → Deliver → Settle → In-use chain inline.
 *
 * Mirrors `ProtoHub` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import { useSelectedSite } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import { useMaterialThreads } from "@/hooks/queries/useMaterialThreads";
import MaterialHubKpiStrip from "@/components/material-hub/MaterialHubKpiStrip";
import MaterialHubFilterChips, {
  type HubFilterKey,
} from "@/components/material-hub/MaterialHubFilterChips";
import MaterialThreadRow from "@/components/material-hub/MaterialThreadRow";
import MaterialHubTable from "@/components/material-hub/MaterialHubTable";
import NewEntryMenu from "@/components/material-hub/NewEntryMenu";
import AllocationsQueue from "@/components/material-hub/AllocationsQueue";
import BackfillEntryDialog, {
  type BackfillMethod,
} from "@/components/material-hub/backfill/BackfillEntryDialog";
import BackfillManualDialog from "@/components/material-hub/backfill/BackfillManualDialog";
import BackfillAIDialog from "@/components/material-hub/backfill/BackfillAIDialog";
import {
  HubDialogRouter,
  type HubDialogRouterHandle,
} from "@/components/material-hub/HubDialogRouter";
import {
  nextAction,
  threadCounts,
  interSiteDebt,
} from "@/lib/material-hub/nextAction";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

type HubLayout = "cards" | "table";

export default function MaterialHubPage() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;
  const siteGroupId = selectedSite?.site_group_id ?? null;

  const [filter, setFilter] = useState<HubFilterKey>("all");
  const [layout, setLayout] = useState<HubLayout>("cards");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [backfillPicker, setBackfillPicker] = useState(false);
  const [backfillMethod, setBackfillMethod] = useState<BackfillMethod | null>(null);

  const {
    threads,
    isLoading,
    isError,
    error,
    materialRequestById,
    purchaseOrderById,
  } = useMaterialThreads(siteId, siteGroupId);

  const dialogRouterRef = useRef<HubDialogRouterHandle>(null);

  const handleAction = (thread: MaterialThread) => {
    // Fully-consumed batch with an unsettled cross-site portion → route to the
    // inter-site settlement page (same destination as the expanded card's
    // "Settle this batch"). There's no usage dialog to open here.
    if (thread.stage === "exhausted" && thread.inter_site_pending) {
      const batchRef =
        thread.inventory?.batch && thread.inventory.batch !== "—"
          ? thread.inventory.batch
          : thread.settlement?.expense_ref ?? undefined;
      if (batchRef) {
        router.push(
          `/site/inter-site-settlement?batch=${encodeURIComponent(batchRef)}`
        );
        return;
      }
    }
    dialogRouterRef.current?.openForThread(thread);
  };

  const counts = useMemo(() => threadCounts(threads), [threads]);
  const debt = useMemo(
    () => interSiteDebt(threads, siteId ?? ""),
    [threads, siteId]
  );

  const settlementDueAmount = useMemo(
    () =>
      threads
        .filter(
          (t) => t.stage === "delivered" && t.settlement?.status !== "settled"
        )
        .reduce((sum, t) => sum + (t.po?.amount ?? 0), 0),
    [threads]
  );

  const filteredThreads = useMemo(() => {
    if (filter === "all") return threads;
    if (filter === "action") return threads.filter((t) => nextAction(t) != null);
    if (filter === "own") return threads.filter((t) => t.kind === "own");
    if (filter === "group") return threads.filter((t) => t.kind === "group");
    if (filter === "advance") return threads.filter((t) => t.advance);
    if (filter === "spot")
      return threads.filter((t) => t.purchase_type === "spot");
    if (filter === "historical")
      return threads.filter((t) => !!t.is_historical);
    return threads;
  }, [threads, filter]);

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Select a site to view its Material Hub.</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        padding: { xs: "14px 14px 80px", md: "18px 22px 80px" },
        minHeight: 0,
      }}
    >
      <PageHeader
        title="Material Hub"
        subtitle="Every material from request to expense, on one surface."
        titleChip={
          <Chip
            label={`${counts.all} threads`}
            size="small"
            sx={{
              background: hubTokens.primarySoft,
              color: hubTokens.primary,
              fontWeight: 600,
              fontSize: 11,
              height: 22,
            }}
          />
        }
        showBack={false}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              value={layout}
              exclusive
              onChange={(_, next) => next && setLayout(next as HubLayout)}
              size="small"
              sx={{
                display: { xs: "none", md: "inline-flex" },
                background: hubTokens.card,
                "& .MuiToggleButton-root": {
                  border: `1px solid ${hubTokens.border}`,
                  textTransform: "none",
                  fontSize: 12,
                  padding: "5px 12px",
                  color: hubTokens.muted,
                  "&.Mui-selected": {
                    background: hubTokens.primary,
                    color: "#fff",
                    "&:hover": { background: hubTokens.primaryHover },
                  },
                },
              }}
            >
              <ToggleButton value="cards">
                <GridViewIcon sx={{ fontSize: 14, mr: 0.5 }} /> Cards
              </ToggleButton>
              <ToggleButton value="table">
                <ViewListIcon sx={{ fontSize: 14, mr: 0.5 }} /> Table
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              sx={{
                textTransform: "none",
                background: hubTokens.primary,
                fontWeight: 600,
                fontSize: 13,
                "&:hover": { background: hubTokens.primaryHover },
              }}
              onClick={() => setNewEntryOpen(true)}
            >
              New entry
            </Button>
          </Stack>
        }
      />

      <MaterialHubKpiStrip
        counts={counts}
        settlementDueAmount={settlementDueAmount}
        debt={debt}
        onClickInterSite={() => router.push("/site/materials/inter-site")}
      />

      <AllocationsQueue siteGroupId={siteGroupId} />

      <Box sx={{ mt: 2.5, mb: 1.5 }}>
        <MaterialHubFilterChips
          active={filter}
          onChange={setFilter}
          counts={counts}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : isError ? (
        <Alert severity="error">
          Failed to load threads: {(error as Error)?.message || "Unknown error"}
        </Alert>
      ) : filteredThreads.length === 0 ? (
        <Box
          sx={{
            padding: "40px 20px",
            textAlign: "center",
            background: hubTokens.card,
            border: `1px dashed ${hubTokens.border}`,
            borderRadius: "12px",
          }}
        >
          <Typography sx={{ fontSize: 13, color: hubTokens.muted }}>
            No threads match this filter.
          </Typography>
        </Box>
      ) : layout === "table" ? (
        <MaterialHubTable threads={filteredThreads} onAction={handleAction} />
      ) : (
        <Stack spacing={1.25}>
          {filteredThreads.map((t) => (
            <MaterialThreadRow
              key={t.source_row_id}
              thread={t}
              selected={expandedId === t.source_row_id}
              onSelect={() =>
                setExpandedId(expandedId === t.source_row_id ? null : t.source_row_id)
              }
              onAction={handleAction}
            />
          ))}
        </Stack>
      )}

      <HubDialogRouter
        ref={dialogRouterRef}
        siteId={siteId ?? ""}
        siteGroupId={siteGroupId}
        materialRequestById={materialRequestById}
        purchaseOrderById={purchaseOrderById}
      />

      <NewEntryMenu
        open={newEntryOpen}
        onClose={() => setNewEntryOpen(false)}
        onBackfill={() => setBackfillPicker(true)}
      />

      <BackfillEntryDialog
        open={backfillPicker}
        onClose={() => setBackfillPicker(false)}
        onChoose={(m) => {
          setBackfillPicker(false);
          setBackfillMethod(m);
        }}
      />

      <BackfillManualDialog
        open={backfillMethod === "manual"}
        onClose={() => setBackfillMethod(null)}
        siteId={siteId}
        siteName={selectedSite?.name}
      />

      <BackfillAIDialog
        open={backfillMethod === "ai"}
        onClose={() => setBackfillMethod(null)}
        siteId={siteId}
        siteName={selectedSite?.name}
      />
    </Box>
  );
}