"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Snackbar,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from "@mui/icons-material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import PageHeader from "@/components/layout/PageHeader";
import ScopeChip from "@/components/common/ScopeChip";
import PendingBanner from "@/components/payments/PendingBanner";
import { SalarySliceHero } from "@/components/payments/SalarySliceHero";
import { SalaryWaterfallList } from "@/components/payments/SalaryWaterfallList";
import { AdvancesList } from "@/components/payments/AdvancesList";
import { DailyMarketLedger } from "@/components/payments/DailyMarketLedger";
import PaymentsLedger from "@/components/payments/PaymentsLedger";
import { MestriSettleDialog } from "@/components/payments/MestriSettleDialog";
import PaymentDialog from "@/components/payments/PaymentDialog";
import SettlementRefDetailDialog from "@/components/payments/SettlementRefDetailDialog";
import { SettlementsList } from "@/components/payments/SettlementsList";
import { usePaymentSummary } from "@/hooks/queries/usePaymentSummary";
import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";
import { useSalarySliceSummary } from "@/hooks/queries/useSalarySliceSummary";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
import { useAdvances } from "@/hooks/queries/useAdvances";
import { useDayPendingRecords } from "@/hooks/queries/useDayPendingRecords";
import { useSettlementsList } from "@/hooks/queries/useSettlementsList";
import { useInspectPane } from "@/hooks/useInspectPane";
import { InspectPane } from "@/components/common/InspectPane";
import type { InspectEntity } from "@/components/common/InspectPane";

type ActiveTab = "all" | "contract" | "daily-market";
type ViewMode = "default" | "by-settlement";

