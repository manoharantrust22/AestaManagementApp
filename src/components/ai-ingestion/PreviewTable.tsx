/**
 * Resolved-preview table. Each row carries a NEW / MATCH / AMBIGUOUS chip and
 * an "edit" button that opens ResolveRowEditor.
 */

"use client";

import { useState } from "react";
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Paper,
  Alert,
} from "@mui/material";
import { Edit as EditIcon, Warning as WarningIcon } from "@mui/icons-material";

import type {
  ResolvedPreview,
  ResolvedPreviewRow,
  RowMatchOutcome,
} from "@/lib/ai-ingestion/types";
import type { MaterialMatchCandidate } from "@/lib/ai-ingestion/fuzzyMatch";
import ResolveRowEditor from "./ResolveRowEditor";

interface PreviewTableProps {
  preview: ResolvedPreview;
  summary: string;
  onPatch: (patch: (prev: ResolvedPreview) => ResolvedPreview) => void;
}

export default function PreviewTable({ preview, summary, onPatch }: PreviewTableProps) {
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
            }
          : r,
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
                    <Typography variant="body2">₹{formatNumber(row.unitPrice)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {row.totalPrice !== null ? `₹${formatNumber(row.totalPrice)}` : "—"}
                    </Typography>
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

      <ResolveRowEditor
        anchorEl={editAnchor}
        row={editingRow}
        onClose={closeEditor}
        onApply={applyEdit}
      />
    </Stack>
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

// Re-export the row outcome type so consumers don't need a separate import.
export type { RowMatchOutcome };
export type { MaterialMatchCandidate };
