"use client";

import React from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

import type { ScopePhotoRef } from "@/types/spaces.types";
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
}

/** Full-screen floor-plan image with upload/replace. */
export default function FloorPlanViewer({
  open,
  onClose,
  floorName,
  siteId,
  sectionId,
  plan,
  canEdit,
  onSetPlan,
}: FloorPlanViewerProps) {
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
          ) : (
            <Typography variant="body2" color="text.secondary">
              No floor plan attached yet.
            </Typography>
          )}
          {canEdit && (
            <ReceiptCapture
              label={plan ? "Replace plan" : "Attach floor plan (photo or image file)"}
              value={null}
              onChange={handleChange}
              folder={`${siteId}/floor-plans/${sectionId}`}
              bucket="space-photos"
            />
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
