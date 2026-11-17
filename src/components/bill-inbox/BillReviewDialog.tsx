"use client";

/**
 * Check a bill the reader has read, fix what is wrong, and save it as a
 * purchase. Reuses the AI-ingestion preview (material matching, price
 * context, inline row edits) and its save path (ingest_purchase_atomic), so a
 * bill saved here lands exactly like an AI Quick Bill does today.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, OpenInNew as OpenIcon } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import PreviewTable from "@/components/ai-ingestion/PreviewTable";
import CommitProgress from "@/components/ai-ingestion/CommitProgress";
import { useIsMobile } from "@/hooks/useIsMobile";
import { createPurchaseMode } from "@/lib/ai-ingestion/modes/purchase";
import { matchVendorClientSide, type VendorMatchCandidate } from "@/lib/ai-ingestion/fuzzyMatch";
import type { CommitState, IngestionContext, ResolvedPreview } from "@/lib/ai-ingestion/types";
import {
  DOC_KINDS,
  DOC_KIND_LABEL,
  extractionWarnings,
  toPurchaseOutput,
  type BillDocKind,
} from "@/lib/bill-inbox/schema";
import { createClient } from "@/lib/supabase/client";
import { billFileUrl, useMarkBillConfirmed, useUpdateBill } from "@/hooks/queries/usePurchaseDocuments";
import type { PurchaseDocument } from "@/types/bill-inbox.types";

import VendorNameField, { useVendorOptions, type VendorOption } from "./VendorNameField";

const NOT_A_PURCHASE: BillDocKind[] = ["transport_slip", "payment_receipt"];

interface Props {
  doc: PurchaseDocument;
  onClose: () => void;
}

function asCandidate(v: VendorOption): VendorMatchCandidate {
  return { id: v.id, name: v.name, city: v.city, phone: v.phone, gst_number: v.gst_number, score: 1 };
}

export default function BillReviewDialog({ doc, onClose }: Props) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const mode = useMemo(() => createPurchaseMode(qc), [qc]);
  const { data: vendors = [] } = useVendorOptions();
  const updateBill = useUpdateBill();
  const markConfirmed = useMarkBillConfirmed();

  const x = doc.extraction;
  const capturedDate = dayjs(doc.captured_at).format("YYYY-MM-DD");

  const [vendorName, setVendorName] = useState(doc.vendor_name ?? x?.vendor.name ?? "");
  const [vendorId, setVendorId] = useState<string | null>(doc.vendor_id);
  const [total, setTotal] = useState<string>(
    doc.total_amount != null ? String(doc.total_amount) : x?.total_amount != null ? String(x.total_amount) : "",
  );
  const [invoiceNo, setInvoiceNo] = useState(doc.invoice_no ?? x?.invoice_no ?? "");
  const [docKind, setDocKind] = useState<BillDocKind>(doc.doc_kind);
  const [preview, setPreview] = useState<ResolvedPreview | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [commitState, setCommitState] = useState<CommitState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRef, setSavedRef] = useState<string | null>(null);
  // Set once the purchase exists, so a retry only re-links the bill and never saves it twice.
  const [committed, setCommitted] = useState<{ purchase_id: string | null; vendor_id: string; ref_code: string | null } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const ctx: IngestionContext = useMemo(
    () => ({
      siteId: doc.site_id,
      defaultDate: capturedDate,
      billUrls: [billFileUrl(doc.storage_path, doc.storage_bucket) ?? ""].filter(Boolean),
      recordAsSiteExpense: true,
    }),
    [doc.site_id, doc.storage_path, doc.storage_bucket, capturedDate],
  );

  // Build the preview once from the reading.
  useEffect(() => {
    if (!x) return;
    let cancelled = false;
    (async () => {
      try {
        const parsed = toPurchaseOutput(x, { vendorName: vendorName || null, fallbackDate: capturedDate });
        if (parsed.items.length === 0) {
          setResolveError("No item lines were read. Read the bill again or reject it.");
          return;
        }
        const p = await mode.resolvePreview(parsed, ctx);
        if (!cancelled) setPreview(p);
      } catch (err) {
        if (!cancelled) setResolveError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // A vendor known by GSTIN wins over the name match once the catalog is loaded.
  useEffect(() => {
    if (!preview || !vendorId) return;
    const v = (vendors as VendorOption[]).find((o) => o.id === vendorId);
    if (v && !(preview.vendorMatch.kind === "matched" && preview.vendorMatch.entity.id === v.id)) {
      setPreview({ ...preview, vendorRawName: v.name, overrideVendorId: null, vendorMatch: { kind: "matched", entity: asCandidate(v), score: 1, candidates: [asCandidate(v)] } });
    }
  }, [preview, vendorId, vendors]);

  const onVendorChange = ({ name, vendor }: { name: string; vendor: VendorOption | null }) => {
    setVendorName(name);
    setVendorId(vendor?.id ?? null);
    if (!preview) return;
    if (vendor) {
      setPreview({ ...preview, vendorRawName: vendor.name, overrideVendorId: null, vendorMatch: { kind: "matched", entity: asCandidate(vendor), score: 1, candidates: [asCandidate(vendor)] } });
      return;
    }
    const m = matchVendorClientSide(name, vendors as Parameters<typeof matchVendorClientSide>[1]);
    setPreview({
      ...preview,
      vendorRawName: name,
      overrideVendorId: null,
      vendorMatch:
        m.status === "matched"
          ? { kind: "matched", entity: m.entity, score: m.score, candidates: m.candidates }
          : m.status === "ambiguous"
            ? { kind: "ambiguous", candidates: m.candidates, chosenId: null }
            : { kind: "new", suggestedName: name },
    });
  };

  const warnings = x ? extractionWarnings(x) : [];
  const totalNum = Number(total);
  const blockedKind = NOT_A_PURCHASE.includes(docKind);
  const canSave =
    !!preview && !!doc.site_id && vendorName.trim().length > 0 && totalNum > 0 && preview.rows.length > 0 && !blockedKind;
  const saving = commitState != null && commitState.phase !== "failed" && commitState.phase !== "complete";

  const save = async () => {
    if (!preview || !x || !canSave) return;
    setSaveError(null);
    let result = committed;
    try {
      // Never save the same bill twice (e.g. a second tap after a slow network).
      const { data: fresh } = await createClient()
        .from("purchase_documents")
        .select("status, purchase_expense_id")
        .eq("id", doc.id)
        .single();
      if (!committed && (fresh?.status === "confirmed" || fresh?.purchase_expense_id)) {
        setSaveError("This bill has already been saved.");
        return;
      }
      const parsed = {
        ...toPurchaseOutput(x, { vendorName: vendorName.trim(), fallbackDate: capturedDate, totalAmount: totalNum }),
        invoice_no: invoiceNo.trim() || null,
      };
      if (!result) {
        result = await mode.commit({ parsed, preview, ctx, onPhaseChange: setCommitState });
        setCommitted(result);
      }
      await markConfirmed.mutateAsync({
        id: doc.id,
        purchaseExpenseId: result.purchase_id,
        vendorId: result.vendor_id,
        vendorName: vendorName.trim(),
        invoiceNo: invoiceNo.trim() || null,
        invoiceDate: preview.effectiveDate ?? parsed.purchase_date ?? capturedDate,
        totalAmount: totalNum,
      });
      setSavedRef(result.ref_code ?? "saved");
    } catch (err) {
      setCommitState({ phase: "failed", message: "Save failed", error: (err as Error).message });
      setSaveError(
        result
          ? `The purchase was saved but the bill could not be marked as saved: ${(err as Error).message}. Tap Save again to retry.`
          : (err as Error).message,
      );
    }
  };

  const reject = async () => {
    await updateBill.mutateAsync({ id: doc.id, patch: { status: "rejected", notes: rejectNote.trim() || null } });
    onClose();
  };

  const saveHeaderOnly = async () => {
    await updateBill.mutateAsync({
      id: doc.id,
      patch: {
        vendor_name: vendorName.trim() || null,
        vendor_id: vendorId,
        invoice_no: invoiceNo.trim() || null,
        total_amount: totalNum > 0 ? totalNum : null,
        ...(docKind !== doc.doc_kind ? { doc_kind: docKind } : {}),
      },
    });
    onClose();
  };

  const previewUrl = billFileUrl(doc.preview_path ?? doc.storage_path, doc.storage_bucket);
  const originalUrl = billFileUrl(doc.storage_path, doc.storage_bucket);
  const isPdf = (doc.mime_type ?? "").includes("pdf") && !doc.preview_path;

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={isMobile} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="div" noWrap>
            Check bill
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            Captured {dayjs(doc.captured_at).format("DD MMM YYYY, h:mm A")}
            {doc.uploader?.name ? ` by ${doc.uploader.name}` : ""}
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {savedRef ? (
          <Alert severity="success">
            Saved as purchase <strong>{savedRef}</strong>. It now appears in material expenses and price history.
          </Alert>
        ) : commitState && commitState.phase !== "failed" ? (
          <CommitProgress state={commitState} />
        ) : (
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
            {/* Bill photo */}
            <Box sx={{ width: { xs: "100%", md: 340 }, flexShrink: 0, position: { md: "sticky" }, top: 0 }}>
              {isPdf ? (
                <Button component="a" href={originalUrl ?? "#"} target="_blank" rel="noreferrer" startIcon={<OpenIcon />} variant="outlined" fullWidth>
                  Open PDF
                </Button>
              ) : previewUrl ? (
                <Box
                  component="a"
                  href={originalUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ display: "block", border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}
                >
                  <Box
                    component="img"
                    src={previewUrl}
                    alt="Bill photo"
                    sx={{ width: "100%", maxHeight: { xs: 260, md: "70vh" }, objectFit: "contain", display: "block", bgcolor: "grey.100" }}
                  />
                </Box>
              ) : null}
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                Tap the photo to open the full-size original.
              </Typography>
            </Box>

            {/* Fields */}
            <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
              <Stack spacing={1.5}>
                {doc.duplicate_of_id && (
                  <Alert severity="warning">
                    This looks like a bill that is already in the inbox (same invoice number, date or total). Reject it if it
                    is the same bill.
                  </Alert>
                )}
                {x?.reader_notes && <Alert severity="info">{x.reader_notes}</Alert>}
                {warnings.length > 0 && (
                  <Alert severity="warning">
                    {warnings.map((w) => (
                      <div key={w}>{w}</div>
                    ))}
                  </Alert>
                )}
                {doc.confidence != null && doc.confidence < 0.6 && (
                  <Alert severity="warning">The photo was hard to read. Check every line against the bill.</Alert>
                )}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Box sx={{ flex: 2 }}>
                    <VendorNameField
                      value={vendorName}
                      vendorId={vendorId}
                      onChange={onVendorChange}
                      helperText={
                        doc.vendor_name_pending && !vendorName
                          ? "Not on the bill. Whoever bought it, please add the shop name."
                          : doc.vendor_gstin
                            ? `GSTIN ${doc.vendor_gstin}`
                            : undefined
                      }
                    />
                  </Box>
                  <TextField
                    select
                    size="small"
                    label="Type"
                    value={docKind === "unknown" ? "other" : docKind}
                    onChange={(e) => setDocKind(e.target.value as BillDocKind)}
                    sx={{ flex: 1, minWidth: 150 }}
                  >
                    {DOC_KINDS.map((k) => (
                      <MenuItem key={k} value={k}>
                        {DOC_KIND_LABEL[k]}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    size="small"
                    label="Bill total (₹)"
                    type="number"
                    inputMode="decimal"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Bill no."
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                {x && (x.discount || x.round_off || x.tax_amount || x.transport_cost) ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {x.subtotal != null && <Chip size="small" variant="outlined" label={`Subtotal ₹${x.subtotal}`} />}
                    {x.discount ? <Chip size="small" variant="outlined" label={`Discount ₹${x.discount}`} /> : null}
                    {x.round_off ? <Chip size="small" variant="outlined" label={`Round-off ${x.round_off}`} /> : null}
                    {x.tax_amount ? <Chip size="small" variant="outlined" label={`Tax ₹${x.tax_amount}`} /> : null}
                    {x.transport_cost ? <Chip size="small" variant="outlined" label={`Transport ₹${x.transport_cost}`} /> : null}
                  </Stack>
                ) : null}

                {blockedKind && (
                  <Alert severity="info">
                    {DOC_KIND_LABEL[docKind]}s are kept in the inbox for now. Linking them to their bill comes in the next step
                    of this feature. Change the type if this is really a bill.
                  </Alert>
                )}
                {(docKind === "quotation" || docKind === "estimate") && (
                  <Alert severity="info">Marked as {DOC_KIND_LABEL[docKind].toLowerCase()}. Save it only if these items were actually bought.</Alert>
                )}
                {!doc.site_id && <Alert severity="error">This bill has no site. It cannot be saved as a purchase.</Alert>}

                {!x ? (
                  <Alert severity="info">This bill has not been read yet.</Alert>
                ) : resolveError ? (
                  <Alert severity="error">{resolveError}</Alert>
                ) : !preview ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={28} />
                  </Box>
                ) : (
                  <PreviewTable
                    preview={preview}
                    summary={`${vendorName || "Shop name needed"} · ${preview.rows.length} item${preview.rows.length === 1 ? "" : "s"}`}
                    onPatch={(fn) => setPreview((p) => (p ? fn(p) : p))}
                  />
                )}

                {saveError && <Alert severity="error">{saveError}</Alert>}

                {rejecting && (
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <TextField
                      size="small"
                      fullWidth
                      autoFocus
                      label="Why reject? (e.g. duplicate, not our bill)"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <Button color="error" variant="contained" onClick={reject} disabled={!rejectNote.trim() || updateBill.isPending}>
                      Reject
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: "wrap" }}>
        {savedRef ? (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            {!rejecting && (
              <Button color="error" onClick={() => setRejecting(true)} disabled={saving}>
                Reject
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Button onClick={saveHeaderOnly} disabled={saving || updateBill.isPending}>
              Save for later
            </Button>
            <Button variant="contained" onClick={save} disabled={!canSave || saving}>
              {saving ? "Saving…" : "Save as purchase"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
