"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Avatar,
  Box,
  IconButton,
  CircularProgress,
  Typography,
  Badge,
  Tooltip,
} from "@mui/material";
import {
  CameraAlt as CameraIcon,
  Delete as DeleteIcon,
  Handyman as HandymanIcon,
} from "@mui/icons-material";
import { SupabaseClient } from "@supabase/supabase-js";
import ImageCropper from "@/components/profile/ImageCropper";
import { useImageUpload } from "@/hooks/useImageUpload";

interface TechnicianPhotoFieldProps {
  currentPhotoUrl: string | null;
  name: string;
  technicianId?: string;
  onPhotoChange: (url: string | null) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  supabase: SupabaseClient;
}

/**
 * Photo picker for a technician. Mirrors LaborerPhotoUploader but stores into
 * the shared `work-updates` bucket under a `technician-photos/<id>` prefix, so
 * no dedicated bucket/migration is needed.
 */
export default function TechnicianPhotoField({
  currentPhotoUrl,
  name,
  technicianId,
  onPhotoChange,
  onError,
  disabled = false,
  supabase,
}: TechnicianPhotoFieldProps) {
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadBlob, isUploading, progress } = useImageUpload({
    supabase,
    bucketName: "work-updates",
    folderPath: `technician-photos/${technicianId || "new"}`,
    maxSizeMB: 0.5,
    maxWidthOrHeight: 400,
    quality: 0.8,
  });

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        onError("Please select an image file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        onError("Image must be less than 10MB");
        return;
      }
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setCropperOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onError]
  );

  const handleCropComplete = useCallback(
    async (croppedBlob: Blob) => {
      try {
        const result = await uploadBlob(croppedBlob, "photo");
        onPhotoChange(result.url);
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "Failed to upload photo"
        );
      } finally {
        if (selectedImage) {
          URL.revokeObjectURL(selectedImage);
          setSelectedImage(null);
        }
      }
    },
    [uploadBlob, onPhotoChange, onError, selectedImage]
  );

  const handleCropperClose = useCallback(() => {
    setCropperOpen(false);
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage);
      setSelectedImage(null);
    }
  }, [selectedImage]);

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) fileInputRef.current?.click();
  }, [disabled, isUploading]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPhotoChange(null);
    },
    [onPhotoChange]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Box sx={{ position: "relative", display: "inline-block" }}>
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            badgeContent={
              !disabled && (
                <Tooltip title="Upload photo">
                  <IconButton
                    onClick={handleClick}
                    disabled={isUploading}
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: "primary.main",
                      color: "white",
                      "&:hover": { bgcolor: "primary.dark" },
                      boxShadow: 2,
                    }}
                  >
                    {isUploading ? (
                      <CircularProgress
                        size={18}
                        color="inherit"
                        variant="determinate"
                        value={progress}
                      />
                    ) : (
                      <CameraIcon sx={{ fontSize: 18 }} />
                    )}
                  </IconButton>
                </Tooltip>
              )
            }
          >
            <Avatar
              src={currentPhotoUrl || undefined}
              alt={name}
              onClick={handleClick}
              sx={{
                width: 88,
                height: 88,
                cursor: !disabled && !isUploading ? "pointer" : "default",
                bgcolor: "grey.200",
                border: "3px solid",
                borderColor: "background.paper",
                boxShadow: 2,
              }}
            >
              {!currentPhotoUrl && (
                <HandymanIcon sx={{ fontSize: 40, color: "grey.500" }} />
              )}
            </Avatar>
          </Badge>

          {!disabled && currentPhotoUrl && !isUploading && (
            <Tooltip title="Remove photo">
              <IconButton
                onClick={handleRemove}
                size="small"
                sx={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  bgcolor: "error.main",
                  color: "white",
                  width: 24,
                  height: 24,
                  "&:hover": { bgcolor: "error.dark" },
                }}
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
          Optional photo
        </Typography>
      </Box>

      {selectedImage && (
        <ImageCropper
          open={cropperOpen}
          imageSrc={selectedImage}
          onClose={handleCropperClose}
          onCropComplete={handleCropComplete}
          cropShape="round"
          aspect={1}
          title="Crop Photo"
        />
      )}
    </>
  );
}
