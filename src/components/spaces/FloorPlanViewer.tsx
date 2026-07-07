"use client";

import React, { useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Collapse,
  Dialog,
  IconButton,
  Slide,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import {
  Close as CloseIcon,
  EditOutlined as EditIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";

import type { ScopePhotoRef } from "@/types/spaces.types";
import { isPdfRef } from "@/lib/spaces/floors";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import ZoomableImage from "@/components/common/ZoomableImage";

interface FloorPlanViewerProps {
  open: boolean;
  onClose: () => void;
  floorName: string;
  siteId: string;
  sectionId: string;
  plan: ScopePhotoRef | null;
  canEdit: boolean;
  onSetPlan: (plan: ScopePhotoRef) => void;
  /** Manually-entered built-up sqft (incl. walls) for this floor. */
  builtAreaSqft?: number | null;
  onSetBuiltArea?: (sqft: number | null) => void;
}

const SlideUp = React.forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/** Full-screen, plan-first floor-plan viewer with zoom + an Edit panel. */
export default function FloorPlanViewer({
  open,
  onClose,
  floorName,
  siteId,
  sectionId,
  plan,
  canEdit,
  onSetPlan,
  builtAreaSqft = null,
  onSetBuiltArea,
}: FloorPlanViewerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [editOpen, setEditOpen] = useState(false);
  const [areaText, setAreaText] = useState(
    builtAreaSqft !== null ? String(builtAreaSqft) : ""
  );

  useEffect(() => {
    if (open) {
      setAreaText(builtAreaSqft !== null ? String(builtAreaSqft) : "");
      setEditOpen(false);
    }
  }, [open, builtAreaSqft]);

  const commitArea = () => {
    if (!onSetBuiltArea) return;
    const n = Number(areaText);
    const next = areaText.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
    if (next !== builtAreaSqft) onSetBuiltArea(next);
  };

  const handleChange = (v: ReceiptCaptureValue | null) => {
    if (!v) return;
    onSetPlan({ ...v, capturedAt: new Date().toISOString() });
  };

  const isPdf = plan ? isPdfRef(plan) : false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      TransitionComponent={SlideUp}
      PaperProps={{
        sx: { bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.100" },
      }}
    >
      <AppBar
        position="relative"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
            {floorName} — floor plan
          </Typography>
          {isPdf && plan && (
            <IconButton
              size="small"
              aria-label="open pdf in new tab"
              component="a"
              href={plan.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton
              size="small"
              aria-label={editOpen ? "hide edit" : "edit plan"}
              color={editOpen ? "primary" : "default"}
              onClick={() => setEditOpen((v) => !v)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {plan ? (
          isPdf ? (
            <Box
              component="iframe"
              src={`${plan.url}#toolbar=1&view=FitH`}
              title={`${floorName} floor plan (PDF)`}
              sx={{ width: "100%", height: "100%", border: 0, bgcolor: "grey.50" }}
            />
          ) : (
            <ZoomableImage
              src={plan.url}
              alt={`${floorName} floor plan`}
              showButtons={!isMobile}
              showHint={isMobile}
            />
          )
        ) : (
          <Typography variant="body2" color="text.secondary">
            No floor plan attached yet.
            {canEdit ? " Tap the edit icon to add one." : ""}
          </Typography>
        )}
      </Box>

      {canEdit && (
        <Collapse in={editOpen}>
          <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
            <Stack spacing={2}>
              <ReceiptCapture
                label={plan ? "Replace plan" : "Attach floor plan (image or PDF)"}
                value={null}
                onChange={handleChange}
                folder={`${siteId}/floor-plans/${sectionId}`}
                bucket="space-photos"
                accept="image/*,application/pdf"
              />
              {onSetBuiltArea && (
                <TextField
                  label="Built-up area (sqft)"
                  value={areaText}
                  onChange={(e) => setAreaText(e.target.value)}
                  onBlur={commitArea}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  size="small"
                  helperText="Incl. wall thickness — the basis for civil/electrical per-sqft contracts."
                  inputProps={{ inputMode: "decimal" }}
                  sx={{ maxWidth: 320 }}
                />
              )}
            </Stack>
          </Box>
        </Collapse>
      )}
    </Dialog>
  );
}
