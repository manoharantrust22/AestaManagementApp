"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  ChevronRight as ChevronIcon,
  MapOutlined as PlanIcon,
  PictureAsPdf as PdfIcon,
} from "@mui/icons-material";

import {
  useSpaceFloorPlans,
  useSpaces,
  useSpaceSections,
  useUpsertFloorMeta,
  type SpaceSection,
} from "@/hooks/queries/useSpaces";
import { filterFloorSections, isPdfRef } from "@/lib/spaces/floors";
import FloorPlanViewer from "./FloorPlanViewer";

interface FloorPlansDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  canEdit: boolean;
}

/**
 * Floor-plan management reachable even when no spaces exist yet — lists the
 * site's floors with attach/replace via the existing FloorPlanViewer.
 */
export default function FloorPlansDialog({
  open,
  onClose,
  siteId,
  canEdit,
}: FloorPlansDialogProps) {
  const { data: sections = [] } = useSpaceSections(siteId);
  const { data: floorPlans = [] } = useSpaceFloorPlans(siteId);
  const { data: spaces = [] } = useSpaces(siteId);
  const upsertFloorMeta = useUpsertFloorMeta();

  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState<SpaceSection | null>(null);

  const plansBySection = useMemo(() => {
    const map = new Map<string, (typeof floorPlans)[number]>();
    for (const p of floorPlans) map.set(p.section_id, p);
    return map;
  }, [floorPlans]);

  const usedSectionIds = useMemo(() => {
    const used = new Set<string>();
    for (const s of spaces) if (s.section_id) used.add(s.section_id);
    for (const p of floorPlans) used.add(p.section_id);
    return used;
  }, [spaces, floorPlans]);

  const rows = useMemo(
    () => filterFloorSections(sections, { usedSectionIds, showAll }),
    [sections, usedSectionIds, showAll]
  );

  const hiddenCount = sections.length - rows.length;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>Floor plans</DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
              No floors found. Add building sections (Ground Floor, First
              Floor…) in Site Settings.
            </Typography>
          ) : (
            <List dense disablePadding>
              {rows.map((s) => {
                const meta = plansBySection.get(s.id);
                const plan = meta?.plan ?? null;
                const builtUp = meta?.built_area_sqft ?? null;
                return (
                  <ListItemButton key={s.id} onClick={() => setActive(s)}>
                    {plan && !isPdfRef(plan) ? (
                      <Box
                        component="img"
                        src={plan.url}
                        alt={`${s.name} plan`}
                        sx={{
                          width: 40,
                          height: 40,
                          objectFit: "cover",
                          borderRadius: 0.5,
                          border: 1,
                          borderColor: "divider",
                          mr: 1.5,
                        }}
                      />
                    ) : plan ? (
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 0.5,
                          border: 1,
                          borderColor: "divider",
                          mr: 1.5,
                          color: "error.main",
                        }}
                      >
                        <PdfIcon fontSize="small" />
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 0.5,
                          border: 1,
                          borderColor: "divider",
                          borderStyle: "dashed",
                          mr: 1.5,
                          color: "text.disabled",
                        }}
                      >
                        <PlanIcon fontSize="small" />
                      </Box>
                    )}
                    <ListItemText
                      primary={s.name}
                      secondary={
                        (plan ? "Plan attached" : "No plan yet") +
                        (builtUp !== null ? ` · built-up ${builtUp} sqft` : "")
                      }
                    />
                    <ChevronIcon fontSize="small" color="action" />
                  </ListItemButton>
                );
              })}
            </List>
          )}
          {(hiddenCount > 0 || showAll) && (
            <Button
              size="small"
              onClick={() => setShowAll((v) => !v)}
              sx={{ ml: 1, mt: 0.5, color: "text.secondary" }}
            >
              {showAll ? "Show floors only" : `Show all ${sections.length} sections…`}
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {active && (
        <FloorPlanViewer
          open
          onClose={() => setActive(null)}
          floorName={active.name}
          siteId={siteId}
          sectionId={active.id}
          plan={plansBySection.get(active.id)?.plan ?? null}
          canEdit={canEdit}
          onSetPlan={(p) =>
            upsertFloorMeta.mutate({ siteId, sectionId: active.id, plan: p })
          }
          builtAreaSqft={plansBySection.get(active.id)?.built_area_sqft ?? null}
          onSetBuiltArea={(v) =>
            upsertFloorMeta.mutate({
              siteId,
              sectionId: active.id,
              builtAreaSqft: v,
            })
          }
        />
      )}
    </>
  );
}
