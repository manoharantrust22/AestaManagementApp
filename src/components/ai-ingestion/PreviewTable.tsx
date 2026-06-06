/**
 * Resolved-preview table. Each row carries a NEW / MATCH / AMBIGUOUS chip and
 * an "edit" button that opens ResolveRowEditor.
 */

"use client";

import { useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Paper,
  Alert,
} from "@mui/material";
import {
  Edit as EditIcon,
  Warning as WarningIcon,
  TrendingDown as DownIcon,
  TrendingUp as UpIcon,
  TrendingFlat as FlatIcon,
  Lightbulb as TipIcon,
  PhotoCamera as PhotoCameraIcon,
  Close as CloseIcon,
  AutoFixHigh as ReplaceIcon,
  ImageSearch as ImageSearchIcon,
} from "@mui/icons-material";

import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import ImageSearchPicker from "@/components/common/ImageSearchPicker";

import type {
  ResolvedPreview,
  ResolvedPreviewRow,
  RowMatchOutcome,
  RowPriceContext,
  VendorSummary,
} from "@/lib/ai-ingestion/types";
import type { MaterialMatchCandidate } from "@/lib/ai-ingestion/fuzzyMatch";
import ResolveRowEditor from "./ResolveRowEditor";

interface PreviewTableProps {
  preview: ResolvedPreview;
  summary: string;
  onPatch: (patch: (prev: ResolvedPreview) => ResolvedPreview) => void;
  /** The "Purchase date" picked in the Context step — compared against the
   * AI-read bill date to flag a mismatch on the date card. */
  selectedDate?: string;
}

