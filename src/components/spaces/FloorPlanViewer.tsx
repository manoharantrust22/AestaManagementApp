"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

import type { ScopePhotoRef } from "@/types/spaces.types";
import { isPdfRef } from "@/lib/spaces/floors";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";

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

/** Full-screen floor-plan image with upload/replace + built-up area. */
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
  const [areaText, setAreaText] = useState(
    builtAreaSqft !== null ? String(builtAreaSqft) : ""
  );
  useEffect(() => {
    if (open) setAreaText(builtAreaSqft !== null ? String(builtAreaSqft) : "");
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        {floorName} — floor plan
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {plan ? (
            isPdfRef(plan) ? (
              <Stack spacing={1}>
                <Box
                  component="iframe"
                  src={plan.url}
                  title={`${floorName} floor plan (PDF)`}
                  sx={{
                    width: "100%",
                    height: "70vh",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "grey.50",
                  }}
                />
                <Box
                  component="a"
                  href={plan.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ typography: "body2" }}
                >
                  Open PDF in new tab
                </Box>
              </Stack>
            ) : (
              <Box
                component="a"
                href={plan.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: "block", lineHeight: 0 }}
              >
                <Box
                  component="img"
                  src={plan.url}
                  alt={`${floorName} floor plan`}
                  sx={{
                    width: "100%",
                    maxHeight: "70vh",
                    objectFit: "contain",
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                    bgcolor: "grey.50",
                  }}
                />
              </Box>
            )
          ) : (
            <Typography variant="body2" color="text.secondary">
              No floor plan attached yet.
            </Typography>
          )}
          {canEdit && (
            <ReceiptCapture
              label={plan ? "Replace plan" : "Attach floor plan (image or PDF)"}
              value={null}
              onChange={handleChange}
              folder={`${siteId}/floor-plans/${sectionId}`}
              bucket="space-photos"
              accept="image/*,application/pdf"
            />
          )}
          {onSetBuiltArea && (
            <TextField
              label="Built-up area (sqft)"
              value={areaText}
              onChange={(e) => setAreaText(e.target.value)}
              onBlur={commitArea}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={!canEdit}
              size="small"
              helperText="Incl. wall thickness — the basis for civil/electrical per-sqft contracts."
              inputProps={{ inputMode: "decimal" }}
              sx={{ maxWidth: 320 }}
            />
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
