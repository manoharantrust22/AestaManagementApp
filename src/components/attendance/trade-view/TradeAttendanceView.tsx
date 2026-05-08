"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Alert,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Snackbar,
} from "@mui/material";
import {
  Groups as PeopleIcon,
  PhotoCamera as PhotoIcon,
  Payment as PaymentIcon,
  ReceiptLong as ReceiptIcon,
  TaskAlt as SettleIcon,
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
import { RecordPaymentDialog } from "@/components/trades/RecordPaymentDialog";
import MiscExpenseDialog from "@/components/expenses/MiscExpenseDialog";

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

  // Drawer + dialog state
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });

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

  // Mode-aware FAB actions
  const speedDialActions = (() => {
    if (contract.laborTrackingMode === "headcount") {
      return [
        {
          icon: <PeopleIcon />,
          name: "Today's headcount",
          onClick: () => setEntryDate(dayjs().format("YYYY-MM-DD")),
        },
        {
          icon: <PhotoIcon />,
          name: "Today's photos",
          onClick: () => setEntryDate(dayjs().format("YYYY-MM-DD")),
        },
        {
          icon: <ReceiptIcon />,
          name: "Add extra (snacks, fuel)",
          onClick: () => setExtraOpen(true),
        },
        {
          icon: <PaymentIcon />,
          name: "Record payment",
          onClick: () => setPaymentOpen(true),
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

      {contract.laborTrackingMode === "headcount" ? (
        <>
          <CivilStyleTradeKpiStrip
            summary={summary}
            tradeColor={tradeColor}
            isLoading={summaryLoading}
          />
          <CivilStyleTradeTable
            siteId={contract.siteId}
            contractId={contract.id}
            contractTitle={contractTitle}
            tradeColor={tradeColor}
            onPickDate={handlePickDate}
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
            <Alert severity="info">
              <strong>Detailed (per-laborer) mode</strong> for non-civil contracts
              ships in the next slice. For now visit <strong>/site/trades</strong>{" "}
              and expand this contract for the full picture.
            </Alert>
          )}
        </>
      )}

      {/* Mode-aware FAB */}
      <SpeedDial
        ariaLabel="Add for this contract"
        sx={{
          position: "fixed",
          bottom: { xs: 24, md: 32 },
          right: { xs: 16, md: 32 },
          "& .MuiFab-primary": {
            bgcolor: tradeColor.main,
            "&:hover": { bgcolor: tradeColor.dark },
          },
        }}
        icon={<SpeedDialIcon />}
      >
        {speedDialActions.map((a) => (
          <SpeedDialAction
            key={a.name}
            icon={a.icon}
            tooltipTitle={a.name}
            tooltipOpen
            onClick={a.onClick}
          />
        ))}
      </SpeedDial>

      {/* Day entry drawer (headcount mode) */}
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
