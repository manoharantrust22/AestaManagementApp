"use client";

import React from "react";
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Collapse,
  IconButton,
  CircularProgress,
  TextField,
  InputAdornment,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Link,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import SearchIcon from "@mui/icons-material/Search";
import ReadMoreIcon from "@mui/icons-material/ReadMore";
import DateRangePicker from "@/components/common/DateRangePicker";
import { formatCurrency } from "@/lib/formatters";
import {
  useMaterialUsageLedger,
  groupByMaterial,
  groupBySection,
  type MaterialGroup,
  type SectionGroup,
} from "@/hooks/queries/useMaterialUsageLedger";
import { useSitesData } from "@/contexts/SiteContext";
import { useSiteGroupsWithSites } from "@/hooks/queries/useSiteGroups";
import UsageDetailDrawer from "@/components/materials/UsageDetailDrawer";

type ScopeMode = "all" | "group" | "site";
type ViewMode = "material" | "section";

// MaterialRow: expandable row showing material → section breakdown
function MaterialRow({
  group,
  onTrace,
}: {
  group: MaterialGroup;
  onTrace?: (id: string, name: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <TableRow hover sx={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              {open ? (
                <KeyboardArrowDownIcon fontSize="small" />
              ) : (
                <KeyboardArrowRightIcon fontSize="small" />
              )}
            </IconButton>
            {onTrace ? (
              <Link
                component="button"
                underline="hover"
                color="inherit"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onTrace(group.material_id, group.material_name);
                }}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "pointer",
                  fontWeight: "inherit",
                  fontSize: "inherit",
                }}
              >
                {group.material_name}
                <ReadMoreIcon fontSize="inherit" sx={{ opacity: 0.5, fontSize: "1rem" }} />
              </Link>
            ) : (
              group.material_name
            )}
            {group.untagged_count > 0 && (
              <Chip
                label={`${group.untagged_count} untagged`}
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
          </Box>
        </TableCell>
        <TableCell>{group.unit}</TableCell>
        <TableCell align="right">{group.total_qty.toLocaleString()}</TableCell>
        <TableCell align="right">
          {formatCurrency(group.avg_unit_cost)}/{group.unit}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 600 }}>
          {formatCurrency(group.total_cost)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ pl: 6, py: 1 }}>
              <Typography
                variant="caption"
                component="div"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 1, mb: 0.5 }}
              >
                Section breakdown
              </Typography>
              {group.section_breakdown.map((s) => (
                <Box
                  key={s.section_id ?? "untagged"}
                  sx={{ display: "flex", gap: 4, py: 0.25 }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      width: 180,
                      color: s.section_id ? "text.primary" : "text.disabled",
                    }}
                  >
                    {s.section_name}
                  </Typography>
                  <Typography variant="body2">
                    {s.total_qty.toLocaleString()} {group.unit}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(s.total_cost)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// SectionRow: expandable row showing section → material breakdown
function SectionRow({ group }: { group: SectionGroup }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <TableRow hover sx={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              {open ? (
                <KeyboardArrowDownIcon fontSize="small" />
              ) : (
                <KeyboardArrowRightIcon fontSize="small" />
              )}
            </IconButton>
            <Typography
              component="span"
              sx={{ color: group.section_id ? "text.primary" : "text.disabled" }}
            >
              {group.section_name}
            </Typography>
          </Box>
        </TableCell>
        <TableCell />
        <TableCell align="right">{group.total_qty.toLocaleString()}</TableCell>
        <TableCell />
        <TableCell align="right" sx={{ fontWeight: 600 }}>
          {formatCurrency(group.total_cost)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ pl: 6, py: 1 }}>
              {group.material_breakdown.map((m) => (
                <Box key={m.material_id} sx={{ display: "flex", gap: 4, py: 0.25 }}>
                  <Typography variant="body2" sx={{ width: 180 }}>
                    {m.material_name}
                  </Typography>
                  <Typography variant="body2">
                    {m.total_qty.toLocaleString()} {m.unit}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(m.total_cost)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// Per-site cost bar chart (shown when All Sites scope is active)
function SiteCostChart({ rows }: { rows: import("@/hooks/queries/useMaterialUsageLedger").LedgerRow[] }) {
  const { sites } = useSitesData();

  const siteMap = React.useMemo(() => {
    const map = new Map<string, { name: string; cost: number }>();
    for (const row of rows) {
      if (!map.has(row.site_id)) {
        const site = sites.find((s) => s.id === row.site_id);
        map.set(row.site_id, { name: site?.name ?? row.site_id, cost: 0 });
      }
      map.get(row.site_id)!.cost += row.total_cost ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [rows, sites]);

  const maxCost = siteMap[0]?.cost ?? 1;

  if (siteMap.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography
        variant="caption"
        component="div"
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: 0.5, mb: 1.5 }}
      >
        Cost by Site
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {siteMap.map(({ name, cost }) => (
          <Box key={name} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography variant="body2" sx={{ width: 160, flexShrink: 0 }} noWrap>
              {name}
            </Typography>
            <Box
              sx={{
                flex: 1,
                height: 8,
                borderRadius: 1,
                backgroundColor: "action.hover",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  height: "100%",
                  width: `${(cost / maxCost) * 100}%`,
                  backgroundColor: "primary.main",
                  borderRadius: 1,
                  transition: "width 0.4s ease",
                }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ width: 90, textAlign: "right", flexShrink: 0 }}>
              {formatCurrency(cost)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export default function CompanyMaterialUsagePage() {
  const { sites } = useSitesData();
  const { data: siteGroups = [] } = useSiteGroupsWithSites();

  const [scopeMode, setScopeMode] = React.useState<ScopeMode>("all");
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>("");
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("material");
  const [fromDate, setFromDate] = React.useState<Date | null>(null);
  const [toDate, setToDate] = React.useState<Date | null>(null);
  const [search, setSearch] = React.useState("");
  const [drawerMaterial, setDrawerMaterial] = React.useState<{ id: string; name: string } | null>(null);

  // Derive ledger filter from scope
  const ledgerFilters = React.useMemo(() => {
    if (scopeMode === "all") return { all: true as const };
    if (scopeMode === "group" && selectedGroupId) return { site_group_id: selectedGroupId };
    if (scopeMode === "site" && selectedSiteId) return { site_id: selectedSiteId };
    return {};
  }, [scopeMode, selectedGroupId, selectedSiteId]);

  const { data: rows = [], isLoading } = useMaterialUsageLedger({
    ...ledgerFilters,
    from_date: fromDate ? fromDate.toISOString().split("T")[0] : undefined,
    to_date: toDate ? toDate.toISOString().split("T")[0] : undefined,
  });

  const materialGroups = React.useMemo(() => {
    const groups = groupByMaterial(rows);
    if (!search) return groups;
    return groups.filter((g) =>
      g.material_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [rows, search]);

  const sectionGroups = React.useMemo(() => groupBySection(rows), [rows]);

  const totalCost = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0);
  const distinctMaterials = new Set(rows.map((r) => r.material_id)).size;
  const untaggedCount = rows.filter((r) => r.section_id === null).length;

  // Determine if we have enough info to show data
  const isReady =
    scopeMode === "all" ||
    (scopeMode === "group" && !!selectedGroupId) ||
    (scopeMode === "site" && !!selectedSiteId);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={1}>
        Company Material Usage
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        All material consumption across sites — quantities, costs, and section
        breakdowns.
      </Typography>

      {/* Scope selector */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <ToggleButtonGroup
            value={scopeMode}
            exclusive
            onChange={(_, v) => v && setScopeMode(v)}
            size="small"
          >
            <ToggleButton value="all">All Sites</ToggleButton>
            <ToggleButton value="group">By Site Group</ToggleButton>
            <ToggleButton value="site">Individual Site</ToggleButton>
          </ToggleButtonGroup>

          {scopeMode === "group" && (
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Site Group</InputLabel>
              <Select
                value={selectedGroupId}
                label="Site Group"
                onChange={(e) => setSelectedGroupId(e.target.value)}
              >
                {siteGroups.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {scopeMode === "site" && (
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Site</InputLabel>
              <Select
                value={selectedSiteId}
                label="Site"
                onChange={(e) => setSelectedSiteId(e.target.value)}
              >
                {sites.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Paper>

      {!isReady ? (
        <Alert severity="info">
          {scopeMode === "group"
            ? "Select a site group to view its usage ledger."
            : "Select a site to view its usage ledger."}
        </Alert>
      ) : (
        <>
          {/* KPI strip — 3 tiles */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 2,
              mb: 3,
            }}
          >
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography
                variant="caption"
                component="div"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
              >
                Total Material Cost
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {formatCurrency(totalCost)}
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary">
                across all materials
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography
                variant="caption"
                component="div"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
              >
                Materials Used
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {distinctMaterials}
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary">
                distinct types
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography
                variant="caption"
                component="div"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
              >
                Usage Entries
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {rows.length}
              </Typography>
              <Typography
                variant="caption"
                component="div"
                color={untaggedCount > 0 ? "warning.main" : "text.secondary"}
              >
                {untaggedCount > 0 ? `${untaggedCount} untagged` : "all tagged"}
              </Typography>
            </Paper>
          </Box>

          {/* Per-site cost chart (only in All Sites mode) */}
          {scopeMode === "all" && !isLoading && rows.length > 0 && (
            <SiteCostChart rows={rows} />
          )}

          {/* Top bar: toggle + date picker + search */}
          <Box
            sx={{
              display: "flex",
              gap: 2,
              mb: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              size="small"
            >
              <ToggleButton value="material">By Material</ToggleButton>
              <ToggleButton value="section">By Section</ToggleButton>
            </ToggleButtonGroup>
            <DateRangePicker
              standalone
              compact
              startDate={fromDate}
              endDate={toDate}
              onChange={(s, e) => {
                setFromDate(s);
                setToDate(e);
              }}
            />
            {viewMode === "material" && (
              <TextField
                size="small"
                placeholder="Search material..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
          </Box>

          {/* Table */}
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "action.hover" }}>
                    <TableCell>
                      {viewMode === "material" ? "Material" : "Section / Phase"}
                    </TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell align="right">Qty Used</TableCell>
                    <TableCell align="right">Avg Unit Cost</TableCell>
                    <TableCell align="right">Total Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {viewMode === "material"
                    ? materialGroups.map((g) => (
                        <MaterialRow
                          key={g.material_id}
                          group={g}
                          onTrace={(id, name) => setDrawerMaterial({ id, name })}
                        />
                      ))
                    : sectionGroups.map((g) => (
                        <SectionRow key={g.section_id ?? "untagged"} group={g} />
                      ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Drill-down drawer — opens when a material name is clicked; edit only in site scope */}
      <UsageDetailDrawer
        open={!!drawerMaterial}
        onClose={() => setDrawerMaterial(null)}
        rows={rows}
        materialId={drawerMaterial?.id ?? null}
        materialName={drawerMaterial?.name ?? ""}
        siteId={scopeMode === "site" ? selectedSiteId : undefined}
        scopeKey={`company:${scopeMode}:${scopeMode === "site" ? selectedSiteId : selectedGroupId ?? ""}:${fromDate ? fromDate.toISOString().split("T")[0] : ""}:${toDate ? toDate.toISOString().split("T")[0] : ""}`}
        canEdit={scopeMode === "site" && !!selectedSiteId}
      />
    </Box>
  );
}
