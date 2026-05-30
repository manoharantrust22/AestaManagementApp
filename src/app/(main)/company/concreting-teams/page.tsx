"use client";

import React, { useMemo, useState } from "react";
import { Box, Button, Chip, IconButton, Typography } from "@mui/material";
import { Add, Delete, Edit } from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useConcretingTeams,
  useDeleteConcretingTeam,
} from "@/hooks/queries/useConcretingTeams";
import ConcretingTeamDialog from "@/components/concreting/ConcretingTeamDialog";
import type { ConcretingTeam } from "@/types/concreting.types";

export default function ConcretingTeamsPage() {
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: teams = [], isLoading } = useConcretingTeams();
  const deleteTeam = useDeleteConcretingTeam();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<ConcretingTeam | null>(null);

  const handleAdd = () => {
    setEditingTeam(null);
    setDialogOpen(true);
  };

  const handleEdit = (team: ConcretingTeam) => {
    setEditingTeam(team);
    setDialogOpen(true);
  };

  const handleDelete = (team: ConcretingTeam) => {
    if (!confirm(`Remove "${team.name}" from the concreting teams list?`)) return;
    deleteTeam.mutate(team.id);
  };

  const columns = useMemo<MRT_ColumnDef<ConcretingTeam>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Team / Gang",
        Cell: ({ cell, row }) => (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {cell.getValue<string>()}
            </Typography>
            {row.original.area && (
              <Typography variant="caption" color="text.secondary">
                {row.original.area}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "contact_person",
        header: "Contact",
        Cell: ({ cell }) => cell.getValue<string>() || "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        Cell: ({ cell }) => cell.getValue<string>() || "—",
      },
      {
        accessorKey: "brings_own_machine",
        header: "Own Machine",
        size: 120,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<boolean>() ? "Yes" : "No"}
            size="small"
            color={cell.getValue<boolean>() ? "success" : "default"}
            variant="outlined"
          />
        ),
      },
      {
        accessorKey: "typical_rate",
        header: "Typical Rate",
        size: 130,
        Cell: ({ cell }) => {
          const v = cell.getValue<number | null>();
          return v != null ? (
            <Typography variant="body2" fontWeight={600}>
              ₹{v.toLocaleString("en-IN")}
            </Typography>
          ) : (
            "—"
          );
        },
      },
      {
        id: "mrt-row-actions",
        header: "",
        size: 110,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={() => handleEdit(row.original)}
              disabled={!canEdit}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(row.original)}
              disabled={!canEdit || deleteTeam.isPending}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [canEdit, deleteTeam.isPending]
  );

  return (
    <Box>
      <PageHeader
        title="Concreting Teams"
        subtitle="External concreting gangs you hire for single-day lump-sum concreting jobs"
        actions={
          canEdit ? (
            <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>
              Add Team
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        data={teams}
        isLoading={isLoading}
        pinnedColumns={{ left: ["name"], right: ["mrt-row-actions"] }}
      />

      <ConcretingTeamDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        team={editingTeam}
      />
    </Box>
  );
}
