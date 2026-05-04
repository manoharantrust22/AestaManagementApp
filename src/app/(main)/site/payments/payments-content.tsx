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
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import type { DateWiseSettlement } from "@/types/payment.types";
import PageHeader from "@/components/layout/PageHeader";
import ScopeChip from "@/components/common/ScopeChip";
import UnsettledBanner from "@/components/payments/UnsettledBanner";
import { SalarySliceHero } from "@/components/payments/SalarySliceHero";
import { DailyMarketHero } from "@/components/payments/DailyMarketHero";
import { AllSettlementsHero } from "@/components/payments/AllSettlementsHero";
import { SalaryWaterfallList } from "@/components/payments/SalaryWaterfallList";
import { AdvancesList } from "@/components/payments/AdvancesList";
import { DailyMarketLedger } from "@/components/payments/DailyMarketLedger";
import { DailyMarketWeeklyList } from "@/components/payments/DailyMarketWeeklyList";
import PaymentsLedger from "@/components/payments/PaymentsLedger";
import { MestriSettleDialog } from "@/components/payments/MestriSettleDialog";
import PaymentDialog from "@/components/payments/PaymentDialog";
import SettlementRefDetailDialog, {
  type SettlementDetails,
} from "@/components/payments/SettlementRefDetailDialog";
import { SettlementsList } from "@/components/payments/SettlementsList";
import ContractSettlementEditDialog from "@/components/payments/ContractSettlementEditDialog";
import DeleteContractSettlementDialog from "@/components/payments/DeleteContractSettlementDialog";
import DailySettlementEditDialog from "@/components/payments/DailySettlementEditDialog";
import DeleteDailySettlementDialog from "@/components/payments/DeleteDailySettlementDialog";
import { usePaymentSummary } from "@/hooks/queries/usePaymentSummary";
import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";
import { useDailyMarketWeeklyList } from "@/hooks/queries/useDailyMarketWeeklyList";
import { useSalarySliceSummary } from "@/hooks/queries/useSalarySliceSummary";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
import { useAdvances } from "@/hooks/queries/useAdvances";
import { useDayPendingRecords } from "@/hooks/queries/useDayPendingRecords";
import { useSettlementsList } from "@/hooks/queries/useSettlementsList";
import { useInspectPane } from "@/hooks/useInspectPane";
import { InspectPane } from "@/components/common/InspectPane";
import type { InspectEntity } from "@/components/common/InspectPane";
import { useSiteAuditState } from "@/hooks/queries/useSiteAuditState";
import { LegacyAuditBanner, LegacyBand, ReconcileDialog } from "@/components/audit";

type ActiveTab = "all" | "contract" | "daily-market";
// "default"        — natural default for each tab (waterfall for contract,
//                    by-week for daily-market, unified ledger for all).
// "by-settlement"  — flat chronological settlement_groups list.
// "by-week"        — daily-market only: weekly waterfall mirroring the
//                    contract experience but with per-date settlement
//                    granularity.
// "by-date"        — daily-market only: legacy flat per-date list.
type ViewMode = "default" | "by-settlement" | "by-week" | "by-date";

/** Adapter: SettlementDetails (loaded by SettlementRefDetailDialog) →
 *  DateWiseSettlement (the legacy shape ContractSettlementEditDialog accepts).
 *  ContractSettlementEditDialog re-fetches its own labor_payments rows from
 *  settlementGroupId, so we can leave the heavier pieces empty.
 */
