"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useCompanyCompliance } from "@/hooks/queries/useChecklistCompliance";
import ComplianceDayGrid from "@/components/checklist/ComplianceDayGrid";
import ComplianceHeatmap from "@/components/checklist/ComplianceHeatmap";
import {
  DONE_STATUSES,
  addDaysISO,
  todayISO,
} from "@/types/checklist.types";

const RANGE_DAYS = 14;

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 120 }}>
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="h5" fontWeight={700} color={color}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function CompanyCompliancePage() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const companyId = selectedSite?.company_id ?? undefined;

  const [view, setView] = useState<"day" | "trend">("day");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const today = todayISO();
  const startDate = addDaysISO(today, -(RANGE_DAYS - 1));
  const dates = useMemo(
    () => Array.from({ length: RANGE_DAYS }, (_, i) => addDaysISO(startDate, i)),
    [startDate]
  );

  const isOfficeOrAdmin =
    userProfile?.role === "admin" || userProfile?.role === "office";

  const { data: rows = [], isLoading, error } = useCompanyCompliance({
    companyId: isOfficeOrAdmin ? companyId : undefined,
    startDate,
    endDate: today,
    siteId: siteFilter === "all" ? null : siteFilter,
    role: roleFilter === "all" ? null : roleFilter,
  });

  // distinct sites for the filter dropdown
  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.site_id && r.site_name) m.set(r.site_id, r.site_name);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const dayRows = useMemo(
    () => rows.filter((r) => r.business_date === selectedDate),
    [rows, selectedDate]
  );

  // KPIs for the selected day (per subject = user+site)
  const kpis = useMemo(() => {
    const subj = new Map<string, { total: number; done: number; missed: number; deferred: number }>();
    for (const r of dayRows) {
      const key = `${r.user_id}:${r.site_id ?? "u"}`;
      const e = subj.get(key) ?? { total: 0, done: 0, missed: 0, deferred: 0 };
      e.total += 1;
      if (DONE_STATUSES.includes(r.status)) e.done += 1;
      if (r.status === "missed") e.missed += 1;
      if (r.status === "deferred_pending") e.deferred += 1;
      subj.set(key, e);
    }
    const subjects = [...subj.values()];
    const fullyDone = subjects.filter((s) => s.done === s.total && s.total > 0).length;
    const totalMissed = dayRows.filter((r) => r.status === "missed").length;
    const totalDeferred = dayRows.filter((r) => r.status === "deferred_pending").length;
    return {
      people: subjects.length,
      fullyDone,
      missed: totalMissed,
      deferred: totalDeferred,
    };
  }, [dayRows]);

  return (
    <Box>
      <PageHeader
        title="Daily compliance"
        subtitle="Who completed their daily duties — and whether they filled them on time"
      />

      {!isOfficeOrAdmin ? (
        <Alert severity="info">
          The compliance overview is available to office and admin users. Your own checklist is
          at <strong>/site/checklist</strong>.
        </Alert>
      ) : !companyId ? (
        <Alert severity="warning">Pick a site from the menu to load company data.</Alert>
      ) : (
        <>
          {/* Filters */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
            <TextField
              type="date"
              size="small"
              label="Day"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: today }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Site</InputLabel>
              <Select label="Site" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
                <MenuItem value="all">All sites</MenuItem>
                {siteOptions.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Role</InputLabel>
              <Select label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <MenuItem value="all">All roles</MenuItem>
                <MenuItem value="site_engineer">Site engineers</MenuItem>
                <MenuItem value="office">Office</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* KPIs for the selected day */}
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap", gap: 2 }}>
            <StatCard label="People tracked" value={String(kpis.people)} />
            <StatCard label="Fully done" value={String(kpis.fullyDone)} color="success.main" />
            <StatCard label="Missed items" value={String(kpis.missed)} color={kpis.missed ? "error.main" : undefined} />
            <StatCard label="Deferred" value={String(kpis.deferred)} color={kpis.deferred ? "info.main" : undefined} />
          </Stack>

          <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ mb: 2 }}>
            <Tab value="day" label="Day grid" />
            <Tab value="trend" label={`Last ${RANGE_DAYS} days`} />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {(error as Error).message}
            </Alert>
          )}

          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : view === "day" ? (
            <ComplianceDayGrid rows={dayRows} />
          ) : (
            <ComplianceHeatmap
              rows={rows}
              dates={dates}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setView("day");
              }}
            />
          )}
        </>
      )}
    </Box>
  );
}
