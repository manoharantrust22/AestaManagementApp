"use client";

import React, { useRef, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AttachFile as FileIcon,
  ContentPaste as PasteIcon,
  PhotoCamera as CameraIcon,
  Close as RemoveIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";

export interface ReceiptCaptureValue {
  url: string;
  storage_path: string;
}

export interface ReceiptCaptureProps {
  label: string;
  value: ReceiptCaptureValue | null;
  onChange: (next: ReceiptCaptureValue | null) => void;
  folder: string;
  bucket?: string;
  accept?: string;
  disabled?: boolean;
}

export function ReceiptCapture({
  label,
  value,
  onChange,
  folder,
  bucket = "work-updates",
  accept = "image/*",
  disabled = false,
}: ReceiptCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large (max 10 MB). Please compress and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${folder}/${safeName}`;
      const supabase = createClient();
      const { path: returnedPath, publicUrl } = await hardenedUpload({
        supabase,
        bucketName: bucket,
        filePath: path,
        file,
      });
      onChange({ url: publicUrl, storage_path: returnedPath });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split("/")[1] ?? "png";
          const file = new File([blob], `pasted.${ext}`, { type: imageType });
          await upload(file);
          return;
        }
      }
      setError("No image in clipboard");
    } catch {
      setError("Clipboard read not allowed");
    }
  };

  const filename = value
    ? value.storage_path.split("/").pop() ?? "attached"
    : null;

  return (
    <Box>
      <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      {value ? (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            p: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          <Box
            component="img"
            src={value.url}
            alt={label}
            sx={{ width: 40, height: 40, objectFit: "cover", borderRadius: 0.5 }}
          />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {filename}
          </Typography>
          <IconButton
            size="small"
            aria-label="remove"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <ButtonGroup variant="outlined" size="small" disabled={disabled || busy}>
          <Tooltip title="Upload file">
            <span>
              <Button
                aria-label="file"
                onClick={() => fileInputRef.current?.click()}
                startIcon={busy ? <CircularProgress size={14} /> : <FileIcon fontSize="small" />}
              >
                File
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Paste from clipboard">
            <span>
              <Button aria-label="paste" onClick={handlePaste} startIcon={<PasteIcon fontSize="small" />}>
                Paste
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Take photo">
            <span>
              <Button
                aria-label="camera"
                onClick={() => cameraInputRef.current?.click()}
                startIcon={<CameraIcon fontSize="small" />}
              >
                Camera
              </Button>
            </span>
          </Tooltip>
        </ButtonGroup>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={accept}
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
