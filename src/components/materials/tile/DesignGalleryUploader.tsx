"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  TextField,
  CircularProgress,
  alpha,
  useTheme,
} from "@mui/material";
import {
  AddPhotoAlternate as AddPhotoIcon,
  Close as CloseIcon,
  ChevronLeft as LeftIcon,
  ChevronRight as RightIcon,
  ErrorOutline as ErrorIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";

interface DraftDesign {
  id: string;
  image_url: string;
  name: string;
  uploading: boolean;
  error: boolean;
}

export interface DesignGalleryValue {
  image_url: string;
  name: string;
}

interface DesignGalleryUploaderProps {
  /** Emits the committed (successfully-uploaded) designs in display order. */
  onDesignsChange: (designs: DesignGalleryValue[]) => void;
  /** Notifies the parent while any upload is in flight (disable Save). */
  onUploadingChange?: (uploading: boolean) => void;
}

let designCounter = 0;
const nextId = () => `d${++designCounter}-${Date.now()}`;

export default function DesignGalleryUploader({
  onDesignsChange,
  onUploadingChange,
}: DesignGalleryUploaderProps) {
  const theme = useTheme();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [designs, setDesigns] = useState<DraftDesign[]>([]);

  // Keep the latest callbacks in refs so the upload-completion closures don't
  // go stale and so the sync effect doesn't loop on changing prop identity.
  const onDesignsChangeRef = useRef(onDesignsChange);
  onDesignsChangeRef.current = onDesignsChange;
  const onUploadingChangeRef = useRef(onUploadingChange);
  onUploadingChangeRef.current = onUploadingChange;

  useEffect(() => {
    onDesignsChangeRef.current(
      designs
        .filter((d) => d.image_url && !d.uploading && !d.error)
        .map((d) => ({ image_url: d.image_url, name: d.name.trim() })),
    );
    onUploadingChangeRef.current?.(designs.some((d) => d.uploading));
  }, [designs]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);

    // Add placeholder cards immediately so the user sees progress.
    const drafts: DraftDesign[] = picked.map((f) => ({
      id: nextId(),
      image_url: "",
      name: f.name.replace(/\.[^.]+$/, ""),
      uploading: true,
      error: false,
    }));
    setDesigns((prev) => [...prev, ...drafts]);

    await Promise.all(
      picked.map(async (file, i) => {
        const draft = drafts[i];
        try {
          const ext = file.name.split(".").pop() || "jpg";
          const { publicUrl } = await hardenedUpload({
            supabase,
            bucketName: "work-updates",
            filePath: `product-photos/tile-design-${draft.id}.${ext}`,
            file,
            contentType: file.type,
          });
          setDesigns((prev) =>
            prev.map((d) =>
              d.id === draft.id
                ? { ...d, image_url: publicUrl, uploading: false }
                : d,
            ),
          );
        } catch (err) {
          console.error("Design upload failed:", err);
          setDesigns((prev) =>
            prev.map((d) =>
              d.id === draft.id ? { ...d, uploading: false, error: true } : d,
            ),
          );
        }
      }),
    );

    // Allow re-picking the same file later.
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeDesign = (id: string) =>
    setDesigns((prev) => prev.filter((d) => d.id !== id));

  const renameDesign = (id: string, name: string) =>
    setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));

  const move = (index: number, dir: -1 | 1) => {
    setDesigns((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const uploadedCount = designs.filter(
    (d) => d.image_url && !d.error && !d.uploading,
  ).length;

  return (
    <Box>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {/* Upload dropzone / trigger */}
      <Box
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          py: 2,
          px: 1.5,
          mb: designs.length ? 1.5 : 0,
          border: 1,
          borderStyle: "dashed",
          borderColor: alpha(theme.palette.primary.main, 0.45),
          borderRadius: 1.5,
          cursor: "pointer",
          color: theme.palette.primary.dark,
          transition: "background-color 120ms",
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05) },
        }}
      >
        <AddPhotoIcon sx={{ fontSize: 26 }} />
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
          Add design photos
        </Typography>
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          Upload each design once — shared across all thicknesses. Select many at once.
        </Typography>
      </Box>

      {designs.length > 0 && (
        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1 }}>
          {uploadedCount} design{uploadedCount === 1 ? "" : "s"} ready
          {designs.some((d) => d.uploading) ? " · uploading…" : ""}
        </Typography>
      )}

      {/* Thumbnail cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
          gap: 1,
          maxHeight: 340,
          overflowY: "auto",
        }}
      >
        {designs.map((d, index) => (
          <Box
            key={d.id}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              overflow: "hidden",
              bgcolor: "background.paper",
              "&:hover .design-actions": { opacity: 1 },
            }}
          >
            <Box
              sx={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {d.uploading ? (
                <CircularProgress size={22} thickness={5} />
              ) : d.error ? (
                <Box sx={{ textAlign: "center", color: "error.main", px: 1 }}>
                  <ErrorIcon sx={{ fontSize: 22 }} />
                  <Typography sx={{ fontSize: 10 }}>Upload failed</Typography>
                </Box>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.image_url}
                  alt={d.name || "Design"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}

              {/* Hover actions */}
              <Box
                className="design-actions"
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  display: "flex",
                  gap: 0.25,
                  opacity: 0,
                  transition: "opacity 120ms",
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => removeDesign(d.id)}
                  aria-label="Remove design"
                  sx={{
                    bgcolor: "rgba(0,0,0,0.55)",
                    color: "#fff",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
                    width: 22,
                    height: 22,
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>

              {/* Reorder controls */}
              <Box
                className="design-actions"
                sx={{
                  position: "absolute",
                  bottom: 2,
                  left: 2,
                  right: 2,
                  display: "flex",
                  justifyContent: "space-between",
                  opacity: 0,
                  transition: "opacity 120ms",
                }}
              >
                <IconButton
                  size="small"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move left"
                  sx={{
                    bgcolor: "rgba(0,0,0,0.45)",
                    color: "#fff",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                    "&.Mui-disabled": { opacity: 0.3, color: "#fff" },
                    width: 20,
                    height: 20,
                  }}
                >
                  <LeftIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={index === designs.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move right"
                  sx={{
                    bgcolor: "rgba(0,0,0,0.45)",
                    color: "#fff",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                    "&.Mui-disabled": { opacity: 0.3, color: "#fff" },
                    width: 20,
                    height: 20,
                  }}
                >
                  <RightIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            </Box>

            <TextField
              variant="standard"
              placeholder="Name (optional)"
              value={d.name}
              onChange={(e) => renameDesign(d.id, e.target.value)}
              fullWidth
              InputProps={{ disableUnderline: true }}
              sx={{
                px: 0.75,
                py: 0.5,
                "& .MuiInputBase-input": { fontSize: 11, textAlign: "center" },
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
