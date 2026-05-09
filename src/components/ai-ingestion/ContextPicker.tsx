/**
 * Site / date / bill-upload picker shown as the "context" step of the dialog.
 * Mode-agnostic — warranty mode will get its own picker variant in v1.1.
 */

"use client";

import { Alert, Box, MenuItem, Stack, TextField, Typography } from "@mui/material";

import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import { createClient } from "@/lib/supabase/client";

import type { IngestionContext, IngestionMode } from "@/lib/ai-ingestion/types";

interface SiteOption {
  id: string;
  name: string;
}

interface ContextPickerProps {
  mode: IngestionMode;
  ctx: IngestionContext;
  onChange: (patch: Partial<IngestionContext>) => void;
  /** When provided, site picker becomes read-only. */
  lockedSite?: SiteOption | null;
  /** All sites available to the user (for the picker). */
  sites: SiteOption[];
  /** Whether the bill upload is required for this mode. */
  fileUploadLabel?: string;
}

export default function ContextPicker({
  mode,
  ctx,
  onChange,
  lockedSite,
  sites,
  fileUploadLabel,
}: ContextPickerProps) {
  const supabase = createClient();
  const showSitePicker = mode === "purchase"; // quotation/warranty don't tie to a site

  const onUploaded = (file: UploadedFile) => {
    onChange({ billUrls: [file.url] });
  };
  const onRemoved = () => {
    onChange({ billUrls: [] });
  };
  const currentFile: UploadedFile | null = ctx.billUrls[0]
    ? { name: ctx.billUrls[0].split("/").pop() ?? "file", size: 0, url: ctx.billUrls[0] }
    : null;

  return (
    <Stack spacing={2.5}>
      {showSitePicker ? (
        lockedSite ? (
          <TextField
            label="Site"
            value={lockedSite.name}
            disabled
            size="small"
            fullWidth
          />
        ) : (
          <TextField
            select
            label="Site"
            value={ctx.siteId ?? ""}
            onChange={(e) => onChange({ siteId: e.target.value })}
            size="small"
            fullWidth
            required
            helperText="Which site is this purchase for?"
          >
            {sites.length === 0 ? (
              <MenuItem disabled value="">
                No sites available
              </MenuItem>
            ) : (
              sites.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))
            )}
          </TextField>
        )
      ) : null}

      <TextField
        type="date"
        label={mode === "quotation" ? "Quote date" : "Purchase date"}
        value={ctx.defaultDate}
        onChange={(e) => onChange({ defaultDate: e.target.value })}
        size="small"
        fullWidth
        InputLabelProps={{ shrink: true }}
        helperText="Default if the AI can't read the date from the bill."
      />

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {fileUploadLabel ?? "Bill / quotation photo (optional but recommended)"}
        </Typography>
        <FileUploader
          supabase={supabase}
          bucketName="purchase-documents"
          folderPath={mode === "quotation" ? "quotations" : "bills"}
          fileNamePrefix={mode}
          accept="all"
          value={currentFile}
          onUpload={onUploaded}
          onRemove={onRemoved}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Upload the same image you give to ChatGPT/Gemini. Multi-page warranty bundles: combine
          into one PDF first.
        </Typography>
      </Box>

      {mode === "warranty" ? (
        <Alert severity="info">
          Warranty mode attaches to an existing purchase. After preview you&apos;ll pick which
          purchase to attach to.
        </Alert>
      ) : null}
    </Stack>
  );
}
