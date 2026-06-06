/**
 * Multi-bill batch preview. Renders one collapsible card per bill, each reusing
 * the single-bill <PreviewTable> (so the per-bill date card + inline row editing
 * work unchanged), plus a "Bill photo" selector that maps an uploaded photo to
 * the bill (defaulted by upload order, reassignable). Header shows the detected
 * bill count so the user can sanity-check it against their stack.
 */

"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";

import type { AiPurchaseBatchOutput } from "@/lib/ai-ingestion/schemas";
import type { BatchBill, BatchResolvedPreview } from "@/lib/ai-ingestion/types";
import PreviewTable from "./PreviewTable";

interface BatchPreviewTableProps {
  batch: BatchResolvedPreview;
  parsed: AiPurchaseBatchOutput;
  /** Bill photos uploaded in the Context step (ctx.billUrls) — for the mapping selector. */
  billPhotos: string[];
  /** Per-bill fallback date (ctx.defaultDate) passed to each bill's date card. */
  selectedDate: string;
  /** "N bills · ₹X total" from the mode summary. */
  summary: string;
  onPatch: (patch: (prev: BatchResolvedPreview) => BatchResolvedPreview) => void;
}

export default function BatchPreviewTable({
  batch,
  parsed,
  billPhotos,
  selectedDate,
  summary,
  onPatch,
}: BatchPreviewTableProps) {
  const countMismatch = billPhotos.length > 0 && billPhotos.length !== batch.bills.length;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {batch.bills.length} bill{batch.bills.length === 1 ? "" : "s"} detected
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {summary} · each saves independently — the good ones go through even if one fails.
        </Typography>
      </Box>

      {countMismatch ? (
        <Alert severity="info">
          You uploaded {billPhotos.length} photo{billPhotos.length === 1 ? "" : "s"} for{" "}
          {batch.bills.length} bill{batch.bills.length === 1 ? "" : "s"}. Check the “Bill photo”
          mapping on each bill below.
        </Alert>
      ) : null}

      {batch.bills.map((bill, i) => {
        const purchase = parsed.purchases[i];
        const vendor = purchase?.vendor?.name || bill.preview.vendorRawName || `Bill ${i + 1}`;
        const date = bill.preview.effectiveDate ?? purchase?.purchase_date ?? null;
        const itemCount = bill.preview.rows.length;
        const total = typeof purchase?.total_amount === "number" ? purchase.total_amount : null;
        const billSummary = `${vendor} · ${itemCount} item${itemCount === 1 ? "" : "s"}${
          total != null ? ` · ₹${formatNumber(total)}` : ""
        }`;

        return (
          <Accordion
            key={bill.id}
            defaultExpanded={i === 0}
            TransitionProps={{ unmountOnExit: true }}
            variant="outlined"
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
                sx={{ width: "100%", pr: 1 }}
              >
                <Chip size="small" label={`#${i + 1}`} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {vendor}
                </Typography>
                {date ? (
                  <Typography variant="caption" color="text.secondary">
                    {formatFullDate(date)}
                  </Typography>
                ) : null}
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="caption" color="text.secondary">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                  {total != null ? ` · ₹${formatNumber(total)}` : ""}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {billPhotos.length > 0 ? (
                  <BillPhotoPicker
                    billPhotos={billPhotos}
                    value={bill.billUrl}
                    onChange={(url) =>
                      onPatch((prev) => updateBill(prev, bill.id, (b) => ({ ...b, billUrl: url })))
                    }
                  />
                ) : null}
                <PreviewTable
                  preview={bill.preview}
                  summary={billSummary}
                  selectedDate={selectedDate}
                  onPatch={(billPatch) =>
                    onPatch((prev) =>
                      updateBill(prev, bill.id, (b) => ({ ...b, preview: billPatch(b.preview) })),
                    )
                  }
                />
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}

function BillPhotoPicker({
  billPhotos,
  value,
  onChange,
}: {
  billPhotos: string[];
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const index = value ? billPhotos.indexOf(value) : -1;
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <TextField
        select
        size="small"
        label="Bill photo"
        value={index >= 0 ? String(index) : "none"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "none" ? null : billPhotos[Number(v)] ?? null);
        }}
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="none">No photo</MenuItem>
        {billPhotos.map((url, idx) => (
          <MenuItem key={idx} value={String(idx)}>
            Image {idx + 1}
          </MenuItem>
        ))}
      </TextField>
      {value ? (
        <Box
          component="img"
          src={value}
          alt="Bill"
          sx={{
            height: 44,
            width: 44,
            objectFit: "cover",
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
          }}
        />
      ) : null}
    </Stack>
  );
}

function updateBill(
  prev: BatchResolvedPreview,
  id: number,
  fn: (b: BatchBill) => BatchBill,
): BatchResolvedPreview {
  return { ...prev, bills: prev.bills.map((b) => (b.id === id ? fn(b) : b)) };
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatFullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
