"use client";

import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { Close as RemoveIcon } from "@mui/icons-material";

import type { ScopePhotoRef, Space } from "@/types/spaces.types";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";

interface SpacePhotosSectionProps {
  space: Space;
  canEdit: boolean;
  onSave: (photos: ScopePhotoRef[]) => void;
}

/** Reference photos of the space (tiling surface, verification shots…). */
export default function SpacePhotosSection({
  space,
  canEdit,
  onSave,
}: SpacePhotosSectionProps) {
  const photos = space.photos ?? [];

  const addPhoto = (v: ReceiptCaptureValue | null) => {
    if (!v) return;
    onSave([...photos, { ...v, capturedAt: new Date().toISOString() }]);
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Photos
      </Typography>
      {photos.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mb: 1 }}>
          {photos.map((p) => (
            <Box key={p.storage_path} sx={{ position: "relative" }}>
              <Box
                component="a"
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: "block", lineHeight: 0 }}
              >
                <Box
                  component="img"
                  src={p.url}
                  alt="Space photo"
                  sx={{
                    width: 72,
                    height: 72,
                    objectFit: "cover",
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                  }}
                />
              </Box>
              {canEdit && (
                <IconButton
                  size="small"
                  aria-label="remove photo"
                  onClick={() =>
                    onSave(photos.filter((x) => x.storage_path !== p.storage_path))
                  }
                  sx={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    bgcolor: "background.paper",
                    border: 1,
                    borderColor: "divider",
                    "&:hover": { bgcolor: "background.paper" },
                  }}
                >
                  <RemoveIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Box>
          ))}
        </Stack>
      )}
      {canEdit && (
        <ReceiptCapture
          label={photos.length ? "Add photo" : "Attach a photo"}
          value={null}
          onChange={addPhoto}
          folder={`${space.site_id}/spaces/${space.id}`}
          bucket="space-photos"
        />
      )}
    </Box>
  );
}
