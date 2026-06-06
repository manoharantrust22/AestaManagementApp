/**
 * Site / date / bill-upload picker shown as the "context" step of the dialog.
 * Mode-agnostic — warranty mode will get its own picker variant in v1.1.
 */

"use client";

import {
  Alert,
  Box,
  Button,
  Collapse,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

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
  /** Switch between single-bill ("purchase") and batch ("purchase_batch"). */
  onModeChange?: (mode: IngestionMode) => void;
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
  onModeChange,
  lockedSite,
  sites,
  fileUploadLabel,
}: ContextPickerProps) {
  const supabase = createClient();
  const isPurchaseFamily = mode === "purchase" || mode === "purchase_batch";
  const isBatch = mode === "purchase_batch";
  const showSitePicker = isPurchaseFamily; // quotation/warranty don't tie to a site

  // For purchase mode without a locked site, the user explicitly opts in to
  // recording a site expense. Default OFF = catalog-only ingest. The toggle is
  // bypassed when site is locked (site-flow caller — already site-scoped) or
  // when mode isn't a purchase flow.
  const recordAsSiteExpense = ctx.recordAsSiteExpense ?? !!lockedSite;
  const isCompanyPurchaseFlow = isPurchaseFamily && !lockedSite;

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
      {isPurchaseFamily && onModeChange ? (
        <Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            fullWidth
            value={mode}
            onChange={(_, val) => {
              if (val) onModeChange(val as IngestionMode);
            }}
          >
            <ToggleButton value="purchase">One bill</ToggleButton>
            <ToggleButton value="purchase_batch">Multiple separate bills</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {isBatch
              ? "Give all the bill photos to ChatGPT/Gemini in one chat; paste back one response covering every bill."
              : "A single purchase bill from one vendor."}
          </Typography>
        </Box>
      ) : null}

      {showSitePicker && lockedSite ? (
        <TextField
          label="Site"
          value={lockedSite.name}
          disabled
          size="small"
          fullWidth
          helperText="Site is fixed by the page you opened this from."
        />
      ) : null}

      {isCompanyPurchaseFlow ? (
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={recordAsSiteExpense}
                onChange={(e) =>
                  onChange({
                    recordAsSiteExpense: e.target.checked,
                    siteId: e.target.checked ? ctx.siteId : null,
                  })
                }
                size="small"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Also record as site expense
                </Typography>
                <Typography
                  variant="caption"
                  component="span"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  {recordAsSiteExpense
                    ? "Bill will land on the chosen site's expenses."
                    : "Catalog-only — updates materials, vendors, and price history."}
                </Typography>
              </Box>
            }
          />
          <Collapse in={recordAsSiteExpense} unmountOnExit>
            <TextField
              select
              label="Site"
              value={ctx.siteId ?? ""}
              onChange={(e) => onChange({ siteId: e.target.value })}
              size="small"
              fullWidth
              required
              helperText="Which site is this purchase for?"
              sx={{ mt: 1.5 }}
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
          </Collapse>
        </Box>
      ) : null}

      <TextField
        type="date"
        label={mode === "quotation" ? "Quote date" : isBatch ? "Default date" : "Purchase date"}
        value={ctx.defaultDate}
        onChange={(e) => onChange({ defaultDate: e.target.value })}
        size="small"
        fullWidth
        InputLabelProps={{ shrink: true }}
        helperText={
          isBatch
            ? "Fallback only — each bill keeps its own printed date; this is used only when a bill has none."
            : "Default if the AI can't read the date from the bill."
        }
      />

      {isBatch ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Bill photos (one per bill, in order — optional but recommended)
          </Typography>
          {ctx.billUrls.length > 0 ? (
            <Stack spacing={1} sx={{ mb: 1.5 }}>
              {ctx.billUrls.map((url, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <Box
                    component="img"
                    src={url}
                    alt={`Bill ${i + 1}`}
                    sx={{
                      height: 40,
                      width: 40,
                      objectFit: "cover",
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  />
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    Image {i + 1}
                  </Typography>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      onChange({ billUrls: ctx.billUrls.filter((_, idx) => idx !== i) })
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ))}
            </Stack>
          ) : null}
          <FileUploader
            key={ctx.billUrls.length}
            supabase={supabase}
            bucketName="purchase-documents"
            folderPath="bills"
            fileNamePrefix="purchase"
            accept="all"
            value={null}
            onUpload={(file) => onChange({ billUrls: [...ctx.billUrls, file.url] })}
            onRemove={() => {}}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Upload the same images you give to ChatGPT/Gemini, in order — we map photo #1 → bill #1,
            etc. (reassignable in the preview).
          </Typography>
        </Box>
      ) : (
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
      )}

      {mode === "warranty" ? (
        <Alert severity="info">
          Warranty mode attaches to an existing purchase. After preview you&apos;ll pick which
          purchase to attach to.
        </Alert>
      ) : null}
    </Stack>
  );
}
