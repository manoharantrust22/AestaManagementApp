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
  Link,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import SearchIcon from "@mui/icons-material/Search";
import ReadMoreIcon from "@mui/icons-material/ReadMore";
import { useSelectedSite } from "@/contexts/SiteContext";
import DateRangePicker from "@/components/common/DateRangePicker";
import { formatCurrency } from "@/lib/formatters";
import {
  useMaterialUsageLedger,
  groupByMaterial,
  groupBySection,
  type MaterialGroup,
  type SectionGroup,
} from "@/hooks/queries/useMaterialUsageLedger";
import UsageDetailDrawer from "@/components/materials/UsageDetailDrawer";

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
              {group.variant_breakdown.length > 1 && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    component="div"
                    color="text.secondary"
                    sx={{ textTransform: "uppercase", letterSpacing: 1, mb: 0.5 }}
                  >
                    Grade / variant breakdown
                  </Typography>
                  {group.variant_breakdown.map((v) => (
                    <Box key={v.material_id} sx={{ display: "flex", gap: 4, py: 0.25 }}>
                      <Typography variant="body2" sx={{ width: 180 }}>
                        {v.material_name}
                        {v.is_base && (
                          <Typography component="span" variant="caption" color="text.disabled">
                            {" "}
                            · base
                          </Typography>
                        )}
                      </Typography>
                      <Typography variant="body2">
                        {v.total_qty.toLocaleString()} {v.unit}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatCurrency(v.total_cost)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
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

export default function UsageLedgerPage() {
  const { selectedSite } = useSelectedSite();
  const [viewMode, setViewMode] = React.useState<ViewMode>("material");
  const [fromDate, setFromDate] = React.useState<Date | null>(null);
  const [toDate, setToDate] = React.useState<Date | null>(null);
  const [search, setSearch] = React.useState("");
  const [drawerMaterial, setDrawerMaterial] = React.useState<{ id: string; name: string } | null>(null);

  const { data: rows = [], isLoading } = useMaterialUsageLedger({
    site_id: selectedSite?.id,
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
  const distinctMaterials = new Set(
    rows.map((r) => r.parent_material_id ?? r.material_id)
  ).size;
  const untaggedCount = rows.filter((r) => r.section_id === null).length;
  const sectionIds = new Set(
    rows.filter((r) => r.section_id !== null).map((r) => r.section_id)
  );

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Select a site to view its usage ledger.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={1}>
        Usage Ledger
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        All material consumption for this site — quantities, costs, and section
        breakdowns.
      </Typography>

      {/* KPI strip — 4 tiles */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
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
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography
            variant="caption"
            component="div"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
          >
            Sections Covered
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {sectionIds.size}
          </Typography>
          <Typography variant="caption" component="div" color="text.secondary">
            phases with entries
          </Typography>
        </Paper>
      </Box>

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

      {/* Drill-down drawer — opens when a material name is clicked */}
      <UsageDetailDrawer
        open={!!drawerMaterial}
        onClose={() => setDrawerMaterial(null)}
        rows={rows}
        materialId={drawerMaterial?.id ?? null}
        materialName={drawerMaterial?.name ?? ""}
        siteId={selectedSite?.id}
        scopeKey={`site:${selectedSite?.id ?? ""}:${fromDate ? fromDate.toISOString().split("T")[0] : ""}:${toDate ? toDate.toISOString().split("T")[0] : ""}`}
        canEdit
      />
    </Box>
  );
}