export default function PreviewTable({ preview, summary, onPatch, selectedDate }: PreviewTableProps) {
  const [editAnchor, setEditAnchor] = useState<HTMLElement | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const editingRow =
    editingIndex !== null ? preview.rows.find((r) => r.index === editingIndex) ?? null : null;

  const closeEditor = () => {
    setEditAnchor(null);
    setEditingIndex(null);
  };

  const applyEdit = (patch: {
    overrideMaterialId: string | null;
    overrideMaterialName: string | null;
    quantity: number | null;
    unit: string;
    unitPrice: number;
    brand: string | null;
  }) => {
    if (editingIndex === null) return;
    onPatch((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.index === editingIndex
          ? {
              ...r,
              overrideMaterialId: patch.overrideMaterialId,
              overrideMaterialName: patch.overrideMaterialName,
              quantity: patch.quantity,
              unit: patch.unit,
              unitPrice: patch.unitPrice,
              rawBrand: patch.brand,
              totalPrice:
                patch.quantity != null && Number.isFinite(patch.unitPrice)
                  ? patch.quantity * patch.unitPrice
                  : null,
              warnings: recomputeWarnings(r, patch.unit),
            }
          : r,
      ),
    }));
  };

  // Edit the date that will actually be committed. Empty input falls back to
  // the Context "Purchase date" so the commit never sends an empty string
  // (the RPC requires a non-null date).
  const setEffectiveDate = (value: string) => {
    onPatch((prev) => ({
      ...prev,
      effectiveDate: value || selectedDate || prev.effectiveDate,
    }));
  };

  const setRowPhoto = (rowIndex: number, photoUrl: string | null) => {
    onPatch((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.index === rowIndex ? { ...r, productPhotoUrl: photoUrl } : r,
      ),
    }));
  };

  const newCount = preview.rows.filter((r) => effectiveStatus(r) === "new").length;
  const ambigCount = preview.rows.filter((r) => effectiveStatus(r) === "ambiguous").length;
  const vendorIsNew = preview.vendorMatch.kind === "new" && !preview.overrideVendorId;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {summary}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Vendor:{" "}
          {preview.overrideVendorId ? (
            <Chip size="small" label="MATCHED" color="success" sx={{ height: 18, mr: 0.5 }} />
          ) : preview.vendorMatch.kind === "matched" ? (
            <Chip size="small" label="MATCH" color="success" sx={{ height: 18, mr: 0.5 }} />
          ) : preview.vendorMatch.kind === "ambiguous" ? (
            <Chip size="small" label="AMBIGUOUS" color="warning" sx={{ height: 18, mr: 0.5 }} />
          ) : (
            <Chip size="small" label="NEW" color="info" sx={{ height: 18, mr: 0.5 }} />
          )}
          {vendorMatchLabel(preview)}
        </Typography>
      </Box>

      {preview.effectiveDate ? (
        <PurchaseDateCard
          effectiveDate={preview.effectiveDate}
          billDate={preview.billDate ?? null}
          selectedDate={selectedDate ?? preview.effectiveDate}
          onChange={setEffectiveDate}
        />
      ) : null}

      {ambigCount > 0 ? (
        <Alert severity="warning" icon={<WarningIcon />}>
          {ambigCount} row{ambigCount === 1 ? "" : "s"} need confirmation. Click the edit icon to
          pick a match or accept the suggested NEW entry.
        </Alert>
      ) : null}

      {newCount > 0 ? (
        <Alert severity="info">
          {newCount} item{newCount === 1 ? "" : "s"} will be created in the catalog on confirm.
          {vendorIsNew ? " Vendor will also be created." : ""}
        </Alert>
      ) : null}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 100 }}>Status</TableCell>
              <TableCell>Material</TableCell>
              <TableCell sx={{ width: 130 }} align="right">
                Qty × Unit
              </TableCell>
              <TableCell sx={{ width: 110 }} align="right">
                Unit price
              </TableCell>
              <TableCell sx={{ width: 110 }} align="right">
                Total
              </TableCell>
              <TableCell sx={{ width: 70 }} align="center">
                Photo
              </TableCell>
              <TableCell sx={{ width: 56 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {preview.rows.map((row) => {
              const status = effectiveStatus(row);
              return (
                <TableRow key={row.index} hover>
                  <TableCell>
                    <StatusChip status={status} />
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{displayName(row)}</Typography>
                      {row.rawCategoryHint ? (
                        <Typography variant="caption" color="text.secondary">
                          {row.rawCategoryHint}
                          {row.rawBrand ? ` · ${row.rawBrand}` : ""}
                        </Typography>
                      ) : row.rawBrand ? (
                        <Typography variant="caption" color="text.secondary">
                          {row.rawBrand}
                        </Typography>
                      ) : null}
                      {row.warnings.length > 0 ? (
                        <Typography variant="caption" color="warning.main">
                          ⚠ {row.warnings.join(", ")}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {row.quantity ?? "—"} {row.unit}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack spacing={0.25} alignItems="flex-end">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2">₹{formatNumber(row.unitPrice)}</Typography>
                        <PriceDeltaBadge ctx={row.priceContext} />
                      </Stack>
                      {row.priceContext?.lastFromSameVendor ? (
                        <Typography variant="caption" color="text.secondary">
                          was ₹{formatNumber(row.priceContext.lastFromSameVendor.price)} ·{" "}
                          {row.priceContext.lastFromSameVendor.daysAgo}d ago
                        </Typography>
                      ) : null}
                      {row.priceContext?.lastFromAnyVendor &&
                      row.priceContext.lastFromAnyVendor.price < row.unitPrice &&
                      // Only surface "cheaper elsewhere" when the cheaper one is from a different vendor
                      (!row.priceContext.lastFromSameVendor ||
                        row.priceContext.lastFromAnyVendor.price <
                          row.priceContext.lastFromSameVendor.price) ? (
                        <Tooltip
                          title={`Cheapest recently: ₹${formatNumber(
                            row.priceContext.lastFromAnyVendor.price,
                          )} from ${row.priceContext.lastFromAnyVendor.vendorName} on ${formatDate(
                            row.priceContext.lastFromAnyVendor.date,
                          )}`}
                        >
                          <Stack direction="row" spacing={0.25} alignItems="center">
                            <TipIcon sx={{ fontSize: 12, color: "warning.main" }} />
                            <Typography variant="caption" color="warning.main">
                              cheaper elsewhere
                            </Typography>
                          </Stack>
                        </Tooltip>
                      ) : null}
                      {!row.priceContext && status === "new" ? (
                        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: "italic" }}>
                          new — no price history
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {row.totalPrice !== null ? `₹${formatNumber(row.totalPrice)}` : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ p: 0.5 }}>
                    <PhotoCell
                      photoUrl={row.productPhotoUrl}
                      existingImageUrl={row.existingImageUrl}
                      rowName={displayName(row)}
                      searchQuery={[row.rawBrand, displayName(row)].filter(Boolean).join(" ")}
                      onUploaded={(url) => setRowPhoto(row.index, url)}
                      onCleared={() => setRowPhoto(row.index, null)}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit match">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setEditAnchor(e.currentTarget);
                          setEditingIndex(row.index);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {preview.vendorSummary ? <VendorSummaryCard summary={preview.vendorSummary} /> : null}

      <ResolveRowEditor
        anchorEl={editAnchor}
        row={editingRow}
        onClose={closeEditor}
        onApply={applyEdit}
      />
    </Stack>
  );
}

function PriceDeltaBadge({ ctx }: { ctx: RowPriceContext | null }) {
  if (!ctx?.deltaPctVsSameVendor && ctx?.deltaPctVsSameVendor !== 0) return null;
  const pct = ctx.deltaPctVsSameVendor;
  // Bucketing: ≤ -2 green, ±5 gray, +5..10 amber, > 10 red
  let color: "success" | "default" | "warning" | "error";
  let Icon = FlatIcon;
  if (pct <= -2) {
    color = "success";
    Icon = DownIcon;
  } else if (pct <= 5 && pct >= -2) {
    color = "default";
    Icon = FlatIcon;
  } else if (pct <= 10) {
    color = "warning";
    Icon = UpIcon;
  } else {
    color = "error";
    Icon = UpIcon;
  }
  const sign = pct > 0 ? "+" : "";
  return (
    <Tooltip title={`${sign}${pct.toFixed(1)}% vs last buy from same vendor`}>
      <Chip
        size="small"
        icon={<Icon sx={{ fontSize: 14 }} />}
        label={`${sign}${pct.toFixed(0)}%`}
        color={color}
        variant={color === "default" ? "outlined" : "filled"}
        sx={{ height: 20, "& .MuiChip-label": { px: 0.5, fontSize: 11 } }}
      />
    </Tooltip>
  );
}

function VendorSummaryCard({ summary }: { summary: VendorSummary }) {
  const avg = summary.last30Days.avgAmount;
  const ratio = avg > 0 ? summary.thisBill.totalAmount / avg : 0;
  const note =
    avg === 0
      ? "First bill from this vendor in 30 days"
      : ratio < 0.7
        ? "below average"
        : ratio > 1.5
          ? "above average"
          : "within average";
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={0.5}>
        <Typography variant="subtitle2">{summary.vendorName}</Typography>
        <Typography variant="caption" color="text.secondary">
          Last 30 days · {summary.last30Days.billCount} bill
          {summary.last30Days.billCount === 1 ? "" : "s"} · ₹
          {formatNumber(summary.last30Days.totalAmount)} total · avg ₹
          {formatNumber(avg)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          This bill: ₹{formatNumber(summary.thisBill.totalAmount)} ({note})
        </Typography>
      </Stack>
    </Paper>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Day-month-year for an unambiguous read of YYYY-MM-DD dates. */
function formatFullDate(iso: string): string {
  // Parse as local midnight so en-IN display never shifts a day across TZs.
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Recompute a row's warnings after an inline edit. The only warning today is
 * the catalog-vs-bill unit mismatch, keyed off the auto-matched material.
 */
function recomputeWarnings(row: ResolvedPreviewRow, unit: string): string[] {
  const warnings: string[] = [];
  if (
    row.materialMatch.kind === "matched" &&
    row.materialMatch.entity.unit &&
    row.materialMatch.entity.unit !== unit
  ) {
    warnings.push(`catalog says ${row.materialMatch.entity.unit}, bill says ${unit}`);
  }
  return warnings;
}

/**
 * Purchase-date reconciliation card on the Preview step. Shows the date that
 * will actually be committed (editable), and warns when the AI's bill date
 * disagrees with the date picked in the Context step.
 */
function PurchaseDateCard({
  effectiveDate,
  billDate,
  selectedDate,
  onChange,
}: {
  effectiveDate: string;
  billDate: string | null;
  selectedDate: string;
  onChange: (value: string) => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            type="date"
            label="Purchase date"
            value={effectiveDate}
            onChange={(e) => onChange(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
          />
          <Typography variant="caption" color="text.secondary">
            Saved to the bill, price history, and expense.
          </Typography>
        </Stack>

        {billDate !== null && billDate !== selectedDate ? (
          <Alert severity="warning" icon={<WarningIcon />}>
            <Stack spacing={1}>
              <Box component="span">
                The bill appears dated <strong>{formatFullDate(billDate)}</strong>, but you selected{" "}
                <strong>{formatFullDate(selectedDate)}</strong>. We&apos;ll save{" "}
                <strong>{formatFullDate(effectiveDate)}</strong>.
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => onChange(billDate)}
                  disabled={effectiveDate === billDate}
                >
                  Use bill date
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => onChange(selectedDate)}
                  disabled={effectiveDate === selectedDate}
                >
                  Keep my date
                </Button>
              </Stack>
            </Stack>
          </Alert>
        ) : billDate !== null && effectiveDate === billDate ? (
          <Typography variant="caption" color="success.main">
            Bill date {formatFullDate(billDate)} ✓ matches your selection.
          </Typography>
        ) : billDate === null ? (
          <Typography variant="caption" color="text.secondary">
            The AI couldn&apos;t read a date from the bill — saving your selected date{" "}
            {formatFullDate(effectiveDate)}.
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}

function effectiveStatus(row: ResolvedPreviewRow): "matched" | "ambiguous" | "new" {
  if (row.overrideMaterialId) return "matched";
  if (row.overrideMaterialName) return "new";
  return row.materialMatch.kind === "matched"
    ? "matched"
    : row.materialMatch.kind === "ambiguous"
      ? "ambiguous"
      : "new";
}

function displayName(row: ResolvedPreviewRow): string {
  if (row.overrideMaterialId) {
    // A picked size-variant may not be among the fuzzy candidates — check the
    // variant family first so the chosen size shows in the row.
    const fromVariant = row.variantOptions?.find((v) => v.id === row.overrideMaterialId);
    if (fromVariant) return fromVariant.name;
    const candidates =
      row.materialMatch.kind === "matched" || row.materialMatch.kind === "ambiguous"
        ? row.materialMatch.candidates
        : [];
    const found = candidates.find((c) => c.id === row.overrideMaterialId);
    return found ? found.name : row.rawName;
  }
  if (row.overrideMaterialName) return row.overrideMaterialName;
  if (row.materialMatch.kind === "matched") return row.materialMatch.entity.name;
  return row.rawName;
}

function StatusChip({ status }: { status: "matched" | "ambiguous" | "new" }) {
  if (status === "matched") {
    return <Chip size="small" label="MATCH" color="success" sx={{ height: 22 }} />;
  }
  if (status === "ambiguous") {
    return <Chip size="small" label="AMBIG" color="warning" sx={{ height: 22 }} />;
  }
  return <Chip size="small" label="NEW" color="info" sx={{ height: 22 }} />;
}

function vendorMatchLabel(preview: ResolvedPreview): string {
  if (preview.overrideVendorId) {
    const candidates =
      preview.vendorMatch.kind === "matched" || preview.vendorMatch.kind === "ambiguous"
        ? preview.vendorMatch.candidates
        : [];
    return candidates.find((c) => c.id === preview.overrideVendorId)?.name ?? preview.vendorRawName;
  }
  if (preview.vendorMatch.kind === "matched") return preview.vendorMatch.entity.name;
  return preview.vendorRawName;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Per-row product photo upload affordance. Empty state shows a small camera
 * button; populated state shows the thumbnail + a clear (×) action. When the
 * row matched an existing material that already has an image_url, a small
 * "replaces existing" hint shows below the thumbnail (the user sees this
 * BEFORE clicking Confirm, so commit-time overwrite is deliberate).
 *
 * Uploads to the existing `work-updates` storage bucket under `product-photos/`
 * to match the variant photo path used by VariantInlineCard — same bucket,
 * same CDN behavior, no extra storage policy needed.
 */
function PhotoCell({
  photoUrl,
  existingImageUrl,
  rowName,
  searchQuery,
  onUploaded,
  onCleared,
}: {
  photoUrl: string | null;
  existingImageUrl: string | null;
  rowName: string;
  /** "{brand} {name}" prefilled into the online image search. */
  searchQuery?: string;
  onUploaded: (url: string) => void;
  onCleared: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const willReplaceExisting = !!existingImageUrl && !!photoUrl;

  const handlePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Max 5 MB");
      return;
    }
    if (!/^image\/(jpeg|png|webp|jpg)$/i.test(file.type)) {
      setError("JPEG / PNG / WebP only");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const slug = rowName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const filePath = `product-photos/ingest-${slug}-${Date.now()}.${ext}`;
      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "work-updates",
        filePath,
        file,
        contentType: file.type,
      });
      onUploaded(publicUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25 }}>
      {photoUrl ? (
        <Box sx={{ position: "relative", width: 44, height: 44 }}>
          <Box
            component="img"
            src={photoUrl}
            alt={rowName}
            sx={{
              width: 44,
              height: 44,
              objectFit: "cover",
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
            }}
          />
          <Tooltip title="Remove photo" placement="top">
            <IconButton
              size="small"
              onClick={onCleared}
              disabled={uploading}
              aria-label="Remove photo"
              sx={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 18,
                height: 18,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                "&:hover": { bgcolor: "error.light" },
              }}
            >
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Tooltip
          title={existingImageUrl ? "Replace catalog photo" : "Attach product photo"}
          placement="top"
        >
          <IconButton
            size="small"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach photo"
            sx={{
              width: 44,
              height: 44,
              border: "1px dashed",
              borderColor: existingImageUrl ? "warning.main" : "divider",
              borderRadius: 1,
              color: existingImageUrl ? "warning.main" : "text.secondary",
              "&:hover": { borderColor: "primary.main", color: "primary.main" },
            }}
          >
            {uploading ? <CircularProgress size={16} /> : <PhotoCameraIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Find a product image online" placement="top">
        <Button
          size="small"
          startIcon={<ImageSearchIcon sx={{ fontSize: 14 }} />}
          onClick={() => setPickerOpen(true)}
          disabled={uploading}
          sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 9, lineHeight: 1.4 }}
        >
          Find online
        </Button>
      </Tooltip>
      {willReplaceExisting ? (
        <Tooltip title="This material already has a catalog photo. Confirming will replace it." placement="top">
          <Stack direction="row" spacing={0.25} alignItems="center">
            <ReplaceIcon sx={{ fontSize: 10, color: "warning.main" }} />
            <Typography sx={{ fontSize: 9, color: "warning.main", fontWeight: 600 }}>
              replaces
            </Typography>
          </Stack>
        </Tooltip>
      ) : null}
      {error ? (
        <Typography sx={{ fontSize: 9, color: "error.main" }}>{error}</Typography>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handlePicked}
      />
      <ImageSearchPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        defaultQuery={searchQuery?.trim() || rowName}
        onPicked={(url) => onUploaded(url)}
      />
    </Box>
  );
}

// Re-export the row outcome type so consumers don't need a separate import.
export type { RowMatchOutcome };
export type { MaterialMatchCandidate };