function settlementDetailsToDateWise(
  d: SettlementDetails
): DateWiseSettlement {
  return {
    settlementGroupId: d.settlementGroupId,
    settlementReference: d.settlementReference,
    settlementDate: d.settlementDate,
    totalAmount: d.totalAmount,
    weekAllocations: d.weekAllocations.map((a) => ({
      weekStart: a.weekStart,
      weekEnd: a.weekEnd,
      // ContractSettlementEditDialog reads weekStart/weekEnd/allocatedAmount;
      // the RPC recomputes everything server-side on amount/type changes, so
      // the rest of WeekAllocationEntry just needs to satisfy the type.
      weekLabel: "",
      allocatedAmount: a.amount,
      laborerCount: 0,
      isFullyPaid: false,
    })),
    paymentMode: (d.paymentMode as DateWiseSettlement["paymentMode"]) ?? null,
    paymentChannel:
      (d.paymentChannel as DateWiseSettlement["paymentChannel"]) ?? "direct",
    payerSource: d.payerSource,
    payerName: d.payerName,
    proofUrls: d.proofUrls,
    notes: d.notes,
    subcontractId: d.subcontractId,
    subcontractTitle: d.subcontractTitle,
    createdBy: d.createdBy ?? "",
    createdByName: d.createdByName,
    createdAt: d.createdAt,
    isCancelled: d.isCancelled,
  };
}

/** Adapter: SettlementDetails → DeleteContractSettlementDialog's local
 *  SettlementRecord shape. The delete dialog renders weekAllocations in the
 *  confirm body, so we forward the freshly-fetched ones from the detail load.
 */
function settlementDetailsToRecord(d: SettlementDetails) {
  return {
    id: d.settlementGroupId,
    settlementReference: d.settlementReference,
    settlementDate: d.settlementDate,
    totalAmount: d.totalAmount,
    paymentMode: d.paymentMode,
    paymentChannel: d.paymentChannel,
    paymentType: d.paymentType,
    payerSource: d.payerSource,
    payerName: d.payerName,
    subcontractId: d.subcontractId,
    subcontractTitle: d.subcontractTitle,
    proofUrl: d.proofUrls[0] ?? null,
    proofUrls: d.proofUrls,
    notes: d.notes,
    createdBy: d.createdByName,
    createdAt: d.createdAt,
    laborerCount: d.laborerCount,
    weekAllocations: d.weekAllocations,
  };
}

/** Bust every cache that surfaces settlement data anywhere on the payments
 *  page after an edit or delete. */
