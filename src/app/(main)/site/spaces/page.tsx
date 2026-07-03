"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Add as AddIcon, SquareFoot as SpacesIcon } from "@mui/icons-material";

import { useSelectedSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useDeleteSpace,
  useSetFloorPlan,
  useSpaceFloorPlans,
  useSpaces,
  useSpaceSections,
  useUpdateSpace,
  useVerifySpaceDimensions,
} from "@/hooks/queries/useSpaces";
import { rollupTotals } from "@/lib/spaces/measurements";
import type { MeasureMode, Space } from "@/types/spaces.types";

import FloorGroup from "@/components/spaces/FloorGroup";
import SpaceDetailContent from "@/components/spaces/SpaceDetailContent";
import SpaceDetailSheet from "@/components/spaces/SpaceDetailSheet";
import SpaceDialog from "@/components/spaces/SpaceDialog";
import SpaceRow from "@/components/spaces/SpaceRow";
import SpacesTotalsStrip from "@/components/spaces/SpacesTotalsStrip";

const UNASSIGNED = "__unassigned__";

export default function SpacesPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { selectedSite } = useSelectedSite();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);
  const siteId = selectedSite?.id;

  const { data: spaces = [], isLoading } = useSpaces(siteId);
  const { data: sections = [] } = useSpaceSections(siteId);
  const { data: floorPlans = [] } = useSpaceFloorPlans(siteId);
  const updateSpace = useUpdateSpace();
  const deleteSpace = useDeleteSpace();
  const verifyDimensions = useVerifySpaceDimensions();
  const setFloorPlan = useSetFloorPlan();

  const [mode, setMode] = useState<MeasureMode>("drawing");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetSpaceId, setSheetSpaceId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSectionId, setDialogSectionId] = useState<string | null>(null);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);

  const totals = useMemo(() => rollupTotals(spaces, mode), [spaces, mode]);

  const sectionNames = useMemo(() => {
    const map = new Map<string | null, string>();
    for (const s of sections) map.set(s.id, s.name);
    map.set(null, "Unassigned");
    return map;
  }, [sections]);

  const plansBySection = useMemo(() => {
    const map = new Map<string, (typeof floorPlans)[number]>();
    for (const p of floorPlans) map.set(p.section_id, p);
    return map;
  }, [floorPlans]);

  // Floors in sequence order, plus an Unassigned group when needed. Floors
  // with no spaces still render so their plan can be attached up front.
  const groups = useMemo(() => {
    const bySection = new Map<string, Space[]>();
    for (const space of spaces) {
      const key = space.section_id ?? UNASSIGNED;
      const arr = bySection.get(key) ?? [];
      arr.push(space);
      bySection.set(key, arr);
    }
    const result = sections.map((s) => ({
      sectionId: s.id as string | null,
      name: s.name,
      spaces: bySection.get(s.id) ?? [],
    }));
    if (bySection.has(UNASSIGNED)) {
      result.push({
        sectionId: null,
        name: "Unassigned",
        spaces: bySection.get(UNASSIGNED)!,
      });
    }
    return result;
  }, [sections, spaces]);

  const sheetSpace = spaces.find((s) => s.id === sheetSpaceId) ?? null;

  if (!selectedSite || !siteId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Select a site from the top bar to see its spaces.
        </Alert>
      </Box>
    );
  }

  const openCreate = (sectionId: string | null) => {
    setEditingSpace(null);
    setDialogSectionId(sectionId);
    setDialogOpen(true);
  };

  const openEdit = (space: Space) => {
    setEditingSpace(space);
    setDialogSectionId(space.section_id);
    setDialogOpen(true);
  };

  const handleDelete = (space: Space) => {
    if (
      window.confirm(
        `Delete "${space.name}"? Its measurements and photos are removed from the register.`
      )
    ) {
      deleteSpace.mutate({ id: space.id, siteId });
      setSheetSpaceId(null);
      setExpandedId(null);
    }
  };

  const detailFor = (space: Space) => (
    <SpaceDetailContent
      space={space}
      mode={mode}
      canEdit={canEdit}
      saving={updateSpace.isPending || verifyDimensions.isPending}
      onEdit={() => openEdit(space)}
      onDelete={() => handleDelete(space)}
      onSaveOverrides={(overrides) =>
        updateSpace.mutate({ id: space.id, siteId, updates: { overrides } })
      }
      onSavePhotos={(photos) =>
        updateSpace.mutate({ id: space.id, siteId, updates: { photos } })
      }
      onVerify={(dims) =>
        verifyDimensions.mutate({ id: space.id, siteId, ...dims })
      }
    />
  );

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <SpacesIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Spaces
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Room dimensions & tile / skirting / granite quantities — verified
            against the drawing.
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => openCreate(sections[0]?.id ?? null)}
          >
            Add space
          </Button>
        )}
      </Stack>

      <SpacesTotalsStrip
        totals={totals}
        mode={mode}
        onModeChange={setMode}
        siteName={selectedSite.name}
        sectionNames={sectionNames}
      />

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : spaces.length === 0 && sections.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No floors defined yet. Add building sections (Ground Floor, First
          Floor…) in Site Settings, then add each room here.
        </Alert>
      ) : (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {groups.map((group) => (
            <FloorGroup
              key={group.sectionId ?? UNASSIGNED}
              floorName={group.name}
              siteId={siteId}
              sectionId={group.sectionId}
              plan={
                group.sectionId
                  ? plansBySection.get(group.sectionId)?.plan ?? null
                  : null
              }
              subtotals={totals.bySection.get(group.sectionId)}
              spaceCount={group.spaces.length}
              canEdit={canEdit}
              onAddSpace={openCreate}
              onSetPlan={(sectionId, plan) =>
                setFloorPlan.mutate({ siteId, sectionId, plan })
              }
            >
              {group.spaces.length === 0 ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", px: 2, py: 1.5 }}
                >
                  No spaces on this floor yet.
                </Typography>
              ) : (
                group.spaces.map((space) => (
                  <SpaceRow
                    key={space.id}
                    space={space}
                    mode={mode}
                    expanded={!isMobile && expandedId === space.id}
                    onToggle={() =>
                      isMobile
                        ? setSheetSpaceId(space.id)
                        : setExpandedId((id) => (id === space.id ? null : space.id))
                    }
                  >
                    {!isMobile ? detailFor(space) : undefined}
                  </SpaceRow>
                ))
              )}
            </FloorGroup>
          ))}
        </Stack>
      )}

      <SpaceDetailSheet
        space={sheetSpace}
        open={!!sheetSpace}
        onClose={() => setSheetSpaceId(null)}
      >
        {sheetSpace && detailFor(sheetSpace)}
      </SpaceDetailSheet>

      <SpaceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        siteId={siteId}
        defaultSectionId={dialogSectionId}
        editing={editingSpace}
      />
    </Box>
  );
}
