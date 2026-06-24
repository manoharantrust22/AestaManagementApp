"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";

interface SelectedLaborer {
  laborerId: string;
  workDays: number;
  dailyRate: number;
}

interface LaborerData {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  team_id: string | null;
  team_name: string | null;
  daily_rate: number;
  laborer_type: string;
  language: string;
}

interface LaborerSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  selectedLaborers: Map<string, SelectedLaborer>;
  onConfirm: (selected: Map<string, SelectedLaborer>) => void;
  /** When set, only labourers whose id is in this set are shown (trade-scoped roster). */
  allowedLaborerIds?: Set<string>;
}

export default function LaborerSelectionDialog({
  open,
  onClose,
  siteId,
  selectedLaborers,
  onConfirm,
  allowedLaborerIds,
}: LaborerSelectionDialogProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [laborers, setLaborers] = useState<LaborerData[]>([]);
  const [localSelected, setLocalSelected] = useState<Map<string, SelectedLaborer>>(new Map());

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");

  // Initialize local state with pre-selected laborers
  useEffect(() => {
    if (open) {
      setLocalSelected(new Map(selectedLaborers));
      fetchLaborers();
    }
  }, [open]);

  const fetchLaborers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("laborers")
        .select(
          `
          id,
          name,
          category_id,
          daily_rate,
          team_id,
          laborer_type,
          language,
          labor_categories(name),
          team:teams!laborers_team_id_fkey(name)
        `
        )
        .eq("status", "active")
        .order("name");

      if (error) throw error;

      const mappedLaborers: LaborerData[] = (data || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        category_id: l.category_id,
        category_name: l.labor_categories?.name || "Unknown",
        team_id: l.team_id,
        team_name: l.team?.name || null,
        daily_rate: l.daily_rate,
        laborer_type: l.laborer_type || "daily_market",
        language: l.language || "Tamil",
      }));

      setLaborers(mappedLaborers);
    } catch (error: any) {
      console.error("Error fetching laborers:", error);
      alert("Failed to load laborers: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter laborers based on search and filters
  const filteredLaborers = useMemo(() => {
    return laborers.filter((laborer) => {
      // Trade-scope filter: when allowedLaborerIds is set, only show those labourers
      if (allowedLaborerIds && !allowedLaborerIds.has(laborer.id)) return false;

      const matchesSearch =
        searchQuery === "" ||
        laborer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        laborer.category_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (laborer.team_name?.toLowerCase() || "").includes(searchQuery.toLowerCase());

      const matchesCategory =
        categoryFilter === "all" || laborer.category_id === categoryFilter;

      const matchesTeam =
        teamFilter === "all" ||
        (teamFilter === "no_team" && !laborer.team_id) ||
        laborer.team_id === teamFilter;

      const matchesLanguage =
        languageFilter === "all" || laborer.language === languageFilter;

      return matchesSearch && matchesCategory && matchesTeam && matchesLanguage;
    });
  }, [laborers, searchQuery, categoryFilter, teamFilter, languageFilter, allowedLaborerIds]);

  // Get unique categories and teams for filters
  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(laborers.map((l) => ({ id: l.category_id, name: l.category_name })).map(c => JSON.stringify(c)))
    ).map(str => JSON.parse(str));
    return uniqueCategories;
  }, [laborers]);

  const teams = useMemo(() => {
    const uniqueTeams = Array.from(
      new Set(
        laborers
          .filter((l) => l.team_id)
          .map((l) => ({ id: l.team_id!, name: l.team_name! }))
          .map(t => JSON.stringify(t))
      )
    ).map(str => JSON.parse(str));
    return uniqueTeams;
  }, [laborers]);

  // Handle checkbox toggle
  const handleToggle = (laborer: LaborerData) => {
    const newSelected = new Map(localSelected);
    if (newSelected.has(laborer.id)) {
      newSelected.delete(laborer.id);
    } else {
      newSelected.set(laborer.id, {
        laborerId: laborer.id,
        workDays: 1,
        dailyRate: laborer.daily_rate,
      });
    }
    setLocalSelected(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    const newSelected = new Map(localSelected);
    filteredLaborers.forEach((laborer) => {
      if (!newSelected.has(laborer.id)) {
        newSelected.set(laborer.id, {
          laborerId: laborer.id,
          workDays: 1,
          dailyRate: laborer.daily_rate,
        });
      }
    });
    setLocalSelected(newSelected);
  };

  // Handle deselect all
  const handleDeselectAll = () => {
    setLocalSelected(new Map());
  };

  // Handle select all Hindi laborers
  const handleSelectAllHindi = () => {
    const newSelected = new Map(localSelected);
    laborers
      .filter((laborer) => laborer.language === "Hindi")
      .forEach((laborer) => {
        if (!newSelected.has(laborer.id)) {
          newSelected.set(laborer.id, {
            laborerId: laborer.id,
            workDays: 1,
            dailyRate: laborer.daily_rate,
          });
        }
      });
    setLocalSelected(newSelected);
  };

  // Calculate summary (daily rate total - work days applied in AttendanceDrawer)
  const summary = useMemo(() => {
    let totalDailyRate = 0;
    localSelected.forEach((s) => {
      totalDailyRate += s.dailyRate;
    });
    return {
      count: localSelected.size,
      totalDailyRate,
    };
  }, [localSelected]);

  // Define columns
  const columns = useMemo<MRT_ColumnDef<LaborerData>[]>(
    () => [
      {
        id: "select",
        header: "Select",
        size: 60,
        Cell: ({ row }) => (
          <input
            type="checkbox"
            checked={localSelected.has(row.original.id)}
            onChange={() => handleToggle(row.original)}
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        size: 180,
      },
      {
        accessorKey: "category_name",
        header: "Category",
        size: 120,
      },
      {
        accessorKey: "team_name",
        header: "Team",
        size: 120,
        Cell: ({ cell }) => cell.getValue<string>() || <Chip label="No Team" size="small" variant="outlined" />,
      },
      {
        accessorKey: "daily_rate",
        header: "Daily Rate",
        size: 100,
        Cell: ({ cell }) => `₹${cell.getValue<number>().toLocaleString()}`,
      },
      {
        id: "selected_indicator",
        header: "",
        size: 80,
        Cell: ({ row }) => {
          const isSelected = localSelected.has(row.original.id);
          if (!isSelected) return null;
          return (
            <Chip label="Selected" size="small" color="primary" variant="outlined" />
          );
        },
      },
    ],
    [localSelected]
  );

  const handleConfirm = () => {
    onConfirm(localSelected);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: "80vh",
          maxHeight: "90vh",
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" component="span" fontWeight={600}>
            Select Laborers
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Filters and Search */}
        <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            size="small"
            placeholder="Search by name, category, or team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flex: 1, minWidth: 250 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Category"
            >
              <MenuItem value="all">All Categories</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Team</InputLabel>
            <Select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              label="Team"
            >
              <MenuItem value="all">All Teams</MenuItem>
              <MenuItem value="no_team">No Team</MenuItem>
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Language</InputLabel>
            <Select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              label="Language"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="Hindi">Hindi</MenuItem>
              <MenuItem value="Tamil">Tamil</MenuItem>
            </Select>
          </FormControl>

          <Button variant="contained" size="small" onClick={handleSelectAllHindi} color="info">
            + All Hindi
          </Button>
          <Button variant="outlined" size="small" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="outlined" size="small" onClick={handleDeselectAll} color="error">
            Clear All
          </Button>
        </Box>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredLaborers}
          isLoading={loading}
          enablePagination
          enableSorting
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, bgcolor: "action.hover" }}>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="body2" fontWeight={600}>
            {summary.count} laborer{summary.count !== 1 ? "s" : ""} selected
          </Typography>
          <Typography variant="body2" color="text.secondary">
            •
          </Typography>
          <Typography variant="body2" fontWeight={700} color="success.main">
            Rate Total: ₹{summary.totalDailyRate.toLocaleString()}/day
          </Typography>
        </Box>

        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={summary.count === 0}
        >
          Add Selected ({summary.count})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
