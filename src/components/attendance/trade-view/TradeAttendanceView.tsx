"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Alert,
  CircularProgress,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Snackbar,
} from "@mui/material";
import {
  Payment as PaymentIcon,
  ReceiptLong as ReceiptIcon,
  WbSunny,
  EventNote,
  EventBusy as HolidayIcon,
  BeachAccess as BeachAccessIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import PageHeader from "@/components/layout/PageHeader";
import { useSelectedSite } from "@/contexts/SiteContext";
import { TradeChipFilter, type TradeChipSelection } from "@/components/attendance/TradeChipFilter";
import { getTradeColor } from "@/theme/tradeColors";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { useTradeAttendanceSummary } from "@/hooks/queries/useTradeAttendanceSummary";
import { TradeAttendanceKpiStrip } from "./TradeAttendanceKpiStrip";
import { HeadcountAttendanceTable } from "./HeadcountAttendanceTable";
import { CivilStyleTradeKpiStrip } from "./CivilStyleTradeKpiStrip";
import { CivilStyleTradeTable } from "./CivilStyleTradeTable";
import { TradeAttendanceEntryDrawer } from "./TradeAttendanceEntryDrawer";
import { MidAttendanceEntryDrawer } from "./MidAttendanceEntryDrawer";
import { useContractMidEntries } from "@/hooks/queries/useContractMidEntries";
import { RecordPaymentDialog } from "@/components/trades/RecordPaymentDialog";
import MiscExpenseDialog from "@/components/expenses/MiscExpenseDialog";
import HolidayConfirmDialog from "@/components/attendance/HolidayConfirmDialog";
import UpcomingHolidaysStrip from "@/components/attendance/UpcomingHolidaysStrip";
import { useSiteHolidays } from "@/hooks/queries/useSiteHolidays";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { groupHolidays, type HolidayGroup } from "@/lib/utils/holidayUtils";

interface TradeAttendanceViewProps {
  selection: Extract<TradeChipSelection, { kind: "trade" }>;
  onChipChange: (next: TradeChipSelection) => void;
}

/**
 * Slice E — top-level transformed attendance view for a single trade contract.
 *
 * Renders its own page chrome (PageHeader + chip filter) so AttendanceContent
 * can early-return to this view when a non-civil chip is selected. Civil JSX
 * stays 100% untouched — we never enter that branch in this component.
 */
export function TradeAttendanceView({
  selection,
  onChipChange,
}: TradeAttendanceViewProps) {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const queryClient = useQueryClient();
  const siteId = selectedSite?.id;

  const { data: trades } = useSiteTrades(siteId);
  const contract =
    trades
      ?.find((t) => t.category.id === selection.categoryId)
      ?.contracts.find((c) => c.id === selection.contractId) ?? null;

  const tradeColor = React.useMemo(
    () => getTradeColor(selection.tradeName),
    [selection.tradeName]
  );

  const { data: summary, isLoading: summaryLoading } = useTradeAttendanceSummary(
    contract?.id
  );

  // Mid-mode totals so the KPI strip shows real labor-done and avg/day numbers
  // when the contract is in mid mode. Only fetches if the contract is actually
  // mid-mode to avoid wasted reads for headcount / detailed contracts.
  const { data: midEntries } = useContractMidEntries(
    contract?.laborTrackingMode === "mid" ? contract.id : undefined
  );
  const midTotals = React.useMemo(() => {
    if (!midEntries || midEntries.length === 0) {
      return { salary: 0, days: 0 };
    }
    return {
      salary: midEntries.reduce((s, e) => s + e.dayTotalAmount, 0),
      days: midEntries.length,
    };
  }, [midEntries]);

  // Drawer + dialog state
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });

  // ── Holidays (scoped to this trade + "all workspaces") ──────────────────
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);
  const holidaysQuery = useSiteHolidays(siteId, selection.categoryId);
  const tradeHolidays = useMemo(() => holidaysQuery.data ?? [], [holidaysQuery.data]);
  const today = dayjs().format("YYYY-MM-DD");
  const todayHoliday = tradeHolidays.find((h) => h.date === today) ?? null;
  const upcomingHolidayGroups = useMemo(
    () =>
      groupHolidays(tradeHolidays.filter((h) => h.date > today)).sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      ),
    [tradeHolidays, today]
  );
  const holidaysByDate = useMemo(
    () => new Map(tradeHolidays.map((h) => [h.date, h])),
    [tradeHolidays]
  );
  // Dates this contract already has attendance on — a holiday can't be marked there.
  const { data: headcountData } = useContractHeadcount(
    contract?.laborTrackingMode === "headcount" ? contract.id : undefined
  );
  const recordedDates = useMemo(() => {
    if (contract?.laborTrackingMode === "headcount") {
      return (headcountData?.recent ?? []).filter((e) => e.units > 0).map((e) => e.attendanceDate);
    }
    if (contract?.laborTrackingMode === "mid") {
      return (midEntries ?? []).map((e) => e.attendanceDate);
    }
    return [];
  }, [contract?.laborTrackingMode, headcountData, midEntries]);

  const [holidayDialog, setHolidayDialog] = useState<{
    open: boolean;
    mode: "mark" | "revoke" | "edit";
    date?: string;
    multiDay?: boolean;
    group?: HolidayGroup | null;
  }>({ open: false, mode: "mark" });

  const openEditHoliday = useCallback(
    (group: HolidayGroup) => setHolidayDialog({ open: true, mode: "edit", group }),
    []
  );
  const openPlanHoliday = useCallback(
    () =>
      setHolidayDialog({
        open: true,
        mode: "mark",
        date: dayjs().add(1, "day").format("YYYY-MM-DD"),
        multiDay: true,
      }),
    []
  );
  /** Table row click on a holiday date → edit the consecutive group it belongs to. */
  const openHolidayForDate = useCallback(
    (date: string) => {
      const group = groupHolidays(tradeHolidays).find((g) =>
        g.holidays.some((h) => h.date === date)
      );
      if (group) openEditHoliday(group);
    },
    [tradeHolidays, openEditHoliday]
  );
  const onHolidaySaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["site-holidays", siteId] });
    setSnackbar({ open: true, message: "Holidays updated" });
  }, [queryClient, siteId]);

  // Cross-page sync: if /site/trades or another tab writes, refresh KPI + tables
  useEffect(() => {
    if (!siteId || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("subcontracts-changed");
    bc.onmessage = (e) => {
      const msgSiteId = (e.data as { siteId?: string } | undefined)?.siteId;
      if (msgSiteId && msgSiteId !== siteId) return;
      queryClient.invalidateQueries({ queryKey: ["trade-attendance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["contract-headcount"] });
      queryClient.invalidateQueries({ queryKey: ["contract-payments"] });
      queryClient.invalidateQueries({ queryKey: ["contract-work-updates"] });
    };
    return () => bc.close();
  }, [siteId, queryClient]);

  // Defensive redirect: detailed contracts now live on Path 2 (?contractId= URL).
  // If someone lands here via a legacy triple URL (?categoryId=&contractId=&trade=)
  // with a detailed contract, silently redirect to the full Path-2 screen.
  useEffect(() => {
    if (contract?.laborTrackingMode === "detailed") {
      router.replace(`/site/attendance?contractId=${contract.id}`);
    }
  }, [contract?.laborTrackingMode, contract?.id, router]);

  if (!selectedSite) {
    return null;
  }

  if (!contract) {
    return (
      <Box ref={undefined}>
        <PageHeader title="Attendance" subtitle={selection.tradeName} />
        <TradeChipFilter siteId={siteId} selected={selection} onChange={onChipChange} />
        <Alert severity="info">
          Loading {selection.tradeName} contract…
        </Alert>
      </Box>
    );
  }

  const contractDisplay = contract.isInHouse
    ? "In-house"
    : contract.mesthriOrSpecialistName ?? contract.title;
  const contractTitle = `${contract.title} · ${contractDisplay}`;

  const handlePickDate = (dateISO: string) => {
    setEntryDate(dateISO);
  };

  // FAB actions — match Civil's 3 actions exactly for the unified headcount
  // shell (Start Day / Full Day / Mark Holiday). For mesthri_only and
  // detailed (placeholder) modes, keep the trade-specific Payment+Extra
  // actions since those modes don't yet have the unified attendance flow.
  type FabAction = {
    icon: React.ReactNode;
    name: string;
    onClick: () => void;
    tooltipSx?: object;
  };
  const speedDialActions: FabAction[] = (() => {
    if (
      contract.laborTrackingMode === "headcount" ||
      contract.laborTrackingMode === "mid"
    ) {
      const today = dayjs().format("YYYY-MM-DD");
      return [
        {
          icon: <WbSunny />,
          name: "Start Day Attendance",
          onClick: () => setEntryDate(today),
          tooltipSx: {
            "& .MuiSpeedDialAction-staticTooltipLabel": {
              whiteSpace: "nowrap",
              bgcolor: "warning.main",
              color: "warning.contrastText",
            },
          },
        },
        {
          icon: <EventNote />,
          name: "Full Day Attendance",
          onClick: () => setEntryDate(today),
          tooltipSx: {
            "& .MuiSpeedDialAction-staticTooltipLabel": {
              whiteSpace: "nowrap",
              bgcolor: tradeColor.main,
              color: tradeColor.contrastText,
            },
          },
        },
        {
          icon: <HolidayIcon />,
          name: todayHoliday ? "Revoke Holiday" : "Mark as Holiday",
          onClick: () =>
            todayHoliday
              ? setHolidayDialog({ open: true, mode: "revoke" })
              : setHolidayDialog({ open: true, mode: "mark", date: today }),
          tooltipSx: {
            "& .MuiSpeedDialAction-staticTooltipLabel": {
              whiteSpace: "nowrap",
              bgcolor: todayHoliday ? "error.main" : "success.main",
              color: todayHoliday ? "error.contrastText" : "success.contrastText",
            },
          },
        },
        {
          icon: <BeachAccessIcon />,
          name: "Plan Holiday",
          onClick: openPlanHoliday,
          tooltipSx: {
            "& .MuiSpeedDialAction-staticTooltipLabel": {
              whiteSpace: "nowrap",
              bgcolor: "warning.main",
              color: "warning.contrastText",
            },
          },
        },
      ];
    }
    if (contract.laborTrackingMode === "mesthri_only") {
      return [
        {
          icon: <PaymentIcon />,
          name: "Record payment",
          onClick: () => setPaymentOpen(true),
        },
        {
          icon: <ReceiptIcon />,
          name: "Add extra",
          onClick: () => setExtraOpen(true),
        },
      ];
    }
    // detailed
    return [
      {
        icon: <PaymentIcon />,
        name: "Record payment",
        onClick: () => setPaymentOpen(true),
      },
      {
        icon: <ReceiptIcon />,
        name: "Add extra",
        onClick: () => setExtraOpen(true),
      },
    ];
  })();

  return (
    <Box sx={{ pb: 10 }}>
      <PageHeader
        title="Attendance"
        subtitle={`${selection.tradeName} · ${contractDisplay}`}
        showBack={false}
      />

      <TradeChipFilter siteId={siteId} selected={selection} onChange={onChipChange} />

      {(contract.laborTrackingMode === "headcount" ||
        contract.laborTrackingMode === "mid") ? (
        <>
          <UpcomingHolidaysStrip
            groups={upcomingHolidayGroups}
            canEdit={canEdit}
            onEdit={openEditHoliday}
            onPlan={openPlanHoliday}
          />
          <CivilStyleTradeKpiStrip
            summary={summary}
            tradeColor={tradeColor}
            isLoading={summaryLoading}
            salaryOverride={
              contract.laborTrackingMode === "mid" ? midTotals.salary : undefined
            }
            daysOverride={
              contract.laborTrackingMode === "mid" ? midTotals.days : undefined
            }
          />
          <CivilStyleTradeTable
            siteId={contract.siteId}
            contractId={contract.id}
            contractTitle={contractTitle}
            tradeColor={tradeColor}
            onPickDate={handlePickDate}
            mode={contract.laborTrackingMode}
            holidaysByDate={holidaysByDate}
            onHolidayClick={canEdit ? openHolidayForDate : undefined}
          />
        </>
      ) : (
        <>
          <TradeAttendanceKpiStrip
            summary={summary}
            mode={contract.laborTrackingMode}
            isLoading={summaryLoading}
          />

          {contract.laborTrackingMode === "mesthri_only" && (
            <Alert severity="info">
              <strong>Mesthri-only mode</strong> — daily money entries appear here in
              the next slice. For now use the FAB → Record payment to log money
              given to {contractDisplay}, or visit{" "}
              <strong>/site/trades</strong> for the full ledger.
            </Alert>
          )}

          {contract.laborTrackingMode === "detailed" && (
            <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          )}
        </>
      )}

      {/* FAB — Civil-style for headcount mode (Start Day / Full Day / Mark
          Holiday); trade-specific (Record payment / Add extra) for mesthri /
          detailed placeholder modes. Tinted with the trade's color. */}
      <SpeedDial
        ariaLabel="Attendance actions"
        sx={{
          position: "fixed",
          bottom: { xs: 24, md: 32 },
          right: { xs: 16, md: 32 },
          "& .MuiFab-primary": {
            bgcolor: tradeColor.main,
            "&:hover": { bgcolor: tradeColor.dark },
          },
        }}
        icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
      >
        {speedDialActions.map((a) => (
          <SpeedDialAction
            key={a.name}
            icon={a.icon}
            tooltipTitle={a.name}
            tooltipOpen
            onClick={a.onClick}
            sx={a.tooltipSx}
          />
        ))}
      </SpeedDial>

      {/* Day entry drawer — mode-aware */}
      {entryDate !== null && contract.laborTrackingMode === "headcount" && (
        <TradeAttendanceEntryDrawer
          open={true}
          onClose={() => setEntryDate(null)}
          siteId={contract.siteId}
          contractId={contract.id}
          contractTitle={contractTitle}
          date={entryDate}
        />
      )}
      {entryDate !== null && contract.laborTrackingMode === "mid" && (
        <MidAttendanceEntryDrawer
          open={true}
          onClose={() => setEntryDate(null)}
          contractId={contract.id}
          contractTitle={contractTitle}
          date={entryDate}
          tradeColor={tradeColor}
        />
      )}

      {/* Holiday dialog — same component as Civil, scoped to this trade */}
      {holidayDialog.open && (
        <HolidayConfirmDialog
          open={true}
          onClose={() => setHolidayDialog({ open: false, mode: "mark" })}
          mode={holidayDialog.mode}
          site={{ id: selectedSite.id, name: selectedSite.name }}
          existingHoliday={holidayDialog.mode === "revoke" ? todayHoliday : null}
          onSuccess={onHolidaySaved}
          date={holidayDialog.date}
          defaultMultiDay={holidayDialog.multiDay ?? false}
          editGroup={holidayDialog.group ?? null}
          tradeCategoryId={selection.categoryId}
          tradeName={selection.tradeName}
          attendanceCheck="none"
          recordedDates={recordedDates}
        />
      )}

      {/* Record payment dialog */}
      {paymentOpen && (
        <RecordPaymentDialog
          open={true}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => {
            setSnackbar({ open: true, message: "Payment recorded" });
          }}
          siteId={contract.siteId}
          contractId={contract.id}
          contractTitle={contractTitle}
          remainingBalance={(summary?.quotedAmount ?? 0) - (summary?.amountPaid ?? 0)}
          // Detailed contracts route money to Salary Settlements. This view already
          // redirects detailed contracts to /site/attendance, so this is defensive.
          gatedToWorkspace={contract.laborTrackingMode === "detailed"}
        />
      )}

      {/* Add extra dialog */}
      {extraOpen && (
        <MiscExpenseDialog
          open={true}
          onClose={() => setExtraOpen(false)}
          defaultSubcontractId={contract.id}
          onSuccess={() => {
            setSnackbar({ open: true, message: "Extra recorded" });
            queryClient.invalidateQueries({
              queryKey: ["trade-attendance-summary", contract.id],
            });
            queryClient.invalidateQueries({
              queryKey: ["contract-payments", contract.id],
            });
          }}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        message={snackbar.message}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
