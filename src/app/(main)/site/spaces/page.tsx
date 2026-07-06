"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  AutoAwesome as ImportIcon,
  GridOn as TilesIcon,
  MapOutlined as PlansIcon,
  SquareFoot as SpacesIcon,
} from "@mui/icons-material";

import { useSelectedSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useDeleteSpace,
  useSpaceFloorPlans,
  useSpaces,
  useSpaceSections,
  useTileOptions,
  useUpdateSpace,
  useUpsertFloorMeta,
  useVerifySpaceDimensions,
} from "@/hooks/queries/useSpaces";
import { rollupTotals } from "@/lib/spaces/measurements";
import { pickDefaultFloorSectionId } from "@/lib/spaces/floors";
import type { MeasureMode, Space } from "@/types/spaces.types";

import FloorGroup from "@/components/spaces/FloorGroup";
import FloorPlansDialog from "@/components/spaces/FloorPlansDialog";
import SpaceDetailContent from "@/components/spaces/SpaceDetailContent";
import SpaceDetailSheet from "@/components/spaces/SpaceDetailSheet";
import SpaceDialog from "@/components/spaces/SpaceDialog";
import SpaceRow from "@/components/spaces/SpaceRow";
import SpacesImportDialog from "@/components/spaces/SpacesImportDialog";
import SpacesTotalsStrip from "@/components/spaces/SpacesTotalsStrip";
import TileOptionsManager from "@/components/spaces/TileOptionsManager";

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
  const { data: tileOptions = [] } = useTileOptions(siteId);
  const updateSpace = useUpdateSpace();
  const deleteSpace = useDeleteSpace();
  const verifyDimensions = useVerifySpaceDimensions();
  const upsertFloorMeta = useUpsertFloorMeta();

  const [mode, setMode] = useState<MeasureMode>("drawing");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetSpaceId, setSheetSpaceId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSectionId, setDialogSectionId] = useState<string | null>(null);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [floorPlansOpen, setFloorPlansOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tilesOpen, setTilesOpen] = useState(false);

  const knownSectionIds = useMemo(
    () => new Set(sections.map((s) => s.id)),
    [sections]
  );

  const totals = useMemo(
    () => rollupTotals(spaces, mode, knownSectionIds),
    [spaces, mode, knownSectionIds]
  );

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

  const builtUpBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of floorPlans) {
      if (p.built_area_sqft) map.set(p.section_id, p.built_area_sqft);
    }
    return map;
  }, [floorPlans]);

  // Floors in sequence order, plus an Unassigned group when needed.
  // building_sections doubles as a work-phase list on some sites (Plinth,
  // Plastering, Electrical…), so only sections that actually hold a space
  // or a floor plan render as groups — every section stays reachable via
  // the floor picker in the Add-space dialog. A "typical" space renders
  // under its primary floor AND every mirrored floor.
  const groups = useMemo(() => {
    const bySection = new Map<string, Space[]>();
    const push = (key: string, space: Space) => {
      const arr = bySection.get(key) ?? [];
      arr.push(space);
      bySection.set(key, arr);
    };
    for (const space of spaces) {
      push(space.section_id ?? UNASSIGNED, space);
      for (const mid of new Set(space.mirrored_section_ids ?? [])) {
        if (mid !== space.section_id && knownSectionIds.has(mid)) {
          push(mid, space);
        }
      }
    }
    const result = sections
      .filter((s) => bySection.has(s.id) || plansBySection.has(s.id))
      .map((s) => ({
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
  }, [sections, spaces, plansBySection, knownSectionIds]);

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
      tileOptions={tileOptions}
      onEdit={() => openEdit(space)}
      onDelete={() => handleDelete(space)}
      onSaveOverrides={(overrides) =>
        updateSpace.mutate({ id: space.id, siteId, updates: { overrides } })
      }
      onSavePhotos={(photos) =>
        updateSpace.mutate({ id: space.id, siteId, updates: { photos } })
      }
      onUpdate={(updates) =>
        updateSpace.mutate({ id: space.id, siteId, updates })
      }
      onManageTileOptions={() => setTilesOpen(true)}
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
        {isMobile ? (
          <>
            {canEdit && (
              <IconButton
                aria-label="import from plan"
                onClick={() => setImportOpen(true)}
              >
                <ImportIcon />
              </IconButton>
            )}
            <IconButton
              aria-label="tile options"
              onClick={() => setTilesOpen(true)}
            >
              <TilesIcon />
            </IconButton>
            <IconButton
              aria-label="floor plans"
              onClick={() => setFloorPlansOpen(true)}
            >
              <PlansIcon />
            </IconButton>
          </>
        ) : (
          <>
            {canEdit && (
              <Button
                variant="outlined"
                startIcon={<ImportIcon />}
                onClick={() => setImportOpen(true)}
              >
                Import from plan
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<TilesIcon />}
              onClick={() => setTilesOpen(true)}
            >
              Tiles
            </Button>
            <Button
              variant="outlined"
              startIcon={<PlansIcon />}
              onClick={() => setFloorPlansOpen(true)}
            >
              Floor plans
            </Button>
          </>
        )}
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() =>
              openCreate(pickDefaultFloorSectionId(sections, spaces))
            }
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
        builtUpBySection={builtUpBySection}
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
      ) : groups.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No spaces yet. Tap <strong>Add space</strong> to enter rooms one by
          one, or <strong>Import from plan</strong> to bulk-add every room
          from the drawing via AI. Attach drawings under{" "}
          <strong>Floor plans</strong>. Tile, skirting and granite quantities
          compute automatically.
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
                upsertFloorMeta.mutate({ siteId, sectionId, plan })
              }
              builtAreaSqft={
                group.sectionId
                  ? plansBySection.get(group.sectionId)?.built_area_sqft ?? null
                  : null
              }
              onSetBuiltArea={
                canEdit
                  ? (sectionId, sqft) =>
                      upsertFloorMeta.mutate({
                        siteId,
                        sectionId,
                        builtAreaSqft: sqft,
                      })
                  : undefined
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
        existingSpaces={spaces}
      />

      <FloorPlansDialog
        open={floorPlansOpen}
        onClose={() => setFloorPlansOpen(false)}
        siteId={siteId}
        canEdit={canEdit}
      />

      <SpacesImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        siteId={siteId}
      />

      <TileOptionsManager
        open={tilesOpen}
        onClose={() => setTilesOpen(false)}
        siteId={siteId}
        canEdit={canEdit}
      />
    </Box>
  );
}
