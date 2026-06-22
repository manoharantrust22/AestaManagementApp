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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
  useMediaQuery,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import { useSelectedSite } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import { useMaterialThreads } from "@/hooks/queries/useMaterialThreads";
import { usePushSelfUseExpense } from "@/hooks/queries/useBatchUsage";
import { inr } from "@/lib/material-hub/formatters";
import MaterialHubKpiStrip from "@/components/material-hub/MaterialHubKpiStrip";
import MaterialHubStageStepper from "@/components/material-hub/MaterialHubStageStepper";
import MaterialHubSearchFilter from "@/components/material-hub/MaterialHubSearchFilter";
import DateRangePicker from "@/components/common/DateRangePicker";
import HubFilteredSummary from "@/components/material-hub/HubFilteredSummary";
import ReconcileUsageDialog from "@/components/material-hub/reconcile/ReconcileUsageDialog";
import {
  collectMaterialOptions,
  matchesMaterial,
  matchesDateRange,
  matchesSearch,
  type MaterialOption,
  type ParentMap,
} from "@/lib/material-hub/threadFilters";
import { useMaterialParentMap } from "@/hooks/queries/useMaterials";
import {
  stageStepCounts,
  threadCurrentStep,
  type StageStepKey,
} from "@/lib/material-hub/stageFilter";
import {
  loadHubFilters,
  saveHubFilters,
  type HubKindFilter,
} from "@/lib/material-hub/hubFilterStorage";
import MaterialThreadRow from "@/components/material-hub/MaterialThreadRow";
import MaterialThreadDetailSheet from "@/components/material-hub/MaterialThreadDetailSheet";
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
  type InterSiteDebt,
} from "@/lib/material-hub/nextAction";
import {
  useInterSiteBalances,
  useUnpaidInterSiteSettlements,
} from "@/hooks/queries/useInterSiteSettlements";
import {
  legsFromBalances,
  legsFromUnpaidSettlements,
  summarizeOutstanding,
} from "@/lib/material-hub/interSiteOutstanding";
import { hubTokens, HUB_BREAKPOINT_PX } from "@/lib/material-hub/tokens";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

type HubLayout = "cards" | "table";

