"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tabs,
  Tab,
  LinearProgress,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
  Tooltip,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  Visibility,
  Payment as PaymentIcon,
  Calculate as CalculateIcon,
  AttachMoney as MoneyIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import type { Database } from "@/types/database.types";
import { calculateSubcontractTotals } from "@/lib/services/subcontractService";
import dayjs from "dayjs";

type Subcontract = Database["public"]["Tables"]["subcontracts"]["Row"];
type ContractType = Database["public"]["Enums"]["contract_type"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];
type MeasurementUnit = Database["public"]["Enums"]["measurement_unit"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];
type PaymentType = Database["public"]["Enums"]["contract_payment_type"];

interface SubcontractWithDetails extends Subcontract {
  team_name?: string;
  laborer_name?: string;
  site_name?: string;
  total_paid?: number;
  balance_due?: number;
  completion_percentage?: number;
  record_count?: number;
}

export default function CompanyContractsPage() {
  const { userProfile } = useAuth();
  const supabase = createClient();

  const [subcontracts, setSubcontracts] = useState<SubcontractWithDetails[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [laborers, setLaborers] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingSubcontract, setEditingSubcontract] = useState<Subcontract | null>(null);
  const [selectedSubcontract, setSelectedSubcontract] =
    useState<SubcontractWithDetails | null>(null);
  const [error, setError] = useState("");

  // Filters
  const [activeTab, setActiveTab] = useState<ContractStatus | "all">("all");

  // Form state
  const [form, setForm] = useState({
    site_id: "",
    contract_type: "mesthri" as ContractType,
    team_id: "",
    laborer_id: "",
    title: "",
    description: "",
    scope_of_work: "",
    total_value: 0,
    measurement_unit: "sqft" as MeasurementUnit,
    rate_per_unit: 0,
    total_units: 0,
    weekly_advance_rate: 0,
    start_date: dayjs().format("YYYY-MM-DD"),
    expected_end_date: "",
    status: "draft" as ContractStatus,
    is_rate_based: true, // New field to toggle between rate-based and lump sum
  });

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    payment_type: "part_payment" as PaymentType,
    amount: 0,
    payment_date: dayjs().format("YYYY-MM-DD"),
    payment_mode: "cash" as PaymentMode,
    notes: "",
  });

  const canEdit = hasEditPermission(userProfile?.role);

  // Fetch options
  useEffect(() => {
    const fetchOptions = async () => {
      const [teamsRes, laborersRes, sitesRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name")
          .eq("status", "active")
          .order("name"),
        supabase
          .from("laborers")
          .select("id, name")
          .eq("status", "active")
          .order("name"),
        supabase
          .from("sites")
          .select("id, name")
          .eq("status", "active")
          .order("name"),
      ]);

      setTeams(teamsRes.data || []);
      setLaborers(laborersRes.data || []);
      setSites(sitesRes.data || []);
      setOptionsLoaded(true);
    };

    fetchOptions();
  }, []);

  // Fetch subcontracts using shared service for consistent calculations
  const fetchSubcontracts = async () => {
    setLoading(true);
    try {
      // Note: We avoid nested joins like teams(name), laborers(name), sites(name) to prevent FK ambiguity issues
      // Teams, laborers, and sites are already fetched separately in fetchOptions
      let query = supabase
        .from("subcontracts")
        .select("*")
        .order("created_at", { ascending: false });

      if (activeTab !== "all") {
        query = query.eq("status", activeTab);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Use shared service for consistent calculation across all pages
      // totalPaid = subcontract_payments + labor_payments + cleared expenses
      const subcontractIds = (data || []).map((s: any) => s.id);
      const totalsMap = await calculateSubcontractTotals(supabase, subcontractIds);

      // Map subcontracts with their payment totals
      // Use already-fetched teams, laborers, sites arrays to look up names (avoids FK join ambiguity)
      const subcontractsWithDetails: SubcontractWithDetails[] = (data || []).map(
        (subcontract: any) => {
          const totals = totalsMap.get(subcontract.id);

          // Look up names from already-fetched arrays
          const team = teams.find((t) => t.id === subcontract.team_id);
          const laborer = laborers.find((l) => l.id === subcontract.laborer_id);
          const site = sites.find((s) => s.id === subcontract.site_id);

          return {
            ...subcontract,
            team_name: team?.name,
            laborer_name: laborer?.name,
            site_name: site?.name,
            total_paid: totals?.totalPaid || 0,
            balance_due: totals?.balance || subcontract.total_value || 0,
            completion_percentage:
              subcontract.total_value > 0
                ? ((totals?.totalPaid || 0) / subcontract.total_value) * 100
                : 0,
            record_count: totals?.totalRecordCount || 0,
          };
        }
      );

      setSubcontracts(subcontractsWithDetails);
    } catch (err: any) {
      console.error("Error fetching subcontracts:", err);
      setError("Failed to load subcontracts: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for options to be loaded before fetching subcontracts
    // since we use teams/laborers/sites arrays for name lookups
    if (optionsLoaded) {
      fetchSubcontracts();
    }
  }, [activeTab, optionsLoaded]);

  // Auto-calculate total value for rate-based contracts
  useEffect(() => {
    if (form.is_rate_based && form.rate_per_unit > 0 && form.total_units > 0) {
      const calculatedValue = form.rate_per_unit * form.total_units;
      setForm((prev) => ({
        ...prev,
        total_value: Math.round(calculatedValue * 100) / 100, // Round to 2 decimals
      }));
    }
  }, [form.is_rate_based, form.rate_per_unit, form.total_units]);

  const handleOpenDialog = (subcontract?: Subcontract) => {
    if (subcontract) {
      setEditingSubcontract(subcontract);
      const isRateBased =
        (subcontract.rate_per_unit ?? 0) > 0 && (subcontract.total_units ?? 0) > 0;
      setForm({
        site_id: subcontract.site_id || "",
        contract_type: subcontract.contract_type,
        team_id: subcontract.team_id || "",
        laborer_id: subcontract.laborer_id || "",
        title: subcontract.title,
        description: subcontract.description || "",
        scope_of_work: subcontract.scope_of_work || "",
        total_value: subcontract.total_value,
        measurement_unit: subcontract.measurement_unit || "sqft",
        rate_per_unit: subcontract.rate_per_unit || 0,
        total_units: subcontract.total_units || 0,
        weekly_advance_rate: subcontract.weekly_advance_rate || 0,
        start_date: subcontract.start_date || "",
        expected_end_date: subcontract.expected_end_date || "",
        status: subcontract.status,
        is_rate_based: isRateBased,
      });
    } else {
      setEditingSubcontract(null);
      setForm({
        site_id: "",
        contract_type: "mesthri",
        team_id: "",
        laborer_id: "",
        title: "",
        description: "",
        scope_of_work: "",
        total_value: 0,
        measurement_unit: "sqft",
        rate_per_unit: 0,
        total_units: 0,
        weekly_advance_rate: 0,
        start_date: dayjs().format("YYYY-MM-DD"),
        expected_end_date: "",
        status: "draft",
        is_rate_based: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSubcontract(null);
  };

  const handleSubmit = async () => {
    if (!userProfile) return;

    if (!form.title || form.total_value <= 0 || !form.site_id) {
      setError("Please fill in all required fields with valid values");
      return;
    }

    if (form.contract_type === "mesthri" && !form.team_id) {
      setError("Please select a team for Mesthri subcontract");
      return;
    }

    if (form.contract_type === "specialist" && !form.laborer_id) {
      setError("Please select a laborer for Specialist subcontract");
      return;
    }

    setLoading(true);
    try {
      const subcontractData = {
        site_id: form.site_id,
        contract_type: form.contract_type,
        team_id: form.contract_type === "mesthri" ? form.team_id : null,
        laborer_id:
          form.contract_type === "specialist" ? form.laborer_id : null,
        title: form.title,
        description: form.description || null,
        scope_of_work: form.scope_of_work || null,
        total_value: form.total_value,
        is_rate_based: form.is_rate_based,
        measurement_unit: form.measurement_unit,
        rate_per_unit: form.rate_per_unit || null,
        total_units: form.total_units || null,
        weekly_advance_rate: form.weekly_advance_rate || null,
        start_date: form.start_date,
        expected_end_date: form.expected_end_date || null,
        status: form.status,
      };

      if (editingSubcontract) {
        const { error } = await (supabase.from("subcontracts") as any)
          .update(subcontractData)
          .eq("id", editingSubcontract.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase.from("subcontracts") as any).insert(
          subcontractData
        );

        if (error) throw error;
      }

      await fetchSubcontracts();
      handleCloseDialog();
    } catch (err: any) {
      console.error("Error saving subcontract:", err);
      setError("Failed to save subcontract: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subcontract?")) return;

    setLoading(true);
    try {
      const { error } = await (supabase.from("subcontracts") as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      await fetchSubcontracts();
    } catch (err: any) {
      console.error("Error deleting subcontract:", err);
      setError("Failed to delete subcontract: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSubcontract = (subcontract: SubcontractWithDetails) => {
    setSelectedSubcontract(subcontract);
    setViewDialogOpen(true);
  };

  const handleOpenPaymentDialog = (subcontract: SubcontractWithDetails) => {
    setSelectedSubcontract(subcontract);
    setPaymentForm({
      payment_type: "part_payment",
      amount: 0,
      payment_date: dayjs().format("YYYY-MM-DD"),
      payment_mode: "cash",
      notes: "",
    });
    setPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedSubcontract || !userProfile) return;

    if (paymentForm.amount <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (paymentForm.amount > (selectedSubcontract.balance_due || 0)) {
      setError("Payment amount cannot exceed balance due");
      return;
    }

    setLoading(true);
    try {
      const { error } = await (
        supabase.from("subcontract_payments") as any
      ).insert({
        // Column is contract_id (NOT subcontract_id) on subcontract_payments.
        contract_id: selectedSubcontract.id,
        payment_type: paymentForm.payment_type,
        amount: paymentForm.amount,
        payment_date: paymentForm.payment_date,
        payment_mode: paymentForm.payment_mode,
        paid_by: userProfile.id,
        // Column is comments (NOT notes) on subcontract_payments.
        comments: paymentForm.notes || null,
      });

      if (error) throw error;

      // Update subcontract status if fully paid
      const newTotalPaid =
        (selectedSubcontract.total_paid || 0) + paymentForm.amount;
      if (newTotalPaid >= selectedSubcontract.total_value) {
        await (supabase.from("subcontracts") as any)
          .update({ status: "completed" })
          .eq("id", selectedSubcontract.id);
      }

      await fetchSubcontracts();
      setPaymentDialogOpen(false);
      setSelectedSubcontract(null);
    } catch (err: any) {
      console.error("Error recording payment:", err);
      setError("Failed to record payment: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: ContractStatus): any => {
    const colorMap: Record<ContractStatus, any> = {
      draft: "default",
      active: "primary",
      on_hold: "warning",
      completed: "success",
      cancelled: "error",
    };
    return colorMap[status];
  };

  const columns = useMemo<MRT_ColumnDef<SubcontractWithDetails>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Subcontract Title",
        size: 200,
        Cell: ({ cell, row }) => (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {cell.getValue<string>()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.original.contract_type === "mesthri"
                ? row.original.team_name
                : row.original.contract_type === "day_work"
                ? row.original.contractor_name
                : row.original.laborer_name}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "site_name",
        header: "Site",
        size: 150,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "contract_type",
        header: "Type",
        size: 110,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<string>().toUpperCase()}
            size="small"
            color={
              cell.getValue<string>() === "mesthri" ? "primary" : "secondary"
            }
          />
        ),
      },
      {
        accessorKey: "total_value",
        header: "Subcontract Value",
        size: 140,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={700}>
            ₹{cell.getValue<number>().toLocaleString()}
          </Typography>
        ),
      },
      {
        accessorKey: "total_paid",
        header: "Paid",
        size: 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={600} color="success.main">
            ₹{(cell.getValue<number>() || 0).toLocaleString()}
          </Typography>
        ),
      },
      {
        accessorKey: "balance_due",
        header: "Balance",
        size: 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={600} color="error.main">
            ₹{(cell.getValue<number>() || 0).toLocaleString()}
          </Typography>
        ),
      },
      {
        accessorKey: "completion_percentage",
        header: "Progress",
        size: 130,
        Cell: ({ cell }) => {
          const percentage = cell.getValue<number>() || 0;
          return (
            <Box sx={{ width: "100%" }}>
              <Typography variant="caption">
                {percentage.toFixed(0)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(percentage, 100)}
                color={
                  percentage >= 100
                    ? "success"
                    : percentage >= 50
                    ? "primary"
                    : "warning"
                }
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Box>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<string>().toUpperCase()}
            size="small"
            color={getStatusColor(cell.getValue<ContractStatus>())}
          />
        ),
      },
      {
        accessorKey: "is_rate_based",
        header: "Value Type",
        size: 130,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<boolean>() ? "Rate-Based" : "Lump Sum"}
            size="small"
            color={cell.getValue<boolean>() ? "primary" : "secondary"}
            variant="outlined"
          />
        ),
      },
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 180,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => handleViewSubcontract(row.original)}
            >
              <Visibility fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(row.original)}
              disabled={!canEdit || loading}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenPaymentDialog(row.original)}
              disabled={
                !canEdit || loading || row.original.status === "completed"
              }
            >
              <PaymentIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(row.original.id)}
              disabled={!canEdit || loading}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [canEdit, loading]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const total = subcontracts.reduce((sum, c) => sum + c.total_value, 0);
    const paid = subcontracts.reduce((sum, c) => sum + (c.total_paid || 0), 0);
    const due = subcontracts.reduce((sum, c) => sum + (c.balance_due || 0), 0);
    const active = subcontracts.filter((c) => c.status === "active").length;
    const completed = subcontracts.filter((c) => c.status === "completed").length;
    const recordCount = subcontracts.reduce(
      (sum, c) => sum + (c.record_count || 0),
      0
    );

    return { total, paid, due, active, completed, count: subcontracts.length, recordCount };
  }, [subcontracts]);

  return (
    <Box>
      <PageHeader
        title="All Subcontracts Overview"
        subtitle="View all subcontracts across all sites (manage from Site > Subcontracts)"
        actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            disabled={!canEdit}
          >
            New Subcontract
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Total Subcontracts
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.count}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Subcontract Value
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                ₹{stats.total.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "success.light" }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Total Paid
              </Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">
                ₹{stats.paid.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "error.light" }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Balance Due
              </Typography>
              <Typography variant="h5" fontWeight={700} color="error.main">
                ₹{stats.due.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Payment Records
              </Typography>
              <Typography variant="h5" fontWeight={700} color="info.main">
                {stats.recordCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Active / Completed
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {stats.active} / {stats.completed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "16px !important" }}>
          <Tabs
            value={activeTab}
            onChange={(e, newValue) => setActiveTab(newValue)}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label="All" value="all" />
            <Tab label="Draft" value="draft" />
            <Tab label="Active" value="active" />
            <Tab label="Completed" value="completed" />
            <Tab label="Cancelled" value="cancelled" />
          </Tabs>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={subcontracts} isLoading={loading} showRecordCount />

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingSubcontract ? "Edit Subcontract" : "New Subcontract"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <FormControl fullWidth required>
              <InputLabel>Site</InputLabel>
              <Select
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                label="Site"
              >
                {sites.map((site) => (
                  <MenuItem key={site.id} value={site.id}>
                    {site.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth required>
                  <InputLabel>Contract Type</InputLabel>
                  <Select
                    value={form.contract_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contract_type: e.target.value as ContractType,
                      })
                    }
                    label="Contract Type"
                  >
                    <MenuItem value="mesthri">Mesthri (Team Based)</MenuItem>
                    <MenuItem value="specialist">
                      Specialist (Individual)
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                {form.contract_type === "mesthri" ? (
                  <FormControl fullWidth required>
                    <InputLabel>Team</InputLabel>
                    <Select
                      value={form.team_id}
                      onChange={(e) =>
                        setForm({ ...form, team_id: e.target.value })
                      }
                      label="Team"
                    >
                      {teams.map((team) => (
                        <MenuItem key={team.id} value={team.id}>
                          {team.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <FormControl fullWidth required>
                    <InputLabel>Laborer</InputLabel>
                    <Select
                      value={form.laborer_id}
                      onChange={(e) =>
                        setForm({ ...form, laborer_id: e.target.value })
                      }
                      label="Laborer"
                    >
                      {laborers.map((laborer) => (
                        <MenuItem key={laborer.id} value={laborer.id}>
                          {laborer.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Grid>
            </Grid>

            <TextField
              fullWidth
              label="Contract Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="e.g., Plastering Work - Ground Floor"
            />

            <TextField
              fullWidth
              label="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              multiline
              rows={2}
            />

            <TextField
              fullWidth
              label="Scope of Work"
              value={form.scope_of_work}
              onChange={(e) =>
                setForm({ ...form, scope_of_work: e.target.value })
              }
              multiline
              rows={3}
            />

            <Divider sx={{ my: 2 }} />

            {/* Contract Value Type Toggle */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
                sx={{ mb: 1.5 }}
              >
                Contract Value Type
              </Typography>
              <ToggleButtonGroup
                value={form.is_rate_based ? "rate" : "lumpsum"}
                exclusive
                onChange={(e, value) => {
                  if (value !== null) {
                    setForm({
                      ...form,
                      is_rate_based: value === "rate",
                      total_value: value === "rate" ? 0 : form.total_value,
                      rate_per_unit: value === "rate" ? form.rate_per_unit : 0,
                      total_units: value === "rate" ? form.total_units : 0,
                    });
                  }
                }}
                fullWidth
                sx={{
                  "& .MuiToggleButton-root": {
                    py: 1.5,
                    textTransform: "none",
                    fontWeight: 500,
                  },
                  "& .Mui-selected": {
                    backgroundColor: "primary.main",
                    color: "white",
                    "&:hover": {
                      backgroundColor: "primary.dark",
                    },
                  },
                }}
              >
                <ToggleButton value="rate">
                  <CalculateIcon sx={{ mr: 1, fontSize: 20 }} />
                  Rate-Based (Per Unit)
                </ToggleButton>
                <ToggleButton value="lumpsum">
                  <MoneyIcon sx={{ mr: 1, fontSize: 20 }} />
                  Lump Sum Contract
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Rate-Based Contract Fields */}
            {form.is_rate_based ? (
              <>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Measurement Unit</InputLabel>
                      <Select
                        value={form.measurement_unit}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            measurement_unit: e.target.value as MeasurementUnit,
                          })
                        }
                        label="Measurement Unit"
                      >
                        <MenuItem value="sqft">Square Feet (sqft)</MenuItem>
                        <MenuItem value="rft">Running Feet (rft)</MenuItem>
                        <MenuItem value="nos">Numbers (nos)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Rate per Unit"
                      type="number"
                      value={form.rate_per_unit || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rate_per_unit: Number(e.target.value),
                        })
                      }
                      required
                      slotProps={{
                        input: {
                          startAdornment: "₹",
                        },
                      }}
                    />
                  </Grid>
                </Grid>

                <TextField
                  fullWidth
                  label={`Total Units (${form.measurement_unit})`}
                  type="number"
                  value={form.total_units || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      total_units: Number(e.target.value),
                    })
                  }
                  required
                  slotProps={{
                    input: {
                      endAdornment: form.measurement_unit,
                    },
                  }}
                />

                {/* Calculated Total Value Display */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    bgcolor: "primary.50",
                    border: "2px solid",
                    borderColor: "primary.main",
                    borderRadius: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total Contract Value
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {form.rate_per_unit > 0 && form.total_units > 0 ? (
                          <>
                            ₹{form.rate_per_unit.toLocaleString()} ×{" "}
                            {form.total_units.toLocaleString()}{" "}
                            {form.measurement_unit}
                          </>
                        ) : (
                          "Enter rate and units to calculate"
                        )}
                      </Typography>
                    </Box>
                    <Typography
                      variant="h5"
                      fontWeight={700}
                      color="primary.main"
                    >
                      ₹{form.total_value.toLocaleString()}
                    </Typography>
                  </Box>
                </Paper>
              </>
            ) : (
              /* Lump Sum Contract Fields */
              <TextField
                fullWidth
                label="Total Contract Value"
                type="number"
                value={form.total_value || ""}
                onChange={(e) =>
                  setForm({ ...form, total_value: Number(e.target.value) })
                }
                required
                slotProps={{
                  input: {
                    startAdornment: "₹",
                  },
                }}
                helperText="Enter the fixed contract amount"
              />
            )}

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Start Date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm({ ...form, start_date: e.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Expected End Date"
                  type="date"
                  value={form.expected_end_date}
                  onChange={(e) =>
                    setForm({ ...form, expected_end_date: e.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
            </Grid>

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as ContractStatus })
                }
                label="Status"
              >
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            {editingSubcontract ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Subcontract Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Subcontract Details</DialogTitle>
        <DialogContent>
          {selectedSubcontract && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
            >
              <Box>
                <Typography variant="h6" gutterBottom>
                  {selectedSubcontract.title}
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Chip
                    label={selectedSubcontract.status.toUpperCase()}
                    color={getStatusColor(selectedSubcontract.status)}
                    size="small"
                  />
                  <Chip
                    label={selectedSubcontract.site_name}
                    variant="outlined"
                    size="small"
                  />
                </Box>
              </Box>

              <Divider />

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    Subcontract Type
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedSubcontract.contract_type.toUpperCase()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    {selectedSubcontract.contract_type === "mesthri"
                      ? "Team"
                      : selectedSubcontract.contract_type === "day_work"
                      ? "Concreting Team"
                      : "Laborer"}
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedSubcontract.contract_type === "mesthri"
                      ? selectedSubcontract.team_name
                      : selectedSubcontract.contract_type === "day_work"
                      ? selectedSubcontract.contractor_name
                      : selectedSubcontract.laborer_name}
                  </Typography>
                </Grid>
              </Grid>

              {selectedSubcontract.description && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {selectedSubcontract.description}
                  </Typography>
                </Box>
              )}

              <Divider />

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Subcontract Value
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    ₹{selectedSubcontract.total_value.toLocaleString()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Paid
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    ₹{(selectedSubcontract.total_paid || 0).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Balance
                  </Typography>
                  <Typography variant="h6" color="error.main">
                    ₹{(selectedSubcontract.balance_due || 0).toLocaleString()}
                  </Typography>
                </Grid>
              </Grid>

              <LinearProgress
                variant="determinate"
                value={Math.min(
                  selectedSubcontract.completion_percentage || 0,
                  100
                )}
                color={
                  (selectedSubcontract.completion_percentage || 0) >= 100
                    ? "success"
                    : "primary"
                }
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          {canEdit &&
            selectedSubcontract &&
            selectedSubcontract.status !== "completed" && (
              <Button
                variant="contained"
                startIcon={<PaymentIcon />}
                onClick={() => {
                  setViewDialogOpen(false);
                  handleOpenPaymentDialog(selectedSubcontract);
                }}
              >
                Record Payment
              </Button>
            )}
        </DialogActions>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent>
          {selectedSubcontract && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}
            >
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>{selectedSubcontract.title}</strong>
                </Typography>
                <Typography variant="caption">
                  Balance Due: ₹
                  {(selectedSubcontract.balance_due || 0).toLocaleString()}
                </Typography>
              </Alert>

              <FormControl fullWidth>
                <InputLabel>Payment Type</InputLabel>
                <Select
                  value={paymentForm.payment_type}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_type: e.target.value as PaymentType,
                    })
                  }
                  label="Payment Type"
                >
                  <MenuItem value="weekly_advance">Weekly Advance</MenuItem>
                  <MenuItem value="part_payment">Part Payment</MenuItem>
                  <MenuItem value="milestone">Milestone Payment</MenuItem>
                  <MenuItem value="final_settlement">Final Settlement</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={paymentForm.amount || ""}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    amount: Number(e.target.value),
                  })
                }
                required
                slotProps={{ input: { startAdornment: "₹" } }}
              />

              <TextField
                fullWidth
                label="Payment Date"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    payment_date: e.target.value,
                  })
                }
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />

              <FormControl fullWidth>
                <InputLabel>Payment Mode</InputLabel>
                <Select
                  value={paymentForm.payment_mode}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_mode: e.target.value as PaymentMode,
                    })
                  }
                  label="Payment Mode"
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Notes"
                value={paymentForm.notes}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, notes: e.target.value })
                }
                multiline
                rows={2}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRecordPayment}
            variant="contained"
            disabled={loading}
          >
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
