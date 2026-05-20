"use client";

import { useState } from "react";
import { Box, Alert, CircularProgress, Stack } from "@mui/material";
import dayjs from "dayjs";
import SettlementReportToolbar from "./SettlementReportToolbar";
import SettlementReportWideTable from "./SettlementReportWideTable";
import SettlementReportLongTable from "./SettlementReportLongTable";
import SettlementReportExportDialog from "./SettlementReportExportDialog";
import { openSettlementReportPrintView } from "./SettlementReportPrintView";
import {
  useSettlementReport,
  useLaborCategoriesForReport,
} from "@/hooks/queries/useSettlementReport";
import { InspectPane } from "@/components/common/InspectPane/InspectPane";
import type {
  InspectEntity,
  InspectTabKey,
} from "@/components/common/InspectPane/types";
import type {
  SettlementReportScope,
  SettlementReportRow,
} from "@/types/settlementReport.types";

export default function SettlementReportTab() {
  const [scope, setScope] = useState<SettlementReportScope | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(dayjs().subtract(2, "month").startOf("month").format("YYYY-MM-DD"));
  const [dateTo, setDateTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [view, setView] = useState<"wide" | "long">("wide");
  const [exportOpen, setExportOpen] = useState(false);

  // InspectPane state
  const [inspectEntity, setInspectEntity] = useState<InspectEntity | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectPinned, setInspectPinned] = useState(false);
  const [inspectTab, setInspectTab] = useState<InspectTabKey>("attendance");

  const siteIds =
    scope?.mode === "site" ? [scope.siteId] : scope?.mode === "group" ? scope.siteIds : [];

  const { data: rows = [], isLoading, error } = useSettlementReport({
    siteIds,
    dateFrom,
    dateTo,
    categoryId,
  });

  const { data: categories = [] } = useLaborCategoriesForReport();
  const categoryLabel = categoryId
    ? categories.find((c) => c.id === categoryId)?.name ?? "Unknown"
    : "All trades";

  const scopeLabel = scope
    ? scope.mode === "group" ? scope.groupName : scope.siteName
    : "no scope";

  const handleWideRowClick = (weekStart: string, weekEnd: string) => {
    if (!scope) return;
    // For group scope, drill into the first site (v1 limitation noted in plan).
    const targetSiteId = scope.mode === "site" ? scope.siteId : scope.siteIds[0];
    setInspectEntity({
      kind: "weekly-aggregate",
      siteId: targetSiteId,
      subcontractId: null,
      weekStart,
      weekEnd,
      scopeFrom: dateFrom,
      scopeTo: dateTo,
    });
    setInspectOpen(true);
    setInspectTab("attendance");
  };

  const handleLongRowClick = (row: SettlementReportRow) => {
    setInspectEntity({
      kind: "weekly-aggregate",
      siteId: row.site_id,
      subcontractId: row.subcontract_id,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      scopeFrom: dateFrom,
      scopeTo: dateTo,
    });
    setInspectOpen(true);
    setInspectTab("attendance");
  };

  const handlePrint = () => {
    openSettlementReportPrintView({
      rows,
      scopeLabel: scope
        ? `${scope.mode === "group" ? "Group: " : ""}${scopeLabel}`
        : "(no scope)",
      categoryLabel,
      dateFrom,
      dateTo,
    });
  };

  return (
    <Box>
      <SettlementReportToolbar
        scope={scope}
        onScopeChange={setScope}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        view={view}
        onViewChange={setView}
        onExportClick={() => setExportOpen(true)}
        onPrintClick={handlePrint}
        exportDisabled={rows.length === 0}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      {!scope && (
        <Alert severity="info">Pick a scope (site or group) to load the report.</Alert>
      )}

      {scope && isLoading && (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress />
        </Stack>
      )}

      {scope && !isLoading && rows.length === 0 && (
        <Alert severity="info">No settlements found for the selected filters.</Alert>
      )}

      {scope && !isLoading && rows.length > 0 && (
        view === "wide" ? (
          <SettlementReportWideTable
            rows={rows}
            isLoading={isLoading}
            onRowClick={(pivotRow) => handleWideRowClick(pivotRow.week_start, pivotRow.week_end)}
          />
        ) : (
          <SettlementReportLongTable
            rows={rows}
            isLoading={isLoading}
            onRowClick={handleLongRowClick}
          />
        )
      )}

      <SettlementReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        rows={rows}
        scopeLabel={scopeLabel}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />

      <InspectPane
        entity={inspectEntity}
        isOpen={inspectOpen}
        isPinned={inspectPinned}
        activeTab={inspectTab}
        onTabChange={setInspectTab}
        onClose={() => setInspectOpen(false)}
        onTogglePin={() => setInspectPinned((p) => !p)}
        onOpenInPage={() => setInspectOpen(false)}
      />
    </Box>
  );
}
