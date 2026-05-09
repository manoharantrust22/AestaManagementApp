"use client";

import React, { memo, useState, useEffect, useCallback } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import SectionAutocomplete from "../common/SectionAutocomplete";

interface ActiveSection {
  id: string;
  name: string;
  phaseName: string | null;
}

const ActiveSectionChip = memo(function ActiveSectionChip() {
  const { userProfile } = useAuth();
  const { selectedSite, refreshSites } = useSite();
  const [activeSection, setActiveSection] = useState<ActiveSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = userProfile?.role === "admin";

  const fetchActiveSection = useCallback(async () => {
    if (!selectedSite?.id) {
      setActiveSection(null);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Wrap both queries in withTimeout — without it, a stalled fetch through
      // the Cloudflare proxy (or any network hiccup) leaves `loading=true`
      // forever because the await never settles, so neither catch nor finally
      // runs. The user sees a permanent spinner in the page header until they
      // hard-refresh.
      const { data: siteData } = (await withTimeout(
        Promise.resolve(
          supabase
            .from("sites")
            .select("default_section_id")
            .eq("id", selectedSite.id)
            .single()
        ),
        TIMEOUTS.QUERY,
        "ActiveSectionChip: sites.default_section_id timed out",
      )) as { data: { default_section_id: string | null } | null };

      if (!siteData?.default_section_id) {
        setActiveSection(null);
        setLoading(false);
        return;
      }

      const { data: sectionData } = (await withTimeout(
        Promise.resolve(
          supabase
            .from("building_sections")
            .select(`
              id,
              name,
              construction_phases(name)
            `)
            .eq("id", siteData.default_section_id)
            .single()
        ),
        TIMEOUTS.QUERY,
        "ActiveSectionChip: building_sections lookup timed out",
      )) as { data: { id: string; name: string; construction_phases: { name: string } | null } | null };

      if (sectionData) {
        setActiveSection({
          id: sectionData.id,
          name: sectionData.name,
          phaseName: sectionData.construction_phases?.name || null,
        });
      } else {
        setActiveSection(null);
      }
    } catch (err) {
      console.error("Error fetching active section:", err);
      setActiveSection(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSite?.id]);

  useEffect(() => {
    fetchActiveSection();
  }, [fetchActiveSection]);

  const handleOpenDialog = () => {
    if (!isAdmin) return;
    setSelectedSectionId(activeSection?.id || null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedSectionId(null);
  };

  const handleSave = async () => {
    if (!selectedSite?.id || !isAdmin) return;

    setSaving(true);
    try {
      const supabase = createClient();

      // Note: Using type assertion until migration is run and types regenerated
      const { error } = await (supabase
        .from("sites")
        .update({ default_section_id: selectedSectionId } as any)
        .eq("id", selectedSite.id));

      if (error) throw error;

      // Refresh the active section
      await fetchActiveSection();
      await refreshSites();
      handleCloseDialog();
    } catch (err) {
      console.error("Error updating default section:", err);
    } finally {
      setSaving(false);
    }
  };

  // Don't render if no site selected
  if (!selectedSite) return null;

  // Show loading state
  if (loading) {
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