function invalidateSettlementsCaches(
  queryClient: ReturnType<typeof useQueryClient>
) {
  queryClient.invalidateQueries({ queryKey: ["settlements-list"] });
  queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
  queryClient.invalidateQueries({ queryKey: ["salary-slice-summary"] });
  queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
  queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
  queryClient.invalidateQueries({ queryKey: ["advances"] });
}

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
    // Daily + Market lands on the new By-Week view by default — feature
    // parity with Contract Settlement's weekly waterfall, with per-date
    // settlement granularity surfaced via a 7-dot Sun-Sat strip.
    "daily-market": "by-week",
    all: "default",
  });
  const viewMode = viewModes[activeTab];
  const setViewMode = (next: ViewMode) =>
    setViewModes((prev) => ({ ...prev, [activeTab]: next }));
  // SET-XXX detail dialog opened from a row click in the by-settlement view.
  const [refDetail, setRefDetail] = useState<string | null>(null);
  // Edit / Delete targets — populated by the detail dialog's footer buttons.
  // The detail dialog hands back the fully-loaded SettlementDetails, which we
  // pipe straight into the Daily edit/delete dialogs (they accept the same
  // type) and adapt for the Contract edit/delete dialogs (legacy shapes).
  const [editTarget, setEditTarget] = useState<SettlementDetails | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SettlementDetails | null>(
    null
  );
  const { userProfile } = useAuth();
  const canEditSettlements = hasEditPermission(userProfile?.role);
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

  // Per-site audit lifecycle (legacy_status + data_started_at). Drives the
  // LegacyAuditBanner + LegacyBand visibility. Slice 2 minimum: banner +
  // collapsible legacy waterfall above the tabs. Slice 3 will make the
  // existing tab content period-aware (currently 'all', should be 'current'
  // when site is in audit).
  const auditState = useSiteAuditState();
  const [reconcileOpen, setReconcileOpen] = useState(false);

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

  // For sites in audit mode, the existing tab content (Contract waterfall,
  // Daily+Market ledger, All ledger, KPI strip) scopes to 'current' so the
  // pre-cutoff weeks live exclusively in the LegacyBand above. Non-auditing
  // sites use 'all' (a no-op server-side; behaves like before this feature).
  const tabPeriod = auditState.isAuditing ? "current" : "all";

  const summaryQuery = usePaymentSummary(
    selectedSite?.id,
    effectiveFrom,
    effectiveTo,
    tabPeriod
  );

  const salarySummaryQuery = useSalarySliceSummary({
    siteId: selectedSite?.id,
    subcontractId: selectedSubcontractId,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    period: tabPeriod,
  });

  const waterfallQuery = useSalaryWaterfall({
    siteId: selectedSite?.id,
    subcontractId: selectedSubcontractId,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    period: tabPeriod,
  });

  // Legacy-scoped waterfall (only fetched when the site is in audit mode).
  // Drives the LegacyBand body + the Reconcile dialog's pre-flight stats.
  // Date scope intentionally NOT applied here — the legacy band always shows
  // the full pre-cutoff history regardless of the page's date filter.
  const legacyWaterfallQuery = useSalaryWaterfall({
    siteId: auditState.isAuditing ? selectedSite?.id : undefined,
    subcontractId: null,
    dateFrom: null,
    dateTo: null,
    period: "legacy",
  });
  const legacyWeeks = legacyWaterfallQuery.data ?? [];
  const legacyWagesOwed = legacyWeeks.reduce((sum, w) => sum + w.wagesDue, 0);
  const legacyPaid = legacyWeeks.reduce((sum, w) => sum + w.paid, 0);
  const legacyWeeksPending = legacyWeeks.filter(
    (w) => w.status !== "settled"
  ).length;

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
    period: tabPeriod,
  });

  // Client-side weekly roll-up over the same ledger rows. Cheap; no extra
  // round-trip — the underlying usePaymentsLedger query is already cached
  // by the call above with identical args.
  const dailyMarketWeeklyListQuery = useDailyMarketWeeklyList({
    siteId: selectedSite?.id,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    period: tabPeriod,
  });

  const allLedgerQuery = usePaymentsLedger({
    siteId: selectedSite?.id,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    status: "all",
    type: "all",
    period: tabPeriod,
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

  // Contract pending derived from waterfall data: weeks not fully settled and
  // the rupee gap between wages-due and paid for those weeks.
  const contractUnsettledWeeks = (waterfallQuery.data ?? []).filter(
    (w) => w.status !== "settled"
  );
  const contractPendingCount = contractUnsettledWeeks.length;
  const contractPendingAmount = contractUnsettledWeeks.reduce(
    (sum, w) => sum + Math.max(0, w.wagesDue - w.paid),
    0
  );

  // Daily/market pending comes straight from get_payment_summary (which
  // already excludes contract laborers).
  const dailyMarketPendingCount = summaryQuery.data?.pendingDatesCount ?? 0;
  const dailyMarketPendingAmount = summaryQuery.data?.pendingAmount ?? 0;

  const settleDailyMarketInAttendance = useCallback(() => {
    router.push("/site/attendance?focus=pending");
  }, [router]);

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
            : entity.kind === "daily-market-weekly"
              ? `/site/attendance?weekStart=${entity.weekStart}&weekEnd=${entity.weekEnd}`
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
        height: {
          xs: "calc(100vh - 56px - 24px)",
          sm: "calc(100vh - 64px - 32px)",
          md: "calc(100vh - 64px - 48px)",
        },
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
        {auditState.isAuditing && auditState.dataStartedAt && selectedSite && (
          <LegacyAuditBanner
            siteName={selectedSite.name}
            cutoffDate={auditState.dataStartedAt}
            legacyPendingCount={legacyWeeksPending}
          />
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

      {auditState.isAuditing && auditState.dataStartedAt && selectedSite && (
        <Box sx={{ flexShrink: 0, px: 1.5, pt: 1 }}>
          <LegacyBand
            cutoffDate={auditState.dataStartedAt}
            storageKey={`legacy-band:payments:${selectedSite.id}`}
            summary={
              <Box
                component="span"
                sx={{
                  display: "flex",
                  gap: 1.5,
                  alignItems: "center",
                  fontSize: 12,
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>{legacyWeeks.length} {legacyWeeks.length === 1 ? "week" : "weeks"}</span>
                <span aria-hidden>·</span>
                <span>₹{legacyWagesOwed.toLocaleString("en-IN")} owed</span>
                <span aria-hidden>·</span>
                <span>₹{legacyPaid.toLocaleString("en-IN")} paid</span>
              </Box>
            }
            onReconcileClick={canEditSettlements ? () => setReconcileOpen(true) : undefined}
          >
            <SalaryWaterfallList
              weeks={legacyWeeks}
              futureCredit={0}
              isLoading={legacyWaterfallQuery.isLoading}
              onRowClick={(week) => {
                if (!selectedSite) return;
                pane.open({
                  kind: "weekly-aggregate",
                  siteId: selectedSite.id,
                  subcontractId: selectedSubcontractId,
                  weekStart: week.weekStart,
                  weekEnd: week.weekEnd,
                  scopeFrom: null,
                  scopeTo: null,
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
          </LegacyBand>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {(salarySummaryQuery.isError || waterfallQuery.isError || advancesQuery.isError) &&
          activeTab === "contract" && (
            <Alert severity="error" sx={{ m: 1.5, flexShrink: 0 }}>
              Couldn&apos;t load contract settlement data.
            </Alert>
          )}
        {dailyMarketLedgerQuery.isError && activeTab === "daily-market" && (
          <Alert severity="error" sx={{ m: 1.5, flexShrink: 0 }}>
            Couldn&apos;t load daily/market ledger:{" "}
            {(dailyMarketLedgerQuery.error as Error)?.message ?? "Unknown error"}
          </Alert>
        )}
        {allLedgerQuery.isError && activeTab === "all" && (
          <Alert severity="error" sx={{ m: 1.5, flexShrink: 0 }}>
            Couldn&apos;t load unified ledger:{" "}
            {(allLedgerQuery.error as Error)?.message ?? "Unknown error"}
          </Alert>
        )}

        {activeTab === "contract" && (
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {!isFullscreen && (
              <Box sx={{ flexShrink: 0 }}>
                <SalarySliceHero
                  summary={salarySummaryQuery.data}
                  isLoading={salarySummaryQuery.isLoading}
                />
              </Box>
            )}
            <UnsettledBanner
              count={contractPendingCount}
              amount={contractPendingAmount}
              unit="weeks"
            />
            <Box
              sx={{
                px: { xs: 1, sm: 1.5 },
                py: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 0.75,
                borderBottom: 1,
                borderColor: "divider",
                flexWrap: "nowrap",
                flexShrink: 0,
              }}
            >
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                size="small"
                onChange={(_, v) => v && setViewMode(v as ViewMode)}
                aria-label="View mode"
                sx={{
                  flexShrink: 1,
                  minWidth: 0,
                  "& .MuiToggleButton-root": {
                    fontSize: { xs: 10.5, sm: 11 },
                    fontWeight: 600,
                    textTransform: "none",
                    py: 0.25,
                    px: { xs: 0.75, sm: 1.25 },
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <ToggleButton value="default" aria-label="Weekly waterfall">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📊 Weekly
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📊 Weekly waterfall
                  </Box>
                </ToggleButton>
                <ToggleButton value="by-settlement" aria-label="By settlement">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📜 Settled
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📜 By settlement
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setRecordPaymentOpen(true)}
                sx={{
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  px: { xs: 1, sm: 1.5 },
                  fontSize: { xs: 11, sm: 13 },
                  "& .MuiButton-startIcon": {
                    mr: { xs: 0.25, sm: 1 },
                  },
                }}
              >
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                  Record
                </Box>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  Record mesthri payment
                </Box>
              </Button>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
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
          </Box>
        )}

        {activeTab === "daily-market" && (
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <DailyMarketHero
              paidAmount={summaryQuery.data?.dailyMarketAmount ?? 0}
              paidCount={summaryQuery.data?.dailyMarketCount ?? 0}
              pendingAmount={summaryQuery.data?.pendingAmount ?? 0}
              pendingCount={summaryQuery.data?.pendingDatesCount ?? 0}
              isLoading={summaryQuery.isLoading}
            />
            <UnsettledBanner
              count={
                viewMode === "by-week"
                  ? (dailyMarketWeeklyListQuery.data ?? []).filter(
                      (w) => w.pendingDates > 0
                    ).length
                  : dailyMarketPendingCount
              }
              amount={dailyMarketPendingAmount}
              unit={viewMode === "by-week" ? "weeks" : "dates"}
              ctaLabel="Settle in Attendance →"
              onCtaClick={settleDailyMarketInAttendance}
            />
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                justifyContent: "flex-start",
                borderBottom: 1,
                borderColor: "divider",
                flexShrink: 0,
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
                    fontSize: { xs: 10.5, sm: 11 },
                    fontWeight: 600,
                    textTransform: "none",
                    py: 0.25,
                    px: { xs: 0.75, sm: 1.25 },
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <ToggleButton value="by-week" aria-label="By week">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📊 Week
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📊 By week
                  </Box>
                </ToggleButton>
                <ToggleButton value="by-date" aria-label="By date">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📅 Date
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📅 By date
                  </Box>
                </ToggleButton>
                <ToggleButton value="by-settlement" aria-label="By settlement">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📜 Settled
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📜 By settlement
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              {viewMode === "by-week" ? (
                <DailyMarketWeeklyList
                  rows={dailyMarketWeeklyListQuery.data}
                  isLoading={dailyMarketWeeklyListQuery.isLoading}
                  onRowClick={(week) => {
                    pane.open({
                      kind: "daily-market-weekly",
                      siteId: selectedSite.id,
                      weekStart: week.weekStart,
                      weekEnd: week.weekEnd,
                      scopeFrom: effectiveFrom,
                      scopeTo: effectiveTo,
                    });
                  }}
                  onSettlePending={() => {
                    // v1: nudge user to the by-date view rather than building a
                    // bulk-settle flow (recent mesthri ledger fixes are still
                    // fragile — keep settlement writes one-at-a-time for now).
                    setViewMode("by-date");
                  }}
                />
              ) : viewMode === "by-date" ? (
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
          </Box>
        )}

        {activeTab === "all" && (
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <AllSettlementsHero
              contractWagesDue={salarySummaryQuery.data?.wagesDue ?? 0}
              contractSettlementsTotal={salarySummaryQuery.data?.settlementsTotal ?? 0}
              contractSettlementCount={salarySummaryQuery.data?.settlementCount ?? 0}
              contractAdvances={salarySummaryQuery.data?.advancesTotal ?? 0}
              contractAdvanceCount={salarySummaryQuery.data?.advanceCount ?? 0}
              dailyMarketAmount={summaryQuery.data?.dailyMarketAmount ?? 0}
              dailyMarketCount={summaryQuery.data?.dailyMarketCount ?? 0}
              pendingAmount={summaryQuery.data?.pendingAmount ?? 0}
              isLoading={summaryQuery.isLoading || salarySummaryQuery.isLoading}
            />
            <UnsettledBanner
              count={contractPendingCount + dailyMarketPendingCount}
              amount={contractPendingAmount + dailyMarketPendingAmount}
              unit="items"
            />
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                justifyContent: "flex-start",
                borderBottom: 1,
                borderColor: "divider",
                flexShrink: 0,
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
                    fontSize: { xs: 10.5, sm: 11 },
                    fontWeight: 600,
                    textTransform: "none",
                    py: 0.25,
                    px: { xs: 0.75, sm: 1.25 },
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <ToggleButton value="default" aria-label="Unified ledger">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📋 Ledger
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📋 Unified ledger
                  </Box>
                </ToggleButton>
                <ToggleButton value="by-settlement" aria-label="By settlement">
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    📜 Settled
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    📜 By settlement
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {viewMode === "default" ? (
              <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <PaymentsLedger
                  rows={allLedgerQuery.data ?? []}
                  isLoading={allLedgerQuery.isLoading}
                  selectedEntity={pane.currentEntity}
                  onRowClick={(entity) => pane.open(entity)}
                  onSettleClick={(entity) => handleSettleClick(entity)}
                />
              </Box>
            ) : (
              <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <SettlementsList
                  rows={settlementsListQuery.data ?? []}
                  isLoading={settlementsListQuery.isLoading}
                  onRowClick={(row) => setRefDetail(row.ref)}
                  emptyMessage="No settlements recorded for this period."
                />
              </Box>
            )}
          </Box>
        )}
      </Box>

      {reconcileOpen && auditState.dataStartedAt && selectedSite && (
        <ReconcileDialog
          open={reconcileOpen}
          onClose={() => setReconcileOpen(false)}
          siteId={selectedSite.id}
          siteName={selectedSite.name}
          cutoffDate={auditState.dataStartedAt}
          legacyWagesOwed={legacyWagesOwed}
          legacyPaid={legacyPaid}
          legacyWeeksPending={legacyWeeksPending}
        />
      )}

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
        canEdit={canEditSettlements}
        onEdit={(details) => {
          setRefDetail(null);
          setEditTarget(details);
        }}
        onDelete={(details) => {
          setRefDetail(null);
          setDeleteTarget(details);
        }}
      />

      {/* Edit dialog — Contract or Daily depending on the settlement type.
          Detection mirrors useSettlementsList.ts (any labor_payment with
          is_under_contract=true makes it a contract settlement). */}
      {editTarget && editTarget.isContract && (
        <ContractSettlementEditDialog
          open
          onClose={() => setEditTarget(null)}
          settlement={settlementDetailsToDateWise(editTarget)}
          onSuccess={() => {
            setEditTarget(null);
            invalidateSettlementsCaches(queryClient);
            setNotice("Settlement updated");
          }}
          onDelete={(s) => {
            // ContractSettlementEditDialog re-emits the original payload it
            // received (DateWiseSettlement), but we only kept the upstream
            // SettlementDetails. Hand the same SettlementDetails to the
            // delete dialog directly — its shape is what we adapt from.
            void s;
            const target = editTarget;
            setEditTarget(null);
            setDeleteTarget(target);
          }}
        />
      )}
      {editTarget && !editTarget.isContract && (
        <DailySettlementEditDialog
          open
          onClose={() => setEditTarget(null)}
          settlement={editTarget}
          onSuccess={() => {
            setEditTarget(null);
            invalidateSettlementsCaches(queryClient);
            setNotice("Settlement updated");
          }}
          onDelete={(details) => {
            setEditTarget(null);
            setDeleteTarget(details);
          }}
        />
      )}

      {/* Delete dialog — same contract-vs-daily branch. The delete dialogs
          handle the cascade themselves (cancel labor_payments, reset
          attendance.is_paid, refund engineer wallet). */}
      {deleteTarget && deleteTarget.isContract && (
        <DeleteContractSettlementDialog
          open
          onClose={() => setDeleteTarget(null)}
          settlement={settlementDetailsToRecord(deleteTarget)}
          onSuccess={() => {
            setDeleteTarget(null);
            invalidateSettlementsCaches(queryClient);
            setNotice("Settlement deleted");
          }}
        />
      )}
      {deleteTarget && !deleteTarget.isContract && (
        <DeleteDailySettlementDialog
          open
          onClose={() => setDeleteTarget(null)}
          settlement={deleteTarget}
          onSuccess={() => {
            setDeleteTarget(null);
            invalidateSettlementsCaches(queryClient);
            setNotice("Settlement deleted");
          }}
        />
      )}

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
        zIndex={isFullscreen ? 1400 : undefined}
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
