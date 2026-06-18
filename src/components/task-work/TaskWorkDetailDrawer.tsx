"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  Grid,
  IconButton,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, Edit as EditIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { computeProfitability } from "@/lib/taskWork/profitability";
import { useTaskWorkProfitability } from "@/hooks/queries/useTaskWorkProfitability";
import {
  TASK_WORK_STATUS_LABEL,
  TASK_WORK_UNIT_LABEL,
  type TaskWorkPackageWithMeta,
} from "@/types/taskWork.types";
import TaskWorkEffortPanel from "./TaskWorkEffortPanel";
import TaskWorkPaymentsPanel from "./TaskWorkPaymentsPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  pkg: TaskWorkPackageWithMeta | null;
  onEdit?: (pkg: TaskWorkPackageWithMeta) => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={700} color={color}>
        {value}
      </Typography>
    </Box>
  );
}

export default function TaskWorkDetailDrawer({ open, onClose, pkg, onEdit }: Props) {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);
  const [tab, setTab] = useState(0);
  const { data: prof } = useTaskWorkProfitability(pkg?.id);

  if (!pkg) return null;

  const hasActuals = !!prof && prof.actual_man_days > 0;

  const estManDays = (pkg.estimated_crew_size || 0) * (pkg.estimated_days || 0);
  const preview = computeProfitability({
    totalValue: pkg.total_value,
    manDays: estManDays,
    benchmarkDailyRate: pkg.benchmark_daily_rate,
    retentionPercent: pkg.retention_percent,
    totalUnits: pkg.pricing_mode === "rate_based" ? pkg.total_units : null,
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: isMobile ? "100%" : 460, p: 2 } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            {pkg.package_number}
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {pkg.title}
          </Typography>
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Chip size="small" label={TASK_WORK_STATUS_LABEL[pkg.status]} />
        {pkg.maistry_name && (
          <Chip size="small" variant="outlined" label={`Maistry: ${pkg.maistry_name}`} />
        )}
        {pkg.category_name && (
          <Chip size="small" variant="outlined" label={pkg.category_name} />
        )}
        {pkg.parent_subcontract_title && (
          <Chip
            size="small"
            color="info"
            variant="outlined"
            label={`Under: ${pkg.parent_subcontract_title}`}
          />
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
      >
        <Tab label="Overview" />
        <Tab label="Day log" />
        <Tab label="Payments" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Stat label="Agreed price" value={inr(pkg.total_value)} color="primary.main" />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Stat
                label="Pricing"
                value={
                  pkg.pricing_mode === "rate_based" && pkg.total_units
                    ? `${inr(pkg.rate_per_unit || 0)}/${
                        TASK_WORK_UNIT_LABEL[pkg.measurement_unit ?? "nos"]
                      } × ${pkg.total_units}`
                    : "Lump sum"
                }
              />
            </Grid>
            {pkg.retention_percent > 0 && (
              <Grid size={{ xs: 6 }}>
                <Stat
                  label="Retention held"
                  value={`${inr(preview.retentionHeld)} (${pkg.retention_percent}%)`}
                />
              </Grid>
            )}
            {pkg.maistry_phone && (
              <Grid size={{ xs: 6 }}>
                <Stat label="Phone" value={pkg.maistry_phone} />
              </Grid>
            )}
          </Grid>

          {pkg.scope_of_work && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                Scope of work
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {pkg.scope_of_work}
              </Typography>
            </>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Live actuals (from the profitability view) once days are logged. */}
          {hasActuals && prof && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Actuals
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  mb: 2,
                  borderColor:
                    prof.company_saving >= 0 ? "success.main" : "warning.main",
                }}
              >
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6 }}>
                    <Stat
                      label="Man-days so far"
                      value={`${prof.actual_man_days} (${prof.actual_working_days}d)`}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Stat
                      label="Crew earns / man-day"
                      value={
                        prof.crew_effective_daily != null
                          ? inr(prof.crew_effective_daily)
                          : "—"
                      }
                      color={
                        prof.crew_effective_daily != null &&
                        prof.benchmark_daily_rate != null &&
                        prof.crew_effective_daily >= prof.benchmark_daily_rate
                          ? "success.main"
                          : undefined
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Stat
                      label="Daywork for actual effort"
                      value={inr(prof.daywage_benchmark_cost)}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Stat
                      label="Company saving (locked)"
                      value={`${inr(prof.company_saving)}${
                        prof.saving_pct != null ? ` (${prof.saving_pct}%)` : ""
                      }`}
                      color={
                        prof.company_saving >= 0 ? "success.main" : "warning.main"
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Stat label="Paid" value={inr(prof.paid)} color="success.main" />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Stat label="Balance" value={inr(prof.balance)} color="error.main" />
                  </Grid>
                </Grid>
                {prof.crew_effective_daily != null &&
                  prof.benchmark_daily_rate != null &&
                  prof.crew_effective_daily > prof.benchmark_daily_rate &&
                  prof.company_saving >= 0 && (
                    <Typography
                      variant="caption"
                      color="success.main"
                      sx={{ mt: 1, display: "block" }}
                    >
                      Win-win: the crew earns more per day than daywage, and the
                      company still saves — they finished in fewer man-days.
                    </Typography>
                  )}
              </Paper>
            </>
          )}

          <Typography variant="subtitle2" gutterBottom>
            {hasActuals ? "Original estimate" : "Estimate & expected saving"}
          </Typography>
          {estManDays > 0 && (pkg.benchmark_daily_rate || 0) > 0 ? (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6 }}>
                  <Stat label="Estimated man-days" value={`${estManDays}`} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Stat label="Daywork would cost" value={inr(preview.daywageBenchmarkCost)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Stat
                    label="Company saving"
                    value={`${inr(preview.companySaving)}${
                      preview.savingPct != null ? ` (${preview.savingPct}%)` : ""
                    }`}
                    color={preview.companySaving >= 0 ? "success.main" : "warning.main"}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Stat
                    label="Crew earns / man-day"
                    value={
                      preview.crewEffectiveDaily != null
                        ? inr(preview.crewEffectiveDaily)
                        : "—"
                    }
                  />
                </Grid>
              </Grid>
              {!hasActuals && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: "block" }}
                >
                  Based on the estimate. Open the Day log tab to record actuals.
                </Typography>
              )}
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Add a crew × days estimate and daily wage to see the expected saving.
            </Typography>
          )}

          {onEdit && (
            <Box sx={{ mt: 3 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => onEdit(pkg)}
              >
                Edit package
              </Button>
            </Box>
          )}
        </Box>
      )}

      {tab === 1 && (
        <TaskWorkEffortPanel packageId={pkg.id} siteId={pkg.site_id} canEdit={canEdit} />
      )}

      {tab === 2 && <TaskWorkPaymentsPanel pkg={pkg} canEdit={canEdit} />}
    </Drawer>
  );
}
