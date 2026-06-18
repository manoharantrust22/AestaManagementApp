"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  Visibility,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import PageHeader from "@/components/layout/PageHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useTaskWorkPackages,
  useDeleteTaskWorkPackage,
} from "@/hooks/queries/useTaskWorkPackages";
import { computeProfitability } from "@/lib/taskWork/profitability";
import {
  TASK_WORK_STATUS_LABEL,
  type TaskWorkPackage,
  type TaskWorkPackageWithMeta,
  type TaskWorkStatus,
} from "@/types/taskWork.types";
import TaskWorkPackageDialog from "./TaskWorkPackageDialog";
import TaskWorkDetailDrawer from "./TaskWorkDetailDrawer";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const STATUS_COLOR: Record<TaskWorkStatus, any> = {
  draft: "default",
  active: "primary",
  on_hold: "warning",
  completed: "success",
  cancelled: "error",
};

// Company saving is the negotiation margin (estimated daywork cost − price),
// locked at agreement — so it's computed from the package's estimate fields and
// doesn't depend on logged man-days.
function estimatedSaving(pkg: TaskWorkPackage) {
  const manDays = (pkg.estimated_crew_size || 0) * (pkg.estimated_days || 0);
  return computeProfitability({
    totalValue: pkg.total_value,
    manDays,
    benchmarkDailyRate: pkg.benchmark_daily_rate,
    retentionPercent: pkg.retention_percent,
    totalUnits: pkg.pricing_mode === "rate_based" ? pkg.total_units : null,
  });
}

export default function TaskWorkContent() {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const canEdit = hasEditPermission(userProfile?.role);

  const [activeTab, setActiveTab] = useState<TaskWorkStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskWorkPackage | null>(null);
  const [detail, setDetail] = useState<TaskWorkPackageWithMeta | null>(null);

  const { data: packages = [], isLoading } = useTaskWorkPackages(
    selectedSite?.id,
    activeTab
  );
  const deleteMut = useDeleteTaskWorkPackage();

  const stats = useMemo(() => {
    const committed = packages.reduce((s, p) => s + (p.total_value || 0), 0);
    const active = packages.filter((p) => p.status === "active").length;
    const completed = packages.filter((p) => p.status === "completed").length;
    const saving = packages.reduce((s, p) => {
      const r = estimatedSaving(p);
      return s + (r.companySaving > 0 ? r.companySaving : 0);
    }, 0);
    return { count: packages.length, committed, active, completed, saving };
  }, [packages]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (pkg: TaskWorkPackage) => {
    setEditing(pkg);
    setDialogOpen(true);
  };
  const handleDelete = async (pkg: TaskWorkPackage) => {
    if (
      !confirm(
        `Delete "${pkg.title}"? This removes its day logs and payments too.`
      )
    )
      return;
    await deleteMut.mutateAsync({ id: pkg.id, siteId: pkg.site_id });
  };

  const columns = useMemo<MRT_ColumnDef<TaskWorkPackageWithMeta>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Package",
        size: isMobile ? 140 : 240,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {row.original.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.original.maistry_name || "—"}
              {row.original.category_name ? ` · ${row.original.category_name}` : ""}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "total_value",
        header: "Price",
        size: isMobile ? 90 : 130,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={700}>
            {inr(cell.getValue<number>() || 0)}
          </Typography>
        ),
      },
      {
        id: "saving",
        header: "Saving",
        size: 120,
        Cell: ({ row }) => {
          const r = estimatedSaving(row.original);
          if (r.savingPct == null) {
            return (
              <Typography variant="caption" color="text.secondary">
                —
              </Typography>
            );
          }
          return (
            <Chip
              size="small"
              variant="outlined"
              color={r.companySaving >= 0 ? "success" : "warning"}
              label={`${r.companySaving >= 0 ? "+" : ""}${r.savingPct}%`}
            />
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: isMobile ? 80 : 110,
        Cell: ({ cell }) => (
          <Chip
            size="small"
            label={TASK_WORK_STATUS_LABEL[cell.getValue<TaskWorkStatus>()]}
            color={STATUS_COLOR[cell.getValue<TaskWorkStatus>()]}
          />
        ),
      },
      {
        id: "mrt-row-actions",
        header: "",
        size: isMobile ? 110 : 150,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.25 }}>
            <IconButton size="small" onClick={() => setDetail(row.original)}>
              <Visibility fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => openEdit(row.original)}
              disabled={!canEdit}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(row.original)}
              disabled={!canEdit || deleteMut.isPending}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [isMobile, canEdit, deleteMut.isPending]
  );

  if (!selectedSite) {
    return (
      <Box>
        <PageHeader
          title="Task Work"
          subtitle="Fixed-price labour packages given to a maistry crew"
        />
        <Alert severity="info" sx={{ mt: 2 }}>
          Please select a site to view and manage task-work packages.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Task Work"
        subtitle={`Piece-rate labour packages for ${selectedSite.name}`}
        actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openNew}
            disabled={!canEdit}
            size="small"
          >
            New Task Work
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2, mt: 0.5 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Packages
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {stats.count}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Committed value
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {inr(stats.committed)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ bgcolor: "success.light" }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Saving vs daywage
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                {inr(stats.saving)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Active / Done
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {stats.active} / {stats.completed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: "16px !important" }}>
          <Tabs
            value={activeTab}
            onChange={(_e, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label="All" value="all" />
            <Tab label="Active" value="active" />
            <Tab label="On Hold" value="on_hold" />
            <Tab label="Completed" value="completed" />
            <Tab label="Draft" value="draft" />
            <Tab label="Cancelled" value="cancelled" />
          </Tabs>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={packages}
        isLoading={isLoading}
        showRecordCount
        pinnedColumns={{ left: ["title"], right: ["mrt-row-actions"] }}
      />

      <TaskWorkPackageDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        siteId={selectedSite.id}
        editing={editing}
      />

      <TaskWorkDetailDrawer
        open={!!detail}
        onClose={() => setDetail(null)}
        pkg={detail}
        onEdit={(p) => {
          setDetail(null);
          openEdit(p);
        }}
      />
    </Box>
  );
}
