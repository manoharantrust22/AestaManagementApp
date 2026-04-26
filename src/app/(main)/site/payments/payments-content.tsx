"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  IconButton,
  Snackbar,
  Tooltip,
} from "@mui/material";
import {
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
import { usePaymentSummary } from "@/hooks/queries/usePaymentSummary";
import { useSalarySliceSummary } from "@/hooks/queries/useSalarySliceSummary";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
import { useInspectPane } from "@/hooks/useInspectPane";
import { InspectPane } from "@/components/common/InspectPane";
import type { InspectEntity } from "@/components/common/InspectPane";

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

  const pane = useInspectPane();

  // Subcontract scoping is added in Phase 3 (SubcontractContextStrip).
  // For Phase 1 the salary slice aggregates across all subcontracts on the site.
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

  const handleSettleClick = useCallback(
    (entity: InspectEntity) => {
      const url =
        entity.kind === "daily-date"
          ? `/site/attendance?date=${entity.date}`
          : entity.kind === "weekly-week"
            ? `/site/attendance?weekStart=${entity.weekStart}&laborerId=${entity.laborerId}`
            : "/site/attendance";
      setNotice("Opening attendance to record this settlement…");
      router.push(url);
    },
    [router]
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

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <SalaryWaterfallList
          weeks={waterfallQuery.data ?? []}
          futureCredit={salarySummaryQuery.data?.futureCredit ?? 0}
          isLoading={waterfallQuery.isLoading}
          onRowClick={(week) => {
            // Phase 4 adds the 'weekly-aggregate' entity kind to InspectEntity.
            // For Phase 1 this is a placeholder cast that opens the existing
            // InspectPane with a synthetic kind; the pane will not render
            // tab content until Phase 4.2 adds WeeklyAggregateShape.
            (pane.open as (entity: unknown) => void)({
              kind: "weekly-aggregate",
              siteId: selectedSite.id,
              subcontractId: selectedSubcontractId,
              weekStart: week.weekStart,
              weekEnd: week.weekEnd,
            });
          }}
          onSettleClick={(week) => {
            setNotice(
              `Settle Week ${week.weekStart} → ${week.weekEnd} (Phase 4 wires WeeklySettlementDialog)`
            );
          }}
        />
      </Box>

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
