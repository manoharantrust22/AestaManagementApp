"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  IconButton,
  Snackbar,
  Stack,
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
import PaymentsKpiStrip from "@/components/payments/PaymentsKpiStrip";
import PendingBanner from "@/components/payments/PendingBanner";
import PaymentsLedger from "@/components/payments/PaymentsLedger";
import { usePaymentSummary } from "@/hooks/queries/usePaymentSummary";
import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";
import { useInspectPane } from "@/hooks/useInspectPane";
import { InspectPane } from "@/components/common/InspectPane";
import type { InspectEntity } from "@/components/common/InspectPane";

type StatusFilter = "pending" | "completed" | "all";
type TypeFilter = "daily-market" | "weekly" | "all";

interface ChipOption<T extends string> {
  key: T;
  label: string;
  tone?: "warn" | "pos";
}

function ChipRow<T extends string>({
  options,
  active,
  onChange,
}: {
  options: ChipOption<T>[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <Stack direction="row" spacing={0.75}>
      {options.map((o) => {
        const isActive = active === o.key;
        const activeStyles = isActive
          ? o.tone === "warn"
            ? {
                bgcolor: "warning.light",
                color: "warning.dark",
                borderColor: "warning.main",
              }
            : o.tone === "pos"
              ? {
                  bgcolor: "success.light",
                  color: "success.dark",
                  borderColor: "success.main",
                }
              : {
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  borderColor: "primary.main",
                }
          : { borderColor: "divider" };
        return (
          <Box
            key={o.key}
            role="button"
            aria-pressed={isActive}
            tabIndex={0}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(o.key);
              }
            }}
            sx={{
              cursor: "pointer",
              userSelect: "none",
              px: 1.25,
              py: 0.4,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              border: 1,
              ...activeStyles,
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Stack>
  );
}

export default function PaymentsContent() {
  const { selectedSite } = useSelectedSite();
  const { formatForApi, isAllTime } = useDateRange();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { dateFrom, dateTo } = formatForApi();
  const effectiveFrom = isAllTime ? null : dateFrom;
  const effectiveTo = isAllTime ? null : dateTo;

  // The single supported URL param: ?ref=<settlement_ref> highlights the
  // matching ledger row. Per spec §5.2 the InspectPane never auto-opens;
  // user must click the row to inspect. The ref is read by the ledger to
  // tint the matching row, but PaymentsLedger today selects via
  // selectedEntity (driven by clicks). The ref param is kept for future
  // wiring; today it's used only as a notification hint.
  const highlightRef = searchParams.get("ref");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pane = useInspectPane();

  const summaryQuery = usePaymentSummary(selectedSite?.id, effectiveFrom, effectiveTo);
  const ledgerQuery = usePaymentsLedger({
    siteId: selectedSite?.id,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    status: statusFilter,
    type: typeFilter,
  });

  // Settle CTA. The dialog input shapes (DateSummaryForSettlement /
  // WeeklySummaryForSettlement) require per-record fields (is_paid,
  // laborer_id, laborer_type, originalDbId) that the current display
  // hooks do not expose -- see src/components/payments/settlementAdapters.ts
  // for the rationale. Until a settlement-payload RPC ships, route the
  // user to /site/attendance which already has the full data shape.
  const handleSettleClick = useCallback(
    (entity: InspectEntity) => {
      const url =
        entity.kind === "daily-date"
          ? `/site/attendance?date=${entity.date}`
          : `/site/attendance?weekStart=${entity.weekStart}&laborerId=${entity.laborerId}`;
      setNotice("Opening attendance to record this settlement…");
      router.push(url);
    },
    [router],
  );

  const handleOpenInPage = useCallback(
    (entity: InspectEntity) => {
      const url =
        entity.kind === "daily-date"
          ? `/site/attendance?date=${entity.date}`
          : `/site/attendance?weekStart=${entity.weekStart}&laborerId=${entity.laborerId}`;
      router.push(url);
    },
    [router],
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
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          }
        />

        <PaymentsKpiStrip
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
        />

        <PendingBanner
          pendingAmount={summaryQuery.data?.pendingAmount ?? 0}
          pendingDatesCount={summaryQuery.data?.pendingDatesCount ?? 0}
        />

        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            py: 1,
            px: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            flexWrap: "wrap",
          }}
        >
          <ChipRow<StatusFilter>
            options={[
              {
                key: "pending",
                label: `⏳ Pending (${summaryQuery.data?.pendingDatesCount ?? 0})`,
                tone: "warn",
              },
              {
                key: "completed",
                label: `✓ Completed (${summaryQuery.data?.paidCount ?? 0})`,
                tone: "pos",
              },
              { key: "all", label: "All" },
            ]}
            active={statusFilter}
            onChange={setStatusFilter}
          />
          <Box sx={{ width: "1px", height: 18, bgcolor: "divider" }} />
          <ChipRow<TypeFilter>
            options={[
              { key: "all", label: "All Types" },
              { key: "daily-market", label: "Daily + Market" },
              { key: "weekly", label: "Weekly Contract" },
            ]}
            active={typeFilter}
            onChange={setTypeFilter}
          />
          {highlightRef && (
            <Box
              sx={{
                ml: "auto",
                fontSize: 12,
                color: "text.secondary",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              Highlighting: {highlightRef}
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PaymentsLedger
          rows={ledgerQuery.data ?? []}
          isLoading={ledgerQuery.isLoading}
          selectedEntity={pane.currentEntity}
          onRowClick={pane.open}
          onSettleClick={handleSettleClick}
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
