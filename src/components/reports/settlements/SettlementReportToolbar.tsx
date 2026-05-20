"use client";

import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  Typography,
  Button,
} from "@mui/material";
import { Download as DownloadIcon, Print as PrintIcon } from "@mui/icons-material";
import { useSiteGroupsWithSites } from "@/hooks/queries/useSiteGroups";
import {
  useLaborCategoriesForReport,
  useUngroupedActiveSites,
} from "@/hooks/queries/useSettlementReport";
import type { SettlementReportScope } from "@/types/settlementReport.types";

export interface SettlementReportToolbarProps {
  scope: SettlementReportScope | null;
  onScopeChange: (scope: SettlementReportScope | null) => void;
  categoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  dateFrom: string;
  onDateFromChange: (d: string) => void;
  dateTo: string;
  onDateToChange: (d: string) => void;
  view: "wide" | "long";
  onViewChange: (v: "wide" | "long") => void;
  onExportClick: () => void;
  onPrintClick: () => void;
  exportDisabled?: boolean;
}

export default function SettlementReportToolbar(props: SettlementReportToolbarProps) {
  const {
    scope, onScopeChange,
    categoryId, onCategoryChange,
    dateFrom, onDateFromChange,
    dateTo, onDateToChange,
    view, onViewChange,
    onExportClick, onPrintClick, exportDisabled,
  } = props;

  const { data: groups = [], isLoading: groupsLoading } = useSiteGroupsWithSites();
  const { data: ungrouped = [] } = useUngroupedActiveSites();
  const { data: categories = [] } = useLaborCategoriesForReport();

  const scopeValue = scope
    ? scope.mode === "group" ? `group:${scope.groupId}` : `site:${scope.siteId}`
    : "";

  const handleScopeChange = (raw: string) => {
    if (!raw) { onScopeChange(null); return; }
    if (raw.startsWith("group:")) {
      const groupId = raw.slice(6);
      const g = groups.find((x) => x.id === groupId);
      if (!g) return;
      onScopeChange({
        mode: "group",
        groupId: g.id,
        groupName: g.name,
        siteIds: (g.sites ?? []).map((s) => s.id),
        siteNames: (g.sites ?? []).map((s) => s.name),
      });
    } else if (raw.startsWith("site:")) {
      const siteId = raw.slice(5);
      let siteName = ungrouped.find((s) => s.id === siteId)?.name;
      if (!siteName) {
        for (const g of groups) {
          const found = (g.sites ?? []).find((s) => s.id === siteId);
          if (found) { siteName = found.name; break; }
        }
      }
      onScopeChange({ mode: "site", siteId, siteName: siteName ?? "Site" });
    }
  };

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      alignItems={{ xs: "stretch", md: "center" }}
      sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: "background.paper", border: 1, borderColor: "divider", flexWrap: "wrap" }}
    >
      <FormControl size="small" sx={{ minWidth: 240 }}>
        <InputLabel>Scope</InputLabel>
        <Select
          label="Scope"
          value={scopeValue}
          onChange={(e) => handleScopeChange(e.target.value)}
          disabled={groupsLoading}
        >
          {groups.flatMap((g) => [
            <MenuItem key={`g-${g.id}`} value={`group:${g.id}`}>
              <Typography component="span" fontWeight={600}>Group: {g.name}</Typography>
              <Typography component="span" variant="caption" sx={{ ml: 1, color: "text.secondary" }}>
                ({(g.sites ?? []).length} sites)
              </Typography>
            </MenuItem>,
            ...(g.sites ?? []).map((s) => (
              <MenuItem key={`s-${s.id}`} value={`site:${s.id}`} sx={{ pl: 4 }}>
                {s.name}
              </MenuItem>
            )),
          ])}
          {ungrouped.length > 0 && (
            <MenuItem
              disabled
              value=""
              sx={{ opacity: 1, fontStyle: "italic", fontSize: "0.75rem", color: "text.secondary" }}
            >
              — Ungrouped sites —
            </MenuItem>
          )}
          {ungrouped.map((s) => (
            <MenuItem key={`us-${s.id}`} value={`site:${s.id}`} sx={{ pl: 4 }}>
              {s.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>Trade</InputLabel>
        <Select
          label="Trade"
          value={categoryId ?? ""}
          onChange={(e) => onCategoryChange(e.target.value || null)}
        >
          <MenuItem value=""><em>All trades</em></MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small"
        type="date"
        label="From"
        value={dateFrom}
        onChange={(e) => onDateFromChange(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ minWidth: 160 }}
      />
      <TextField
        size="small"
        type="date"
        label="To"
        value={dateTo}
        onChange={(e) => onDateToChange(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ minWidth: 160 }}
      />

      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_, v) => v && onViewChange(v)}
      >
        <ToggleButton value="wide">Weekly per-site</ToggleButton>
        <ToggleButton value="long">Settlement log</ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ flexGrow: 1 }} />

      <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onExportClick} disabled={exportDisabled}>
        Export
      </Button>
      <Button variant="outlined" startIcon={<PrintIcon />} onClick={onPrintClick} disabled={exportDisabled}>
        Print
      </Button>
    </Stack>
  );
}