export default function PaymentsContent() {
  const { selectedSite } = useSelectedSite();
  const { formatForApi, isAllTime } = useDateRange();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { dateFrom, dateTo } = formatForApi();
  const effectiveFrom = isAllTime ? null : dateFrom;
  const effectiveTo = isAllTime ? null : dateTo;

  const highlightRef = searchParams.get("ref");

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("contract");
  // Per-tab view mode. "default" is the existing waterfall (Contract) /
  // ledger (Daily+Market, All) view; "by-settlement" shows a flat
  // chronological list of settlement_groups rows for verification.
  const [viewModes, setViewModes] = useState<Record<ActiveTab, ViewMode>>({
    contract: "default",
    "daily-market": "default",
    all: "default",
  });
  const viewMode = viewModes[activeTab];
  const setViewMode = (next: ViewMode) =>
    setViewModes((prev) => ({ ...prev, [activeTab]: next }));
  // SET-XXX detail dialog opened from a row click in the by-settlement view.
  const [refDetail, setRefDetail] = useState<string | null>(null);
  const [settleDialog, setSettleDialog] = useState<null | {
    weekStart: string;
    weekEnd: string;
    suggestedAmount: number;
  }>(null);
  // Date-only ledger entry (not bound to a week). The user picks any date
  // in the dialog; the waterfall RPC handles allocation downstream.
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  // In-page settle dialog for a single Daily+Market date. Holds the date so
  // the records hook can fetch its pending entries; null = closed.
  const [dayDialog, setDayDialog] = useState<null | { date: string }>(null);

  const pane = useInspectPane();
  const queryClient = useQueryClient();

  const dayPendingQuery = useDayPendingRecords(
    dayDialog ? selectedSite?.id : undefined,
    dayDialog?.date
  );

  // Subcontract scoping picker isn't surfaced on this page yet — the page
  // operates against all subcontracts on the site, and the RPCs treat null
  // as "aggregate across all subcontracts".
  const selectedSubcontractId: string | null = null;

  const summaryQuery = usePaymentSummary(
    selectedSite?.id,
    effectiveFrom,
    effectiveTo
  );

  const salarySummaryQuery = useSalarySliceSummary({
    siteId: selectedSite?.id,
    subcontractId: selectedSubcontractId,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
  });

  const waterfallQuery = useSalaryWaterfall({
    siteId: selectedSite?.id,
    subcontractId: selectedSubcontractId,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
  });

  const advancesQuery = useAdvances({
    siteId: selectedSite?.id,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
  });

  const dailyMarketLedgerQuery = usePaymentsLedger({
    siteId: selectedSite?.id,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    status: "all",
    type: "daily-market",
  });

  const allLedgerQuery = usePaymentsLedger({
    siteId: selectedSite?.id,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    status: "all",
    type: "all",
  });

  // Chronological flat list of settlement_groups. Filter follows the active
  // tab. Only fetched when the user actually toggles to "by-settlement" so
  // we don't pay for it on every page load.
  const settlementsListQuery = useSettlementsList({
    siteId: selectedSite?.id,
    filter:
      activeTab === "contract"
        ? "contract"
        : activeTab === "daily-market"
          ? "daily-market"
          : "all",
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
  });

  const pendingDailyMarketCount = (dailyMarketLedgerQuery.data ?? []).filter(
    (r) => r.isPending
  ).length;

  const handleSettleClick = useCallback(
    (entity: InspectEntity) => {
      // weekly-aggregate: open the in-page MestriSettleDialog scoped to that week.
      if (entity.kind === "weekly-aggregate") {
        const week = waterfallQuery.data?.find(
          (w) => w.weekStart === entity.weekStart
        );
        const suggestedAmount = week
          ? Math.max(0, week.wagesDue - week.paid)
          : 0;
        setSettleDialog({
          weekStart: entity.weekStart,
          weekEnd: entity.weekEnd,
          suggestedAmount,
        });
        return;
      }
      // daily-date: open the in-page PaymentDialog. The date's per-laborer
      // pending records are fetched by useDayPendingRecords keyed off
      // dayDialog.date and fed into the dialog's `dailyRecords` mode.
      if (entity.kind === "daily-date") {
        pane.close();
        setDayDialog({ date: entity.date });
        return;
      }
      // weekly-week (per-laborer-week): currently no pending entries are
      // surfaced for this kind in production data, so the redirect path is
      // preserved as a safety net. If get_payments_ledger ever starts
      // streaming pending laborer-weeks, build a sibling
      // useWeekPendingRecords hook + reuse PaymentDialog the same way.
      const url =
        entity.kind === "weekly-week"
          ? `/site/attendance?weekStart=${entity.weekStart}&laborerId=${entity.laborerId}`
          : "/site/attendance";
      setNotice("Opening attendance to record this settlement…");
      router.push(url);
    },
    [router, waterfallQuery.data, pane]
  );

  const handleOpenInPage = useCallback(
    (entity: InspectEntity) => {
      const url =
        entity.kind === "daily-date"
          ? `/site/attendance?date=${entity.date}`
          : entity.kind === "weekly-week"
            ? `/site/attendance?weekStart=${entity.weekStart}&laborerId=${entity.laborerId}`
            : "/site/attendance";
      router.push(url);
    },
    [router]
  );

  if (!selectedSite) {
    return (
      <Box>
        <PageHeader title="Salary Settlements" titleChip={<ScopeChip />} />
        <Alert severity="info">
          Please select a site from the dropdown to view salary settlements.
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        ...(isFullscreen && {
          position: "fixed",
          inset: 0,
          zIndex: 1300,
          height: "100vh",
          bgcolor: "background.default",
        }),
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <PageHeader
          title="Salary Settlements"
          titleChip={<ScopeChip />}
          actions={
            <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              <IconButton
                onClick={() => setIsFullscreen((v) => !v)}
                size="small"
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          }
        />

        <SalarySliceHero
          summary={salarySummaryQuery.data}
          isLoading={salarySummaryQuery.isLoading}
        />

        <PendingBanner
          pendingAmount={summaryQuery.data?.pendingAmount ?? 0}
          pendingDatesCount={summaryQuery.data?.pendingDatesCount ?? 0}
        />

        {highlightRef && (
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              borderBottom: 1,
              borderColor: "divider",
              fontSize: 12,
              color: "text.secondary",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            Highlighting: {highlightRef}
          </Box>
        )}
      </Box>

      <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v as ActiveTab)}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              fontSize: 12.5,
              fontWeight: 600,
              textTransform: "none",
            },
          }}
        >
          <Tab
            value="contract"
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <span>💼</span>
                <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                  Contract Settlement
                </Box>
                <Chip
                  size="small"
                  label={
                    (waterfallQuery.data?.length ?? 0) +
                    (advancesQuery.data?.length ?? 0)
                  }
                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                />
              </Box>
            }
          />
          <Tab
            value="daily-market"
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <span>📅</span>
                <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                  Daily + Market
                </Box>
                <Chip
                  size="small"
                  color={pendingDailyMarketCount > 0 ? "warning" : "default"}
                  label={pendingDailyMarketCount}
                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                />
              </Box>
            }
          />
          <Tab
            value="all"
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <span>📋</span>
                <Box sx={{ display: { xs: "none", sm: "inline" } }}>All</Box>
                <Chip
                  size="small"
                  label={allLedgerQuery.data?.length ?? 0}
                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                />
              </Box>
            }
          />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {(salarySummaryQuery.isError || waterfallQuery.isError || advancesQuery.isError) &&
          activeTab === "contract" && (
            <Alert severity="error" sx={{ m: 1.5 }}>
              Couldn&apos;t load contract settlement data.
            </Alert>
          )}
        {dailyMarketLedgerQuery.isError && activeTab === "daily-market" && (
          <Alert severity="error" sx={{ m: 1.5 }}>
            Couldn&apos;t load daily/market ledger:{" "}
            {(dailyMarketLedgerQuery.error as Error)?.message ?? "Unknown error"}
          </Alert>
        )}
        {allLedgerQuery.isError && activeTab === "all" && (
          <Alert severity="error" sx={{ m: 1.5 }}>
            Couldn&apos;t load unified ledger:{" "}
            {(allLedgerQuery.error as Error)?.message ?? "Unknown error"}
          </Alert>
        )}

        {activeTab === "contract" && (
          <Box>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 1,
                borderBottom: 1,
                borderColor: "divider",
                flexWrap: "wrap",
              }}
            >
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                size="small"
                onChange={(_, v) => v && setViewMode(v as ViewMode)}
                aria-label="View mode"
                sx={{
                  "& .MuiToggleButton-root": {
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "none",
                    py: 0.25,
                    px: 1.25,
                  },
                }}
              >
                <ToggleButton value="default" aria-label="Weekly waterfall">
                  📊 Weekly waterfall
                </ToggleButton>
                <ToggleButton value="by-settlement" aria-label="By settlement">
                  📜 By settlement
                </ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setRecordPaymentOpen(true)}
              >
                Record mesthri payment
              </Button>
            </Box>
            {viewMode === "default" ? (
              <>
                <SalaryWaterfallList
                  weeks={waterfallQuery.data ?? []}
                  futureCredit={salarySummaryQuery.data?.futureCredit ?? 0}
                  isLoading={waterfallQuery.isLoading}
                  onRowClick={(week) => {
                    pane.open({
                      kind: "weekly-aggregate",
                      siteId: selectedSite.id,
                      subcontractId: selectedSubcontractId,
                      weekStart: week.weekStart,
                      weekEnd: week.weekEnd,
                      scopeFrom: effectiveFrom,
                      scopeTo: effectiveTo,
                    });
                  }}
                  onSettleClick={(week) => {
                    setSettleDialog({
                      weekStart: week.weekStart,
                      weekEnd: week.weekEnd,
                      suggestedAmount: Math.max(0, week.wagesDue - week.paid),
                    });
                  }}
                />
                {(advancesQuery.data?.length ?? 0) > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <AdvancesList
                      advances={advancesQuery.data ?? []}
                      isLoading={advancesQuery.isLoading}
                      onRowClick={(adv) => {
                        pane.open({
                          kind: "advance",
                          siteId: selectedSite.id,
                          settlementId: adv.id,
                          settlementRef: adv.settlementRef,
                        });
                      }}
                    />
                  </Box>
                )}
              </>
            ) : (
              <SettlementsList
                rows={settlementsListQuery.data ?? []}
                isLoading={settlementsListQuery.isLoading}
                onRowClick={(row) => setRefDetail(row.ref)}
                emptyMessage="No contract settlements recorded for this period."
              />
            )}
          </Box>
        )}

        {activeTab === "daily-market" && (
          <Box>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                justifyContent: "flex-start",
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                size="small"
                onChange={(_, v) => v && setViewMode(v as ViewMode)}
                aria-label="View mode"
                sx={{
                  "& .MuiToggleButton-root": {
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "none",
                    py: 0.25,
                    px: 1.25,
                  },
                }}
              >
                <ToggleButton value="default" aria-label="By date">
                  📅 By date
                </ToggleButton>
                <ToggleButton value="by-settlement" aria-label="By settlement">
                  📜 By settlement
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {viewMode === "default" ? (
              <DailyMarketLedger
                rows={dailyMarketLedgerQuery.data ?? []}
                isLoading={dailyMarketLedgerQuery.isLoading}
                onRowClick={(row) => {
                  pane.open({
                    kind: "daily-date",
                    siteId: selectedSite.id,
                    date: row.date,
                    settlementRef: row.settlementRef,
                  });
                }}
                onSettleClick={(row) =>
                  handleSettleClick({
                    kind: "daily-date",
                    siteId: selectedSite.id,
                    date: row.date,
                    settlementRef: row.settlementRef,
                  })
                }
              />
            ) : (
              <SettlementsList
                rows={settlementsListQuery.data ?? []}
                isLoading={settlementsListQuery.isLoading}
                onRowClick={(row) => setRefDetail(row.ref)}
                emptyMessage="No daily/market settlements recorded for this period."
              />
            )}
          </Box>
        )}

        {activeTab === "all" && (
          <Box>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                justifyContent: "flex-start",
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                size="small"
                onChange={(_, v) => v && setViewMode(v as ViewMode)}
                aria-label="View mode"
                sx={{
                  "& .MuiToggleButton-root": {
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "none",
                    py: 0.25,
                    px: 1.25,
                  },
                }}
              >
                <ToggleButton value="default" aria-label="Unified ledger">
                  📋 Unified ledger
                </ToggleButton>
                <ToggleButton value="by-settlement" aria-label="By settlement">
                  📜 By settlement
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {viewMode === "default" ? (
              <PaymentsLedger
                rows={allLedgerQuery.data ?? []}
                isLoading={allLedgerQuery.isLoading}
                selectedEntity={pane.currentEntity}
                onRowClick={(entity) => pane.open(entity)}
                onSettleClick={(entity) => handleSettleClick(entity)}
              />
            ) : (
              <SettlementsList
                rows={settlementsListQuery.data ?? []}
                isLoading={settlementsListQuery.isLoading}
                onRowClick={(row) => setRefDetail(row.ref)}
                emptyMessage="No settlements recorded for this period."
              />
            )}
          </Box>
        )}
      </Box>

      {settleDialog && (
        <MestriSettleDialog
          open
          onClose={() => setSettleDialog(null)}
          siteId={selectedSite.id}
          mode="fill-week"
          weekStart={settleDialog.weekStart}
          weekEnd={settleDialog.weekEnd}
          suggestedAmount={settleDialog.suggestedAmount}
          initialSubcontractId={selectedSubcontractId}
        />
      )}

      {recordPaymentOpen && (
        <MestriSettleDialog
          open
          onClose={() => setRecordPaymentOpen(false)}
          siteId={selectedSite.id}
          mode="date-only"
          initialSubcontractId={selectedSubcontractId}
        />
      )}

      <SettlementRefDetailDialog
        open={refDetail !== null}
        settlementReference={refDetail}
        onClose={() => setRefDetail(null)}
      />


      {dayDialog && (
        <PaymentDialog
          open
          onClose={() => setDayDialog(null)}
          dailyRecords={dayPendingQuery.data ?? []}
          allowSubcontractLink
          onSuccess={() => {
            setDayDialog(null);
            void queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
            void queryClient.invalidateQueries({ queryKey: ["salary-slice-summary"] });
            void queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
            void queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
          }}
        />
      )}

      <InspectPane
        entity={pane.currentEntity}
        isOpen={pane.isOpen}
        isPinned={pane.isPinned}
        activeTab={pane.activeTab}
        onTabChange={pane.setActiveTab}
        onClose={pane.close}
        onTogglePin={pane.togglePin}
        onOpenInPage={handleOpenInPage}
        onSettleClick={handleSettleClick}
      />

      <Snackbar
        open={!!notice}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
