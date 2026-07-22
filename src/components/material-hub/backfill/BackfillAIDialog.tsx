"use client";

/**
 * AI-assisted bulk backfill ingest. Three-step wizard:
 *   1. Copy prompt — auto-generated from live vendor + material + site catalog
 *   2. Paste JSON — tolerant parser handles wrappers + field synonyms
 *   3. Preview rows — per-row tick + inline edit + drafts panel
 *
 * Submits all `_include=true` rows in one record_historical_batch RPC call.
 *
 * Mirrors `BackfillAIModal` in docs/Historical_Material_Backfill/proto-backfill.jsx.
 */

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Box,
  Typography,
  Button,
  Alert,
  TextField,
  MenuItem,
  CircularProgress,
  Autocomplete,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import LinkIcon from "@mui/icons-material/Link";
import { hubTokens } from "@/lib/material-hub/tokens";
import { useVendors } from "@/hooks/queries/useVendors";
import {
  useMaterials,
  useMaterialSearchOptions,
  filterMaterialSearchOptions,
} from "@/hooks/queries/useMaterials";
import {
  matchMaterialClientSide,
  matchVendorClientSide,
} from "@/lib/ai-ingestion/fuzzyMatch";
import type { MaterialSearchOption, Vendor } from "@/types/material.types";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { buildBackfillPrompt } from "@/lib/material-hub/backfill/buildBackfillPrompt";
import {
  parseBackfillResponse,
  type BackfillPreviewRow,
} from "@/lib/material-hub/backfill/normalizeBackfillRow";
import {
  useRecordHistoricalBatch,
  type HistoricalRecord,
} from "@/hooks/queries/useRecordHistoricalBatch";

const HIST_MIN = "2025-11-09";
const HIST_MAX = "2026-05-09";

export interface BackfillAIDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string | undefined;
  siteName?: string;
  onSaved?: () => void;
}

