"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState, useEffect } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Divider,
} from "@mui/material";
import { Add, Edit, Delete, People, PersonAdd, PersonRemove } from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import type { Database } from "@/types/database.types";
import dayjs from "dayjs";

type Team = Database["public"]["Tables"]["teams"]["Row"];
type LaborerType = string;

type TeamWithCount = Team & {
  member_count: number; // Count of laborers with associated_team_id = team.id
  work_assignment_count: number; // Count of laborers with team_id = team.id (current work)
};

interface TeamMember {
  id: string;
  name: string;
  phone: string | null;
  laborer_type: LaborerType;
  category_name: string;
  role_name: string;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [availableLaborers, setAvailableLaborers] = useState<TeamMember[]>([]);
  const [error, setError] = useState("");

  const { userProfile } = useAuth();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: "",
    leader_name: "",
    leader_phone: "",
    status: "active" as "active" | "inactive" | "completed",
  });

  const canEdit = hasEditPermission(userProfile?.role);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const { data: teamsData, error } = await supabase
        .from("teams")
        .select("*")
        .order("name");
      if (error) throw error;

      const teamsWithCount = await Promise.all(
        ((teamsData as any[]) || []).map(async (team: any) => {
          // Count laborers associated with this Mesthri's team (via associated_team_id)
          const { count: associatedCount } = await supabase
            .from("laborers")
            .select("*", { count: "exact", head: true })
            .eq("associated_team_id", team.id);

          // Count laborers currently assigned to work with this team (via team_id)
          const { count: workCount } = await supabase
            .from("laborers")
            .select("*", { count: "exact", head: true })
            .eq("team_id", team.id);

          return {
            ...team,
            member_count: associatedCount || 0,
            work_assignment_count: workCount || 0,
          };
        })
      );
      setTeams(teamsWithCount as any);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const handleOpenDialog = (team?: Team) => {
    if (team) {
      setEditingTeam(team);
      setForm({
        name: team.name,
        leader_name: team.leader_name || "",
        leader_phone: team.leader_phone || "",
        status: team.status,
      });
    } else {
      setEditingTeam(null);
      setForm({
        name: "",
        leader_name: "",
        leader_phone: "",
        status: "active",
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Team name is required");
      return;
    }
    if (!form.leader_name.trim()) {
      setError("Leader (Mesthri) name is required");
      return;
    }
    try {
      setLoading(true);
      const payload = {
        name: form.name.trim(),
        leader_name: form.leader_name.trim(),
        leader_phone: form.leader_phone.trim() || null,
        status: form.status,
      };

      const { error: writeError } = editingTeam
        ? await (supabase.from("teams") as any)
            .update(payload)
            .eq("id", editingTeam.id)
        : await (supabase.from("teams") as any).insert(payload);

      if (writeError) throw writeError;

      setDialogOpen(false);
      await fetchTeams();
    } catch (err: any) {
      setError(err.message || "Failed to save team");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, memberCount: number) => {
    if (memberCount > 0) {
      alert("Cannot delete team with members");
      return;
    }
    if (!confirm("Delete this team?")) return;
    try {
      const { error: deleteError } = await supabase
        .from("teams")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;
      await fetchTeams();
    } catch (err: any) {
      setError(err.message || "Failed to delete team");
    }
  };

  const handleOpenMembers = async (team: Team) => {
    setSelectedTeam(team);
    // Fetch laborers associated with this Mesthri's team (via associated_team_id)
    const { data: members } = await supabase
      .from("laborers")
      .select(
        `id, name, phone, laborer_type, category:labor_categories(name), role:labor_roles(name)`
      )
      .eq("associated_team_id", team.id)
      .order("name");

    // Fetch contract laborers not yet associated with any Mesthri
    const { data: available } = await supabase
      .from("laborers")
      .select(
        `id, name, phone, laborer_type, category:labor_categories(name), role:labor_roles(name)`
      )
      .is("associated_team_id", null)
      .eq("laborer_type", "contract")
      .eq("status", "active")
      .order("name");

    setTeamMembers(
      (members || []).map((m: any) => ({
        ...m,
        category_name: m.category?.name || "",
        role_name: m.role?.name || "",
      }))
    );
    setAvailableLaborers(
      (available || []).map((l: any) => ({
        ...l,
        category_name: l.category?.name || "",
        role_name: l.role?.name || "",
      }))
    );
    setMembersDialogOpen(true);
  };

  const handleAddMember = async (laborerId: string) => {
    if (!selectedTeam) return;
    const { error: updateError } = await (supabase.from("laborers") as any)
      .update({ associated_team_id: selectedTeam.id })
      .eq("id", laborerId);
    if (updateError) {
      setError(updateError.message || "Failed to add member");
      return;
    }
    await handleOpenMembers(selectedTeam);
    await fetchTeams();
  };

  const handleRemoveMember = async (laborerId: string) => {
    if (!selectedTeam) return;
    const { error: updateError } = await (supabase.from("laborers") as any)
      .update({ associated_team_id: null })
      .eq("id", laborerId);
    if (updateError) {
      setError(updateError.message || "Failed to remove member");
      return;
    }
    await handleOpenMembers(selectedTeam);
    await fetchTeams();
  };

  const columns = useMemo<MRT_ColumnDef<TeamWithCount>[]>(
    () => [
      { accessorKey: "name", header: "Team / Mesthri Name", size: 200 },
      {
        accessorKey: "leader_name",
        header: "Leader (Mesthri)",
        size: 180,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "leader_phone",
        header: "Phone",
        size: 130,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "member_count",
        header: "Team Members",
        size: 130,
        Cell: ({ cell, row }) => (
          <Tooltip title="Contract laborers associated with this Mesthri">
            <Chip
              label={`${cell.getValue<number>()} associated`}
              size="small"
              color="primary"
              variant="filled"
            />
          </Tooltip>
        ),
      },
      {
        accessorKey: "work_assignment_count",
        header: "Work Assignments",
        size: 140,
        Cell: ({ cell }) => (
          <Tooltip title="Laborers currently assigned to work with this team">
            <Chip
              label={`${cell.getValue<number>()} working`}
              size="small"
              color="info"
              variant="outlined"
            />
          </Tooltip>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<string>().toUpperCase()}
            size="small"
            color={cell.getValue<string>() === "active" ? "success" : "default"}
          />
        ),
      },
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 150,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Manage team members">
              <IconButton
                size="small"
                onClick={() => handleOpenMembers(row.original)}
              >
                <People fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(row.original)}
              disabled={!canEdit}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() =>
                handleDelete(row.original.id, row.original.member_count)
              }
              disabled={!canEdit || row.original.member_count > 0}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [canEdit]
  );

  return (
    <Box>
      <PageHeader
        title="Teams / Mesthri Groups"
        subtitle="Manage Mesthri teams and their associated contract laborers"
        actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            disabled={!canEdit}
          >
            Add Team
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <DataTable columns={columns} data={teams} isLoading={loading} />

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingTeam ? "Edit Team" : "Add Team"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <TextField
              fullWidth
              label="Team Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="Leader Name"
              value={form.leader_name}
              onChange={(e) =>
                setForm({ ...form, leader_name: e.target.value })
              }
              required
            />
            <TextField
              fullWidth
              label="Leader Phone"
              value={form.leader_phone}
              onChange={(e) =>
                setForm({ ...form, leader_phone: e.target.value })
              }
            />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as any })
                }
                label="Status"
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            {editingTeam ? "Update" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Members Dialog */}
      <Dialog
        open={membersDialogOpen}
        onClose={() => setMembersDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box>
            <Typography variant="h6" component="span">
              Mesthri&apos;s Team - {selectedTeam?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contract laborers associated with this Mesthri. Payments for these
              laborers go to the Mesthri.
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
            Associated Contract Laborers ({teamMembers.length})
          </Typography>
          <List dense>
            {teamMembers.map((m) => (
              <ListItem
                key={m.id}
                sx={{
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  mb: 0.5,
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography fontWeight={500}>{m.name}</Typography>
                      <Chip
                        label={m.laborer_type === "contract" ? "CONTRACT" : "DAILY"}
                        size="small"
                        color={m.laborer_type === "contract" ? "primary" : "warning"}
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      {m.category_name} - {m.role_name}
                      {m.phone && ` | ${m.phone}`}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Remove from Mesthri's team">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={!canEdit}
                      color="error"
                    >
                      <PersonRemove fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
            {teamMembers.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No laborers associated with this Mesthri yet
              </Typography>
            )}
          </List>

          {canEdit && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Add Contract Laborer to Team
              </Typography>
              {availableLaborers.length > 0 ? (
                <FormControl fullWidth size="small">
                  <InputLabel>Select Contract Laborer</InputLabel>
                  <Select
                    label="Select Contract Laborer"
                    onChange={(e) => handleAddMember(e.target.value as string)}
                    value=""
                  >
                    {availableLaborers.map((l) => (
                      <MenuItem key={l.id} value={l.id}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography>{l.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            ({l.category_name} - {l.role_name})
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No unassigned contract laborers available. To add laborers, first
                  create them in the Laborers page with type &quot;Contract&quot;.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMembersDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
