"use client";

import { useState, useRef, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  alpha,
  useTheme,
  Avatar,
  Tooltip,
} from "@mui/material";
import {
  AddAPhoto as AddPhotoIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
} from "@mui/icons-material";
import { SupabaseClient } from "@supabase/supabase-js";
import { ensureFreshSession } from "@/lib/auth/sessionManager";
import ImageCropper from "@/components/profile/ImageCropper";

interface ImageUploadWithCropProps {
  /** Supabase client instance */
  supabase: SupabaseClient<any>;
  /** Storage bucket name */
  bucketName: string;
  /** Folder path prefix for uploaded files */
  folderPath?: string;
  /** File name prefix */
  fileNamePrefix?: string;
  /** Current image URL (controlled) */
  value?: string | null;
  /** Callback when image URL changes */
  onChange: (url: string | null) => void;
  /** Whether the uploader is disabled */
  disabled?: boolean;
  /** Label text */
  label?: string;
  /** Aspect ratio for cropping (default: 1 for square) */
  aspectRatio?: number;
  /** Max file size after compression in KB (default: 300) */
  maxSizeKB?: number;
  /** Crop shape - round or rect (default: rect) */
  cropShape?: "round" | "rect";
}

export default function ImageUploadWithCrop({
  supabase,
  bucketName,
  folderPath = "images",
  fileNamePrefix = "item",
  value,
  onChange,
  disabled = false,
  label = "Item Photo",
  aspectRatio = 1,
  maxSizeKB = 300,
  cropShape = "rect",
}: ImageUploadWithCropProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be less than 10MB");
      return;
    }

    setError(null);

    // Read file and open cropper
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setCropperOpen(true);
    };
    reader.onerror = () => {
      setError("Failed to read image file");
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = "";
  }, []);

  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    setCropperOpen(false);
    setUploading(true);
    setError(null);

    // Timeout for upload (30 seconds)
    const uploadTimeout = 30000;
    let timeoutId: NodeJS.Timeout | null = null;

    // ... existing imports

    // Inside handleCropComplete:

    try {
      // Ensure fresh session before starting upload
      await ensureFreshSession();

      // Compress the cropped image if needed (with 8s timeout)
      let finalBlob = croppedBlob;
      if (croppedBlob.size > maxSizeKB * 1024) {
        const compressionPromise = compressBlob(croppedBlob, maxSizeKB);
        const compressionTimeout = new Promise<Blob>((resolve) => {
          setTimeout(() => {
            console.warn("[ImageUpload] Compression timed out after 8s, using original blob");
            resolve(croppedBlob);
          }, 8000);
        });
        finalBlob = await Promise.race([compressionPromise, compressionTimeout]);
      }

      // Generate filename
      const timestamp = Date.now();
      const fileName = `${fileNamePrefix}_${timestamp}.jpg`;
      const filePath = `${folderPath}/${fileName}`;

      console.log(`[ImageUpload] Uploading to ${bucketName}/${filePath}, size: ${finalBlob.size} bytes`);

      // Create upload promise with timeout
      const uploadPromise = supabase.storage
        .from(bucketName)
        .upload(filePath, finalBlob, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Upload timed out. Please try again."));
        }, uploadTimeout);
      });

      // Race between upload and timeout
      const { data, error: uploadError } = await Promise.race([
        uploadPromise,
        timeoutPromise,
      ]) as Awaited<typeof uploadPromise>;

      if (timeoutId) clearTimeout(timeoutId);

      if (uploadError) {
        console.error("[ImageUpload] Upload error:", uploadError);
        throw new Error(uploadError.message || "Upload failed");
      }

      if (!data?.path) {
        throw new Error("Upload completed but no file path returned");
      }

      console.log("[ImageUpload] Upload successful:", data.path);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      console.log("[ImageUpload] Public URL:", publicUrl);

      onChange(publicUrl);
      setSelectedImage(null);
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error("[ImageUpload] Error:", err);
      setError(err.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }, [supabase, bucketName, folderPath, fileNamePrefix, maxSizeKB, onChange]);

  const handleRemove = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const handleCloseCropper = useCallback(() => {
    setCropperOpen(false);
    setSelectedImage(null);
  }, []);

  return (
    <Box>
      {label && (
        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
          {label}
        </Typography>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileSelect}
        disabled={disabled || uploading}
      />

      {value ? (
        // Show uploaded image preview
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            p: 1.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            bgcolor: alpha(theme.palette.success.main, 0.05),
          }}
        >
          <Avatar
            src={value}
            variant="rounded"
            sx={{ width: 64, height: 64 }}
          >
            <ImageIcon />
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="success.main" fontWeight={500}>
              Photo uploaded
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click edit to change
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Change photo">
              <IconButton
                size="small"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove photo">
              <IconButton
                size="small"
                color="error"
                onClick={handleRemove}
                disabled={disabled || uploading}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      ) : (
        // Show upload button
        <Button
          variant="outlined"
          startIcon={uploading ? <CircularProgress size={18} /> : <AddPhotoIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          sx={{
            width: "100%",
            py: 1.5,
            borderStyle: "dashed",
            borderColor: "divider",
            color: "text.secondary",
            "&:hover": {
              borderColor: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          {uploading ? "Uploading..." : "Add Photo"}
        </Button>
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
          {error}
        </Typography>
      )}

      {/* Image Cropper Dialog */}
      {selectedImage && (
        <ImageCropper
          open={cropperOpen}
          imageSrc={selectedImage}
          onClose={handleCloseCropper}
          onCropComplete={handleCropComplete}
          cropShape={cropShape}
          aspect={aspectRatio}
          title="Crop Item Photo"
        />
      )}
    </Box>
  );
}

// Helper function to compress a blob
async function compressBlob(blob: Blob, maxSizeKB: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Scale down if too large
      const maxDimension = 800;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels
      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              resolve(blob);
              return;
            }
            if (result.size > maxSizeKB * 1024 && quality > 0.3) {
              tryCompress(quality - 0.1);
            } else {
              resolve(result);
            }
          },
          "image/jpeg",
          quality
        );
      };

      tryCompress(0.8);
    };

    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });
}