export default function MaterialHubPage() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;
  const siteGroupId = selectedSite?.site_group_id ?? null;

  const [stageStep, setStageStep] = useState<StageStepKey | null>(null);
  const [kindFilter, setKindFilter] = useState<HubKindFilter>("all");
  const [selectedFilter, setSelectedFilter] = useState<MaterialOption | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [dateStart, setDateStart] = useState<Date | null>(null);
  const [dateEnd, setDateEnd] = useState<Date | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [layout, setLayout] = useState<HubLayout>("cards");

  // Filters survive a page refresh: restore the per-site sessionStorage
  // snapshot once per site, then write-through on every filter change. The
  // restore must run before the first save so the defaults don't clobber a
  // stored snapshot.
  const restoredForSiteRef = useRef<string | null>(null);
  // The restore + save effects run in the same commit on a site switch; this
  // flag keeps that commit's save from writing the OLD site's filter values
  // under the NEW site's key before the restored state has landed.
  const skipNextSaveRef = useRef(false);
  useEffect(() => {
    if (!siteId || restoredForSiteRef.current === siteId) return;
    restoredForSiteRef.current = siteId;
    skipNextSaveRef.current = true;
    const saved = loadHubFilters(siteId);
    if (!saved) {
      // Site switch with nothing saved → reset to defaults so the previous
      // site's filters don't leak across.
      setStageStep(null);
      setKindFilter("all");
      setSelectedFilter(null);
      setSearch("");
      setDateStart(null);
      setDateEnd(null);
      return;
    }
    setStageStep(saved.stageStep);
    setKindFilter(saved.kindFilter);
    setSelectedFilter(saved.selectedFilter);
    setSearch(saved.search ?? "");
    setDateStart(saved.dateStart ? new Date(saved.dateStart) : null);
    setDateEnd(saved.dateEnd ? new Date(saved.dateEnd) : null);
    setLayout(saved.layout);
  }, [siteId]);
  useEffect(() => {
    if (!siteId || restoredForSiteRef.current !== siteId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveHubFilters(siteId, {
      stageStep,
      kindFilter,
      selectedFilter,
      search,
      dateStart: dateStart?.toISOString() ?? null,
      dateEnd: dateEnd?.toISOString() ?? null,
      layout,
    });
  }, [
    siteId,
    stageStep,
    kindFilter,
    selectedFilter,
    search,
    dateStart,
    dateEnd,
    layout,
  ]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [backfillPicker, setBackfillPicker] = useState(false);
  const [backfillMethod, setBackfillMethod] = useState<BackfillMethod | null>(null);

  const {
    threads,
    isLoading,
    isFetching,
    isError,
    materialRequestById,
    refetch,
  } = useMaterialThreads(siteId, siteGroupId);

  // Transparent auto-retry. When a composed query errors (almost always the
  // heavy PO fetch stalling on the proxy — the DB returns in <1ms), keep the
  // page populated and quietly refetch with capped backoff instead of stranding
  // the user on a full-screen error that only a manual browser refresh clears.
  // Since the connection pool is healthy in this failure mode, a plain refetch
  // lands on a fresh request and succeeds — exactly what hitting refresh did,
  // now automatic. The heartbeat caps at 15s so it self-heals whenever the
  // network recovers (Gmail-style), without hammering.
  const [autoRetryTick, setAutoRetryTick] = useState(0);
  useEffect(() => {
    if (!isError) {
      if (autoRetryTick !== 0) setAutoRetryTick(0);
      return;
    }
    // A fetch is already in flight — wait for it to settle before scheduling.
    if (isFetching) return;
    const delay = Math.min(2000 * 2 ** Math.min(autoRetryTick, 3), 15000);
    const t = setTimeout(() => {
      setAutoRetryTick((n) => n + 1);
      refetch();
    }, delay);
    return () => clearTimeout(t);
  }, [isError, isFetching, autoRetryTick, refetch]);

  const dialogRouterRef = useRef<HubDialogRouterHandle>(null);

  const pushSelfUse = usePushSelfUseExpense();
  const [pushSnack, setPushSnack] = useState<
    { severity: "success" | "error"; message: string; ref?: string } | null
  >(null);

  const handleAction = (thread: MaterialThread) => {
    // Dispatch off the SAME resolver that renders the row button's label
    // (nextAction), so the action can never diverge from what the button says.
    // A thread can satisfy several action conditions at once — e.g. a group
    // batch whose DELIVERED portion is fully self-used (`is_group_self_used`,
    // invRemaining <= 0) while more is still undelivered (`stage === "ordered"`,
    // so the button reads "Record next delivery"). nextAction's priority order
    // is the single source of truth for which verb wins; re-deriving the action
    // here with independent guards (as before) fired "Push to expense" on that
    // thread and the RPC rejected it ("isn't eligible to post as a self-use
    // expense yet…"), instead of opening the delivery dialog the button promised.
    const next = nextAction(thread);
    if (!next) return;

    // Inter-site steps (raise/settle/pay) live on a separate page, not a dialog.
    if (next.verb === "Record payment" || next.verb === "Settle inter-site") {
      // Latest inter-site page: net-settle pending usage AND pay raised settlements.
      router.push("/site/materials/inter-site");
      return;
    }

    // Group batch fully self-used but not yet posted to all-site expenses →
    // the row's "Push to expense" action. Post it here (the deliberate
    // replacement for the dropped silent auto-trigger), then surface a snackbar
    // with a "View" deep-link into the filtered expenses ledger.
    if (next.verb === "Push to expense") {
      const batchRef =
        thread.inventory?.batch && thread.inventory.batch !== "—"
          ? thread.inventory.batch
          : undefined;
      if (batchRef && siteId && !pushSelfUse.isPending) {
        pushSelfUse.mutate(
          { batchRefCode: batchRef, siteId },
          {
            onSuccess: (row) =>
              setPushSnack({
                severity: "success",
                message: `Posted ${inr(row.amount)} to material expenses`,
                ref: row.ref_code,
              }),
            onError: (e) =>
              setPushSnack({
                severity: "error",
                message:
                  (e as Error)?.message ?? "Couldn't post — please try again.",
              }),
          }
        );
      }
      return;
    }

    // Everything else (approve / create-PO / record-delivery / settle / log-usage
    // / finalize-spot) opens an existing dialog via the router.
    dialogRouterRef.current?.openForThread(thread);
  };

  const counts = useMemo(() => threadCounts(threads), [threads]);
  // Inter-site net (KPI) — sourced from the settlement engine's real tables:
  // not-yet-raised pending balances PLUS raised-but-unpaid settlements. The old
  // thread projection (interSiteDebt) only covered spot purchases, so it read
  // ~₹0 for standard group POs — and any pending-only source zeroes out the
  // moment a settlement is generated. This stays honest through both states.
  const { data: kpiBalances = [] } = useInterSiteBalances(siteGroupId ?? undefined);
  const { data: kpiUnpaidLegs = [] } = useUnpaidInterSiteSettlements(
    siteGroupId ?? undefined
  );
  const debt = useMemo<InterSiteDebt>(() => {
    const legs = [
      ...legsFromBalances(kpiBalances),
      ...legsFromUnpaidSettlements(kpiUnpaidLegs),
    ];
    const sum = summarizeOutstanding(legs, { viewerSiteId: siteId ?? undefined });
    return { iOwe: sum.iOwe, othersOwe: sum.othersOwe, net: sum.net, detail: [] };
  }, [kpiBalances, kpiUnpaidLegs, siteId]);

  const { data: parentMap } = useMaterialParentMap();
  const emptyParentMap = useMemo<ParentMap>(() => new Map(), []);
  const resolvedParentMap = parentMap ?? emptyParentMap;

  const materialOptions = useMemo(
    () => collectMaterialOptions(threads, resolvedParentMap),
    [threads, resolvedParentMap]
  );

  const clearFilters = () => {
    setStageStep(null);
    setKindFilter("all");
    setSelectedFilter(null);
    setSearch("");
    setDateStart(null);
    setDateEnd(null);
  };

  const hasActiveFilters =
    stageStep !== null ||
    kindFilter !== "all" ||
    !!selectedFilter ||
    !!search.trim() ||
    (!!dateStart && !!dateEnd);

  const settlementDueAmount = useMemo(
    () =>
      threads
        .filter(
          (t) => t.stage === "delivered" && t.settlement?.status !== "settled"
        )
        .reduce((sum, t) => sum + (t.po?.amount ?? 0), 0),
    [threads]
  );

  // Threads filtered by everything EXCEPT the stage step. Drives both the stage
  // counts (so each step badge reflects the active kind / material / search /
  // date) and the final list (then narrowed by the selected step). Keeping these
  // off one shared list means a badge count always equals what clicking it shows.
  const preStageThreads = useMemo(() => {
    let list = threads;
    if (kindFilter !== "all") list = list.filter((t) => t.kind === kindFilter);
    list = list.filter((t) => matchesMaterial(t, selectedFilter, resolvedParentMap));
    list = list.filter((t) => matchesSearch(t, search));
    list = list.filter((t) => matchesDateRange(t, dateStart, dateEnd));
    return list;
  }, [threads, kindFilter, selectedFilter, search, resolvedParentMap, dateStart, dateEnd]);

  const stageCounts = useMemo(
    () => stageStepCounts(preStageThreads),
    [preStageThreads]
  );

  const filteredThreads = useMemo(
    () =>
      stageStep
        ? preStageThreads.filter((t) => threadCurrentStep(t) === stageStep)
        : preStageThreads,
    [preStageThreads, stageStep]
  );

  const isMobile = useMediaQuery(`(max-width:${HUB_BREAKPOINT_PX - 1}px)`);

  const expandedThread = useMemo(
    () => filteredThreads.find((t) => t.source_row_id === expandedId) ?? null,
    [filteredThreads, expandedId]
  );

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

      <Box
        sx={{
          mt: 2.5,
          mb: 1.5,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          columnGap: 2,
          rowGap: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: { xs: "100%", md: 380 } }}>
          <MaterialHubStageStepper
            counts={stageCounts}
            selected={stageStep}
            onSelect={setStageStep}
          />
        </Box>

        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ ml: { md: "auto" }, flexShrink: 0 }}
        >
          <MaterialHubSearchFilter
            materialOptions={materialOptions}
            selected={selectedFilter}
            onSelectedChange={setSelectedFilter}
            search={search}
            onSearchChange={setSearch}
          />
          <ToggleButtonGroup
            value={kindFilter}
            exclusive
            onChange={(_, v) => v && setKindFilter(v as HubKindFilter)}
            size="small"
            aria-label="Own / Group filter"
            sx={{
              background: hubTokens.card,
              "& .MuiToggleButton-root": {
                border: `1px solid ${hubTokens.border}`,
                textTransform: "none",
                fontSize: 12,
                padding: "4px 10px",
                color: hubTokens.muted,
                "&.Mui-selected": {
                  background: hubTokens.primary,
                  color: "#fff",
                  "&:hover": { background: hubTokens.primaryHover },
                },
              },
            }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="own">Own</ToggleButton>
            <ToggleButton value="group">Group</ToggleButton>
          </ToggleButtonGroup>
          <DateRangePicker
            standalone
            compact
            startDate={dateStart}
            endDate={dateEnd}
            onChange={(s, e) => {
              setDateStart(s);
              setDateEnd(e);
            }}
          />
          {hasActiveFilters && (
            <Button
              size="small"
              onClick={clearFilters}
              sx={{
                textTransform: "none",
                color: hubTokens.muted,
                fontSize: 12.5,
                minWidth: 0,
              }}
            >
              Clear
            </Button>
          )}
        </Stack>
      </Box>

      {selectedFilter && (
        <HubFilteredSummary
          threads={filteredThreads}
          materialLabel={selectedFilter.label}
          viewingSiteName={selectedSite.name}
          viewingSiteId={siteId ?? undefined}
          siteGroupId={siteGroupId}
          materialId={selectedFilter.id}
          filterKind={selectedFilter.kind}
          onReconcile={
            selectedFilter.kind !== "brand" && siteGroupId
              ? () => setReconcileOpen(true)
              : undefined
          }
        />
      )}

      {selectedFilter && selectedFilter.kind !== "brand" && siteId && (
        <ReconcileUsageDialog
          open={reconcileOpen}
          onClose={() => setReconcileOpen(false)}
          siteId={siteId}
          siteGroupId={siteGroupId}
          materialId={selectedFilter.id}
          materialName={selectedFilter.label}
          materialUnit={filteredThreads[0]?.material_unit}
        />
      )}

      {threads.length > 0 ? (
        // We have data — ALWAYS show it. A failed background refresh (the heavy
        // PO fetch stalling on the proxy) must never wipe the page back to an
        // error screen that only a manual reload clears. Surface a quiet,
        // non-blocking "reconnecting" hint instead; auto-retry refreshes it.
        <>
          {isError && (
            <Box sx={{ mb: 1.5 }}>
              <Alert
                severity="warning"
                icon={<CircularProgress size={16} />}
                sx={{ alignItems: "center", py: 0.25 }}
                action={
                  <Button color="inherit" size="small" onClick={() => refetch()}>
                    Retry now
                  </Button>
                }
              >
                Showing saved data — reconnecting…
              </Alert>
            </Box>
          )}
          {filteredThreads.length === 0 ? (
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
        </>
      ) : isLoading || isFetching ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : isError ? (
        // Cold load with no cached data AND the fetch failed. Don't demand a
        // browser refresh — keep auto-retrying (the effect above) and offer a
        // manual nudge. The connection pool is healthy in this failure mode, so
        // a retry usually lands within seconds.
        <Box
          sx={{
            padding: "40px 20px",
            textAlign: "center",
            background: hubTokens.card,
            border: `1px dashed ${hubTokens.border}`,
            borderRadius: "12px",
          }}
        >
          <CircularProgress size={22} sx={{ mb: 1.5 }} />
          <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>
            Taking longer than usual…
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: hubTokens.muted, mb: 2 }}>
            The connection is slow right now. Retrying automatically — no need to
            refresh the page.
          </Typography>
          <Button variant="outlined" size="small" onClick={() => refetch()}>
            Retry now
          </Button>
        </Box>
      ) : (
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
            No material threads yet.
          </Typography>
        </Box>
      )}

      <HubDialogRouter
        ref={dialogRouterRef}
        siteId={siteId ?? ""}
        siteGroupId={siteGroupId}
        materialRequestById={materialRequestById}
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

      <Snackbar
        open={!!pushSnack}
        autoHideDuration={6000}
        onClose={() => setPushSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={pushSnack?.severity ?? "success"}
          variant="filled"
          onClose={() => setPushSnack(null)}
          action={
            pushSnack?.ref ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  router.push(
                    `/site/expenses?c_ref=${encodeURIComponent(pushSnack.ref!)}`
                  );
                  setPushSnack(null);
                }}
              >
                View
              </Button>
            ) : undefined
          }
        >
          {pushSnack?.message}
        </Alert>
      </Snackbar>

      <MaterialThreadDetailSheet
        open={isMobile && !!expandedThread}
        thread={expandedThread}
        onClose={() => setExpandedId(null)}
      />
    </Box>
  );
}