export default function BackfillAIDialog({
  open,
  onClose,
  siteId,
  siteName,
  onSaved,
}: BackfillAIDialogProps) {
  const { data: vendors = [] } = useVendors({ includeDrafts: true });
  const { data: materials = [] } = useMaterials({ includeDrafts: true });
  // Flat option list (material / variant / brand) for the Step-3 link picker.
  const { data: materialOptions = [] } = useMaterialSearchOptions();
  const { data: groupMembership } = useSiteGroupMembership(siteId);

  const mutation = useRecordHistoricalBatch();

  // Lightweight catalogs for the fuzzy "suggested match" chips in the preview.
  const materialCatalog = useMemo(
    () =>
      materials.map((m: any) => ({
        id: m.id,
        name: m.name,
        local_name: m.local_name ?? null,
        category_id: m.category_id ?? null,
        unit: m.unit,
      })),
    [materials]
  );
  const vendorCatalog = useMemo(
    () =>
      vendors.map((v: any) => ({
        id: v.id,
        name: v.name,
        city: v.city ?? null,
        phone: v.phone ?? null,
        gst_number: v.gst_number ?? null,
      })),
    [vendors]
  );

  const sites = useMemo(() => {
    const others = groupMembership?.otherSites ?? [];
    return siteId
      ? [{ id: siteId, name: siteName ?? "This site" }, ...others]
      : [];
  }, [groupMembership, siteId, siteName]);

  const prompt = useMemo(
    () =>
      buildBackfillPrompt({
        vendors: vendors.map((v: any) => ({ id: v.id, name: v.name })),
        materials: materials.map((m: any) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          description: m.description,
          local_name: m.local_name,
        })),
        sites,
      }),
    [vendors, materials, sites]
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pasted, setPasted] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState<BackfillPreviewRow[]>([]);

  const parse = () => {
    try {
      const normalized = parseBackfillResponse(
        pasted,
        vendors.map((v: any) => ({ id: v.id, name: v.name })),
        materials.map((m: any) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          description: m.description,
          local_name: m.local_name,
        }))
      );
      setRows(normalized);
      setParseError("");
      setStep(3);
    } catch (e: any) {
      setParseError(
        (e?.message ?? "Parse failed") +
          ". Make sure you pasted valid JSON, ideally just the array we asked for."
      );
    }
  };

  const validRows = rows.filter(
    (r) =>
      r._include &&
      !!r.vendor &&
      !!r.material &&
      r.qty > 0 &&
      r.amount > 0 &&
      !!r.purchase_date &&
      r.purchase_date >= HIST_MIN &&
      r.purchase_date <= HIST_MAX &&
      (r.kind === "own" ||
        (Array.isArray(r.group_split) &&
          Math.abs(r.group_split.reduce((a, s) => a + s.pct, 0) - 100) < 0.01))
  );

  const submit = async () => {
    if (!siteId || validRows.length === 0) return;
    const records: HistoricalRecord[] = validRows.map((r) => ({
      purchase_date: r.purchase_date,
      vendor: r.vendor_id ? { id: r.vendor_id } : { name: r.vendor },
      items: [
        r.material_id
          ? { material_id: r.material_id, qty: r.qty, amount: r.amount }
          : {
              new_material: { name: r.material, unit: r.unit },
              qty: r.qty,
              amount: r.amount,
            },
      ],
      kind: r.kind,
      group_split: r.kind === "group" ? r.group_split : undefined,
      payment_status: r.payment_status,
      paid_by: r.payment_status === "settled" ? r.paid_by : undefined,
      used_qty: r.used_qty,
      section: r.section,
      notes: r.notes,
    }));
    try {
      await mutation.mutateAsync({ site_id: siteId, records });
      onSaved?.();
      onClose();
      // Reset
      setRows([]);
      setPasted("");
      setStep(1);
    } catch (e) {
      // Surfaces via mutation.error
    }
  };

  const updateRow = (idx: number, patch: Partial<BackfillPreviewRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) =>
    setRows((rs) => rs.filter((_, i) => i !== idx));

  const draftsCount = rows.filter(
    (r) => r._vendorIsDraft || r._materialIsDraft
  ).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={step === 3 ? "lg" : "sm"}
      fullWidth
      PaperProps={{
        sx: { borderRadius: "14px", maxWidth: step === 3 ? 920 : 680 },
      }}
    >
      <DialogTitle
        sx={{
          padding: "16px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${hubTokens.border}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: hubTokens.text }}>
            AI-assisted bulk ingest
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            {step === 1
              ? "Step 1 of 3 · Copy our schema as a prompt, then upload your bills externally in ChatGPT or Gemini."
              : step === 2
                ? "Step 2 of 3 · Paste the JSON the AI returned. We'll parse it row by row."
                : `Step 3 of 3 · Preview ${rows.length} record${rows.length !== 1 ? "s" : ""}. Adjust anything before saving.`}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ padding: "18px 22px" }}>
        {/* Stepper */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px" }}>
          {[1, 2, 3].map((n) => (
            <Box key={n} sx={{ display: "flex", alignItems: "center", flex: n < 3 ? 1 : "0 0 auto" }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: step >= n ? hubTokens.primary : hubTokens.hairline,
                  color: step >= n ? "#fff" : hubTokens.subtle,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: hubTokens.mono,
                }}
              >
                {step > n ? <CheckIcon sx={{ fontSize: 13 }} /> : n}
              </Box>
              {n < 3 && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    background: step > n ? hubTokens.primary : hubTokens.hairline,
                    marginLeft: "6px",
                    marginRight: "6px",
                  }}
                />
              )}
            </Box>
          ))}
        </Box>

        {step === 1 && <Step1CopyPrompt prompt={prompt} />}
        {step === 2 && (
          <Step2PasteJson pasted={pasted} onChange={setPasted} parseError={parseError} />
        )}
        {step === 3 && (
          <Step3Preview
            rows={rows}
            sites={sites}
            onUpdate={updateRow}
            onRemove={removeRow}
            draftsCount={draftsCount}
            materialOptions={materialOptions}
            materialCatalog={materialCatalog}
            vendors={vendors}
            vendorCatalog={vendorCatalog}
          />
        )}

        {mutation.error && (
          <Alert severity="error" sx={{ marginTop: "12px", fontSize: 12 }}>
            {(mutation.error as Error).message}
          </Alert>
        )}
      </DialogContent>

      <DialogActions
        sx={{ padding: "12px 22px", borderTop: `1px solid ${hubTokens.border}` }}
      >
        <Button
          size="small"
          onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2 | 3) : onClose())}
        >
          {step > 1 ? "Back" : "Cancel"}
        </Button>
        {step === 1 && (
          <Button variant="contained" size="small" onClick={() => setStep(2)}>
            I&apos;ve got the JSON →
          </Button>
        )}
        {step === 2 && (
          <Button variant="contained" size="small" disabled={!pasted} onClick={parse}>
            Parse JSON
          </Button>
        )}
        {step === 3 && (
          <Button
            variant="contained"
            size="small"
            disabled={validRows.length === 0 || mutation.isPending}
            onClick={submit}
            startIcon={
              mutation.isPending ? (
                <CircularProgress size={14} sx={{ color: "inherit" }} />
              ) : undefined
            }
          >
            Ingest {validRows.length} record{validRows.length !== 1 ? "s" : ""}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Step 1
// ----------------------------------------------------------------------------

function Step1CopyPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Box>
      <Box
        sx={{
          padding: "12px 14px",
          background: hubTokens.primarySoft,
          borderRadius: "9px",
          marginBottom: "14px",
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: hubTokens.primary, marginBottom: "6px" }}>
          How to use this
        </Typography>
        <Box
          component="ol"
          sx={{ margin: 0, paddingLeft: "18px", fontSize: 11.5, color: hubTokens.muted, lineHeight: 1.7 }}
        >
          <li>
            Tap <b>Copy prompt</b> below — it includes our schema + vendor &amp; material catalog.
          </li>
          <li>Open ChatGPT (free tier works) or Gemini. Paste the prompt.</li>
          <li>Attach photos of your bills — one or many. The AI will read them.</li>
          <li>It&apos;ll return a JSON array. Copy it back here in step 2.</li>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: hubTokens.text,
            letterSpacing: "0.2px",
            textTransform: "uppercase",
          }}
        >
          Prompt (auto-generated)
        </Typography>
        <Button
          size="small"
          variant="contained"
          color={copied ? "success" : "primary"}
          onClick={copy}
          startIcon={copied ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
        >
          {copied ? "Copied!" : "Copy prompt"}
        </Button>
      </Box>

      <Box
        component="pre"
        sx={{
          margin: 0,
          padding: "14px 16px",
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: "10px",
          fontSize: 11,
          fontFamily: hubTokens.mono,
          lineHeight: 1.55,
          maxHeight: 340,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {prompt}
      </Box>
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Step 2
// ----------------------------------------------------------------------------

function Step2PasteJson({
  pasted,
  onChange,
  parseError,
}: {
  pasted: string;
  onChange: (v: string) => void;
  parseError: string;
}) {
  return (
    <Box>
      <Box
        sx={{
          padding: "10px 12px",
          background: hubTokens.warnSoft,
          borderRadius: "9px",
          marginBottom: "12px",
        }}
      >
        <Typography sx={{ fontSize: 11.5, color: hubTokens.warn, fontWeight: 600 }}>
          Paste the entire JSON response. We&apos;ll show every row before saving — nothing&apos;s committed yet.
        </Typography>
      </Box>
      <TextField
        fullWidth
        multiline
        minRows={12}
        maxRows={20}
        value={pasted}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`[{"vendor": "Sathish Cement", "material": "PPC Cement", "qty": 200, "amount": 58000, ...}, ...]`}
        sx={{
          "& .MuiInputBase-input": {
            fontFamily: hubTokens.mono,
            fontSize: 11.5,
            lineHeight: 1.55,
          },
        }}
        error={!!parseError}
      />
      {parseError && (
        <Alert severity="error" sx={{ marginTop: "8px", fontSize: 11.5 }}>
          {parseError}
        </Alert>
      )}
      <Box
        sx={{
          marginTop: "10px",
          padding: "9px 12px",
          background: hubTokens.bg,
          borderRadius: "8px",
        }}
      >
        <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
          Don&apos;t have JSON yet? Go back to step 1 and copy the prompt.
        </Typography>
      </Box>
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Step 3
// ----------------------------------------------------------------------------

type MaterialCatalogRow = {
  id: string;
  name: string;
  local_name: string | null;
  category_id: string | null;
  unit: string;
};
type VendorCatalogRow = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  gst_number: string | null;
};

interface Step3PreviewProps {
  rows: BackfillPreviewRow[];
  sites: { id: string; name: string }[];
  onUpdate: (idx: number, patch: Partial<BackfillPreviewRow>) => void;
  onRemove: (idx: number) => void;
  draftsCount: number;
  materialOptions: MaterialSearchOption[];
  materialCatalog: MaterialCatalogRow[];
  vendors: Vendor[];
  vendorCatalog: VendorCatalogRow[];
}

function Step3Preview({
  rows,
  sites,
  onUpdate,
  onRemove,
  draftsCount,
  materialOptions,
  materialCatalog,
  vendors,
  vendorCatalog,
}: Step3PreviewProps) {
  const included = rows.filter((r) => r._include).length;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          background: hubTokens.primarySoft,
          borderRadius: "9px",
          marginBottom: "12px",
        }}
      >
        <CheckIcon sx={{ fontSize: 16, color: hubTokens.primary }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: hubTokens.primary }}>
            {rows.length} records parsed · {included} to ingest ·{" "}
            {draftsCount > 0
              ? `${draftsCount} need${draftsCount === 1 ? "s" : ""} draft approval`
              : "all matched"}
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
            Review each row. Untick to skip. Edit anything inline.
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          background: "#fff",
          border: `1px solid ${hubTokens.border}`,
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <Box sx={{ maxHeight: 430, overflow: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontFamily: hubTokens.font,
              fontSize: 11.5,
              minWidth: 820,
            }}
          >
            <thead>
              <tr>
                {["", "Date", "Vendor", "Material", "Qty", "Amount", "Kind", "Pay", ""].map(
                  (h, i) => (
                    <Box
                      component="th"
                      key={i}
                      sx={{
                        position: "sticky",
                        top: 0,
                        background: hubTokens.bg,
                        zIndex: 1,
                        padding: "9px 10px",
                        borderBottom: `1px solid ${hubTokens.border}`,
                        textAlign: "left",
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: hubTokens.muted,
                        letterSpacing: "0.4px",
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </Box>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <PreviewRow
                  key={i}
                  r={r}
                  sites={sites}
                  onUpdate={(p) => onUpdate(i, p)}
                  onRemove={() => onRemove(i)}
                  materialOptions={materialOptions}
                  materialCatalog={materialCatalog}
                  vendors={vendors}
                  vendorCatalog={vendorCatalog}
                />
              ))}
            </tbody>
          </Box>
        </Box>
      </Box>

      {draftsCount > 0 && (
        <Box
          sx={{
            marginTop: "10px",
            padding: "10px 12px",
            background: hubTokens.warnSoft,
            borderRadius: "8px",
          }}
        >
          <Typography
            sx={{ fontSize: 11.5, color: hubTokens.warn, fontWeight: 600, lineHeight: 1.5 }}
          >
            {draftsCount} record{draftsCount !== 1 ? "s" : ""} reference vendors or materials not in your catalog. They&apos;ll be saved as <b>drafts</b> — office reviews them later. Records still ingest now.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function PreviewRow({
  r,
  sites,
  onUpdate,
  onRemove,
  materialOptions,
  materialCatalog,
  vendors,
  vendorCatalog,
}: {
  r: BackfillPreviewRow;
  sites: { id: string; name: string }[];
  onUpdate: (patch: Partial<BackfillPreviewRow>) => void;
  onRemove: () => void;
  materialOptions: MaterialSearchOption[];
  materialCatalog: MaterialCatalogRow[];
  vendors: Vendor[];
  vendorCatalog: VendorCatalogRow[];
}) {
  const cellSx = {
    padding: "7px 10px",
    borderBottom: `1px solid ${hubTokens.hairline}`,
    fontSize: 11.5,
    verticalAlign: "middle" as const,
  };

  const draftTag = {
    padding: "1px 5px",
    borderRadius: "3px",
    background: hubTokens.warnSoft,
    color: hubTokens.warn,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.3px",
  };

  const inlineInput = (w: number) => ({
    width: w,
    padding: "4px 6px",
    background: "#fff",
    border: `1px solid ${hubTokens.hairline}`,
    borderRadius: "5px",
    fontSize: 11.5,
    color: hubTokens.text,
    fontFamily: hubTokens.font,
    outline: "none",
  });

  return (
    <Box
      component="tr"
      sx={{ opacity: r._include ? 1 : 0.5, background: r._include ? "#fff" : hubTokens.bg }}
    >
      <Box component="td" sx={{ ...cellSx, padding: "7px 6px 7px 10px", width: 36 }}>
        <input
          type="checkbox"
          checked={r._include}
          onChange={(e) => onUpdate({ _include: e.target.checked })}
          style={{ cursor: "pointer" }}
        />
      </Box>
      <Box component="td" sx={cellSx}>
        <input
          type="date"
          value={r.purchase_date}
          min={HIST_MIN}
          max={HIST_MAX}
          onChange={(e) => onUpdate({ purchase_date: e.target.value })}
          style={inlineInput(115)}
        />
      </Box>
      <Box component="td" sx={cellSx}>
        <VendorLinkCell
          r={r}
          vendors={vendors}
          catalog={vendorCatalog}
          onUpdate={onUpdate}
          draftTag={draftTag}
        />
      </Box>
      <Box component="td" sx={cellSx}>
        <MaterialLinkCell
          r={r}
          options={materialOptions}
          catalog={materialCatalog}
          onUpdate={onUpdate}
          draftTag={draftTag}
        />
      </Box>
      <Box component="td" sx={cellSx}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            type="number"
            value={r.qty}
            onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            style={{ ...inlineInput(54), fontFamily: hubTokens.mono, textAlign: "right" }}
          />
          <Box component="span" sx={{ fontSize: 10, color: hubTokens.subtle, fontWeight: 600 }}>
            {r.unit}
          </Box>
        </Box>
      </Box>
      <Box component="td" sx={cellSx}>
        <input
          type="number"
          value={r.amount}
          onChange={(e) => onUpdate({ amount: parseFloat(e.target.value) || 0 })}
          style={{ ...inlineInput(80), fontFamily: hubTokens.mono, textAlign: "right" }}
        />
      </Box>
      <Box component="td" sx={cellSx}>
        <select
          value={r.kind}
          onChange={(e) => onUpdate({ kind: e.target.value as "own" | "group" })}
          style={{ ...inlineInput(72), appearance: "auto" }}
        >
          <option value="own">Own</option>
          <option value="group">Group</option>
        </select>
        {r.kind === "group" && r.group_split && (
          <Box sx={{ display: "flex", gap: "2px", marginTop: "3px", flexWrap: "wrap" }}>
            {r.group_split.map((s, j) => {
              const site = sites.find((x) => x.id === s.site_id);
              return (
                <Box
                  key={j}
                  component="span"
                  sx={{
                    fontSize: 9,
                    padding: "1px 4px",
                    borderRadius: "3px",
                    background: hubTokens.primarySoft,
                    color: hubTokens.primary,
                    fontWeight: 700,
                  }}
                >
                  {(site?.name ?? "?").slice(0, 4).toUpperCase()} {s.pct}%
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
      <Box component="td" sx={cellSx}>
        <select
          value={r.payment_status}
          onChange={(e) =>
            onUpdate({ payment_status: e.target.value as "settled" | "pending" })
          }
          style={{ ...inlineInput(80), appearance: "auto" }}
        >
          <option value="settled">Paid</option>
          <option value="pending">Owed</option>
        </select>
      </Box>
      <Box component="td" sx={cellSx}>
        <IconButton onClick={onRemove} size="small" sx={{ width: 24, height: 24 }}>
          <CloseIcon sx={{ fontSize: 12, color: hubTokens.muted }} />
        </IconButton>
      </Box>
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Link-to-existing pickers (material + vendor) for the Step-3 preview.
// A picker lets the user attach a row to an existing catalog entry (by name,
// local name, brand or size variant) before ingest, instead of minting a
// duplicate draft. Exact matches are auto-linked at parse time; anything left
// as a draft (+M / +V) gets a one-tap fuzzy "Link → …" suggestion here.
// ----------------------------------------------------------------------------

function MaterialLinkCell({
  r,
  options,
  catalog,
  onUpdate,
  draftTag,
}: {
  r: BackfillPreviewRow;
  options: MaterialSearchOption[];
  catalog: MaterialCatalogRow[];
  onUpdate: (patch: Partial<BackfillPreviewRow>) => void;
  draftTag: any;
}) {
  const selectedOption = useMemo(
    () =>
      r.material_id
        ? options.find((o) => (o.variant?.id ?? o.material.id) === r.material_id) ??
          null
        : null,
    [r.material_id, options]
  );

  const suggestion = useMemo(() => {
    if (!r._materialIsDraft || !r.material.trim()) return null;
    const res = matchMaterialClientSide(r.material, catalog, { limit: 1 });
    if (res.status === "matched") return res.entity;
    if (res.status === "ambiguous") return res.candidates[0] ?? null;
    return null;
  }, [r._materialIsDraft, r.material, catalog]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 200 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <Autocomplete
          freeSolo
          fullWidth
          size="small"
          options={options}
          value={selectedOption}
          inputValue={r.material}
          getOptionLabel={(o) => (typeof o === "string" ? o : o.displayName)}
          getOptionKey={(o) => (typeof o === "string" ? o : o.id)}
          isOptionEqualToValue={(o, v) =>
            typeof o !== "string" && typeof v !== "string" && o.id === v.id
          }
          filterOptions={(opts, state) =>
            filterMaterialSearchOptions(opts as MaterialSearchOption[], state.inputValue)
          }
          onInputChange={(_, value, reason) => {
            if (reason === "input") {
              onUpdate({
                material: value,
                material_id: null,
                _materialIsDraft: !!value.trim(),
              });
            }
          }}
          onChange={(_, val) => {
            if (val && typeof val !== "string") {
              onUpdate({
                material_id: val.variant?.id ?? val.material.id,
                material: val.displayName,
                unit: val.unit || r.unit,
                _materialIsDraft: false,
              });
            } else if (val === null) {
              onUpdate({ material_id: null, material: "", _materialIsDraft: false });
            }
          }}
          slotProps={{ popper: { disablePortal: false } }}
          renderOption={(props, o) => {
            const { key, ...rest } = props as any;
            return (
              <Box component="li" key={key} {...rest}>
                <Box>
                  <Typography sx={{ fontSize: 12, color: hubTokens.text }}>
                    {o.displayName}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: hubTokens.muted }}>
                    {o.contextLabel}
                  </Typography>
                </Box>
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              placeholder="Search material / variant…"
              sx={{ "& .MuiInputBase-input": { fontSize: 11.5, padding: "2px 0" } }}
            />
          )}
        />
        {r._materialIsDraft && (
          <Box component="span" sx={draftTag} title="New material — will save as draft">
            +M
          </Box>
        )}
      </Box>
      {suggestion && (
        <Chip
          size="small"
          icon={<LinkIcon sx={{ fontSize: 12 }} />}
          label={`Link → ${suggestion.name}`}
          onClick={() =>
            onUpdate({
              material_id: suggestion.id,
              material: suggestion.name,
              unit: suggestion.unit || r.unit,
              _materialIsDraft: false,
            })
          }
          sx={{
            alignSelf: "flex-start",
            height: 20,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            background: hubTokens.primarySoft,
            color: hubTokens.primary,
            "& .MuiChip-icon": { color: hubTokens.primary },
          }}
        />
      )}
    </Box>
  );
}

function VendorLinkCell({
  r,
  vendors,
  catalog,
  onUpdate,
  draftTag,
}: {
  r: BackfillPreviewRow;
  vendors: Vendor[];
  catalog: VendorCatalogRow[];
  onUpdate: (patch: Partial<BackfillPreviewRow>) => void;
  draftTag: any;
}) {
  const selectedVendor = useMemo(
    () => (r.vendor_id ? vendors.find((v) => v.id === r.vendor_id) ?? null : null),
    [r.vendor_id, vendors]
  );

  const suggestion = useMemo(() => {
    if (!r._vendorIsDraft || !r.vendor.trim()) return null;
    const res = matchVendorClientSide(r.vendor, catalog, { limit: 1 });
    if (res.status === "matched") return res.entity;
    if (res.status === "ambiguous") return res.candidates[0] ?? null;
    return null;
  }, [r._vendorIsDraft, r.vendor, catalog]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 180 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <Autocomplete
          freeSolo
          fullWidth
          size="small"
          options={vendors}
          value={selectedVendor}
          inputValue={r.vendor}
          getOptionLabel={(v) => (typeof v === "string" ? v : v.name)}
          getOptionKey={(v) => (typeof v === "string" ? v : v.id)}
          isOptionEqualToValue={(o, v) =>
            typeof o !== "string" && typeof v !== "string" && o.id === v.id
          }
          onInputChange={(_, value, reason) => {
            if (reason === "input") {
              onUpdate({
                vendor: value,
                vendor_id: null,
                _vendorIsDraft: !!value.trim(),
              });
            }
          }}
          onChange={(_, val) => {
            if (val && typeof val !== "string") {
              onUpdate({ vendor_id: val.id, vendor: val.name, _vendorIsDraft: false });
            } else if (val === null) {
              onUpdate({ vendor_id: null, vendor: "", _vendorIsDraft: false });
            }
          }}
          slotProps={{ popper: { disablePortal: false } }}
          renderOption={(props, v) => {
            const { key, ...rest } = props as any;
            return (
              <Box component="li" key={key} {...rest}>
                <Box>
                  <Typography sx={{ fontSize: 12, color: hubTokens.text }}>
                    {v.name}
                  </Typography>
                  {(v.city || v.phone) && (
                    <Typography sx={{ fontSize: 10, color: hubTokens.muted }}>
                      {[v.city, v.phone].filter(Boolean).join(" · ")}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              placeholder="Search vendor…"
              sx={{ "& .MuiInputBase-input": { fontSize: 11.5, padding: "2px 0" } }}
            />
          )}
        />
        {r._vendorIsDraft && (
          <Box component="span" sx={draftTag} title="New vendor — will save as draft">
            +V
          </Box>
        )}
      </Box>
      {suggestion && (
        <Chip
          size="small"
          icon={<LinkIcon sx={{ fontSize: 12 }} />}
          label={`Link → ${suggestion.name}`}
          onClick={() =>
            onUpdate({
              vendor_id: suggestion.id,
              vendor: suggestion.name,
              _vendorIsDraft: false,
            })
          }
          sx={{
            alignSelf: "flex-start",
            height: 20,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            background: hubTokens.primarySoft,
            color: hubTokens.primary,
            "& .MuiChip-icon": { color: hubTokens.primary },
          }}
        />
      )}
    </Box>
  );
}
