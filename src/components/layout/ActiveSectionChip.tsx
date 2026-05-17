"use client";

import React, { memo, useState } from "react";
import {
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  Star as StarIcon,
  Construction as ConstructionIcon,
  Edit as EditIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { wrapMutationFn, wrapQueryFn } from "@/lib/utils/timeout";
import SectionAutocomplete from "../common/SectionAutocomplete";

interface ActiveSection {
  id: string;
  name: string;
  phaseName: string | null;
}

const activeSectionQueryKey = (siteId: string | undefined) =>
  ["active-section", siteId ?? "unknown"] as const;

const ActiveSectionChip = memo(function ActiveSectionChip() {
  const { userProfile } = useAuth();
  const { selectedSite, refreshSites } = useSite();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const isAdmin = userProfile?.role === "admin";
  const siteId = selectedSite?.id;

  // One combined select via the FK relationship — supabase-js embeds the
  // related building_sections row inline, so the old two-roundtrip pattern
  // (sites → building_sections) collapses into a single request. React Query
  // takes care of aborting in-flight fetches when siteId flips, so site
  // switches can't leave a stale fetch racing the fresh one.
  const { data: activeSection = null, isPending } = useQuery<ActiveSection | null>({
    queryKey: activeSectionQueryKey(siteId),
    enabled: !!siteId,
    queryFn: wrapQueryFn<ActiveSection | null>(
      async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("sites")
          .select(
            `default_section_id,
             building_sections!sites_default_section_id_fkey(
               id,
               name,
               construction_phases(name)
             )`,
          )
          .eq("id", siteId!)
          .single();

        if (error) throw error;

        const section = (data as unknown as {
          default_section_id: string | null;
          building_sections:
            | { id: string; name: string; construction_phases: { name: string } | null }
            | null;
        } | null)?.building_sections;

        if (!section) return null;
        return {
          id: section.id,
          name: section.name,
          phaseName: section.construction_phases?.name ?? null,
        };
      },
      { operationName: "ActiveSectionChip" },
    ),
  });

  const saveMutation = useMutation({
    mutationFn: wrapMutationFn(
      async (nextSectionId: string | null) => {
        if (!siteId) throw new Error("No site selected");
        const supabase = createClient();
        const { error } = await (
          supabase.from("sites") as any
        )
          .update({ default_section_id: nextSectionId })
          .eq("id", siteId);
        if (error) throw error;
      },
      { operationName: "ActiveSectionChip.saveDefaultSection" },
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: activeSectionQueryKey(siteId),
      });
      // Keep the global SiteContext cache (selectedSite.default_section_id)
      // in sync with the new value.
      await refreshSites();
      handleCloseDialog();
    },
    onError: (err) => {
      console.error("Error updating default section:", err);
    },
  });

  const handleOpenDialog = () => {
    if (!isAdmin) return;
    setSelectedSectionId(activeSection?.id || null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedSectionId(null);
  };

  const handleSave = () => {
    if (!siteId || !isAdmin) return;
    saveMutation.mutate(selectedSectionId);
  };

  const saving = saveMutation.isPending;

  // Don't render if no site selected
  if (!selectedSite) return null;

  if (isPending && !!siteId) {
    return (
      <Box
        sx={{
          display: { xs: "none", sm: "flex" },
          alignItems: "center",
          ml: 1,
        }}
      >
        <CircularProgress size={16} />
      </Box>
    );
  }

  return (
    <>
      {/* Chip - Hidden on mobile */}
      <Tooltip
        title={
          activeSection
            ? isAdmin
              ? "Click to change default section"
              : `Current section: ${activeSection.name}`
            : isAdmin
            ? "Click to set default section"
            : "No default section set"
        }
      >
        <Chip
          icon={
            activeSection ? (
              <StarIcon sx={{ fontSize: 16, color: "#FFD700" }} />
            ) : (
              <ConstructionIcon sx={{ fontSize: 16 }} />
            )
          }
          label={
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", py: 0.25 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.2,
                  fontSize: { sm: "0.7rem", md: "0.75rem" },
                  maxWidth: { sm: 80, md: 120 },
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeSection?.name || "No Section"}
              </Typography>
              {activeSection?.phaseName && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: "0.6rem",
                    lineHeight: 1,
                    display: { sm: "none", md: "block" },
                  }}
                >
                  {activeSection.phaseName}
                </Typography>
              )}
            </Box>
          }
          onClick={isAdmin ? handleOpenDialog : undefined}
          size="small"
          variant={activeSection ? "filled" : "outlined"}
          color={activeSection ? "primary" : "default"}
          sx={{
            display: { xs: "none", sm: "flex" },
            ml: 1,
            height: "auto",
            minHeight: 28,
            cursor: isAdmin ? "pointer" : "default",
            "& .MuiChip-label": {
              px: 1,
            },
            "&:hover": isAdmin
              ? {
                  bgcolor: activeSection ? "primary.dark" : "action.hover",
                }
              : {},
          }}
        />
      </Tooltip>

      {/* Edit Dialog - Admin Only */}
      {isAdmin && (
        <Dialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 2 },
          }}
        >
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <StarIcon sx={{ color: "#FFD700" }} />
            Set Default Section
            <IconButton
              onClick={handleCloseDialog}
              sx={{ ml: "auto" }}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select the default work section for{" "}
              <strong>{selectedSite?.name}</strong>. This section will be
              auto-selected in forms like attendance.
            </Typography>

            <SectionAutocomplete
              siteId={selectedSite?.id || ""}
              value={selectedSectionId}
              onChange={setSelectedSectionId}
              autoSelectDefault={false}
              label="Default Section"
              placeholder="Select a section..."
            />
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCloseDialog} color="inherit">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} /> : <StarIcon />}
            >
              {saving ? "Saving..." : "Set as Default"}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
});

export default ActiveSectionChip;
