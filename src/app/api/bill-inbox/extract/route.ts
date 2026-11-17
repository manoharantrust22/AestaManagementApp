import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { extractBill, MAX_INLINE_BYTES } from "@/lib/bill-inbox/extract";
import { LOW_CONFIDENCE, normalizeGstin, normalizeInvoiceNo, type BillExtraction } from "@/lib/bill-inbox/schema";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { documentId } -> reads one Bill Inbox document with Gemini.
 *
 * Runs under the caller's RLS client, so a user can only read bills for sites
 * they can access. Never blocks capture: a failure leaves the document in the
 * inbox with status 'failed' and the error, ready for "Read again".
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: "Bill reading is not configured (GEMINI_API_KEY)" }, { status: 503 });
  }

  let documentId: string | null = null;
  try {
    const body = await request.json();
    documentId = typeof body?.documentId === "string" ? body.documentId : null;
  } catch {
    // fall through
  }
  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

  const { data: profile } = await supabase.from("users").select("id").eq("auth_id", user.id).maybeSingle();
  const userId = profile?.id ?? null;

  const { data: doc, error: docErr } = await supabase
    .from("purchase_documents")
    .select("id, site_id, status, storage_bucket, storage_path, preview_path, mime_type, extract_attempts")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  if (doc.status === "confirmed" || doc.status === "rejected") {
    return NextResponse.json({ error: `Bill is already ${doc.status}` }, { status: 409 });
  }

  await supabase
    .from("purchase_documents")
    .update({ status: "extracting", extract_attempts: (doc.extract_attempts ?? 0) + 1, extraction_error: null })
    .eq("id", doc.id);

  const fail = async (message: string, status = 502) => {
    await supabase.from("purchase_documents").update({ status: "failed", extraction_error: message }).eq("id", doc.id);
    return NextResponse.json({ error: message }, { status });
  };

  // Read the compressed preview when there is one (smaller, and big originals exceed the inline limit).
  const path = doc.preview_path ?? doc.storage_path;
  const mime = doc.preview_path ? "image/jpeg" : doc.mime_type ?? "image/jpeg";
  const { data: blob, error: dlErr } = await supabase.storage.from(doc.storage_bucket).download(path);
  if (dlErr || !blob) return fail(`Could not open the uploaded file: ${dlErr?.message ?? "missing"}`);
  if (blob.size > MAX_INLINE_BYTES) return fail("Photo is too large to read. Retake it or upload a smaller copy.", 413);

  let extraction: BillExtraction;
  let model: string;
  try {
    const res = await extractBill(Buffer.from(await blob.arrayBuffer()), mime);
    extraction = res.extraction;
    model = res.model;
  } catch (err) {
    console.error("[bill-inbox/extract] read failed", err);
    return fail(`Could not read the bill: ${(err as Error).message}`);
  }

  const gstin = normalizeGstin(extraction.vendor.gst_number);
  const vendorName = extraction.vendor.name;

  // Known vendor by GSTIN (strongest key on GST bills).
  let vendorId: string | null = null;
  if (gstin) {
    const { data: v } = await supabase.from("vendors").select("id").eq("gst_number", gstin).limit(1).maybeSingle();
    vendorId = v?.id ?? null;
  }

  const duplicate = await findDuplicate(supabase, doc.id, extraction, gstin);

  const { data: updated, error: upErr } = await supabase
    .from("purchase_documents")
    .update({
      status: "needs_review",
      extraction: extraction as unknown as Json,
      extraction_model: model,
      extraction_error: null,
      extracted_at: new Date().toISOString(),
      confidence: extraction.confidence.overall,
      doc_kind: extraction.doc_kind,
      vendor_id: vendorId,
      vendor_name: vendorName,
      vendor_gstin: gstin,
      vendor_name_pending: !vendorName,
      invoice_no: extraction.invoice_no,
      invoice_date: extraction.bill_date,
      total_amount: extraction.total_amount,
      duplicate_of_id: duplicate?.documentId ?? null,
    })
    .eq("id", doc.id)
    .select("*")
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Review flags (maker/checker). Best-effort: a flag failure never fails the read.
  if (userId) {
    const flags: Array<{ reason: string; details: Record<string, unknown> }> = [];
    if (duplicate) flags.push({ reason: "possible_duplicate", details: { ...duplicate } });
    const conf = extraction.confidence.overall;
    if (conf != null && conf < LOW_CONFIDENCE) {
      flags.push({ reason: "low_confidence_extraction", details: { confidence: conf, notes: extraction.reader_notes } });
    }
    for (const f of flags) {
      const { error } = await supabase.from("review_flags").insert({
        site_id: doc.site_id,
        entity_type: "purchase_document",
        entity_id: doc.id,
        reason: f.reason,
        details: { ...f.details, invoice_no: extraction.invoice_no, total_amount: extraction.total_amount } as Json,
        raised_by: userId,
      });
      if (error && error.code !== "23505") console.warn("[bill-inbox/extract] flag insert failed", error.message);
    }
  }

  return NextResponse.json({ document: updated });
}

interface DuplicateHit {
  documentId: string | null;
  purchaseExpenseId: string | null;
  refCode: string | null;
  why: string;
}

/**
 * Semantic duplicate check. A re-scan of the same bill has a different file
 * hash (the sample corpus had 3 such pairs out of 4), so match on what the
 * bill says: invoice number plus GSTIN, date or total.
 */
async function findDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  selfId: string,
  x: BillExtraction,
  gstin: string | null,
): Promise<DuplicateHit | null> {
  const inv = normalizeInvoiceNo(x.invoice_no);
  const total = x.total_amount;
  const date = x.bill_date;
  if (!inv && (total == null || !date)) return null;

  const ors = [date ? `invoice_date.eq.${date}` : null, total != null ? `total_amount.eq.${total}` : null].filter(
    Boolean,
  ) as string[];
  if (ors.length > 0) {
    const { data: docs } = await supabase
      .from("purchase_documents")
      .select("id, invoice_no, invoice_date, total_amount, vendor_gstin, vendor_name, purchase_expense_id")
      .neq("id", selfId)
      .neq("status", "rejected")
      .or(ors.join(","))
      .limit(50);
    for (const d of docs ?? []) {
      const sameInv = inv != null && normalizeInvoiceNo(d.invoice_no) === inv;
      const sameDate = date != null && d.invoice_date === date;
      const sameTotal = total != null && d.total_amount != null && Number(d.total_amount) === Number(total);
      const sameGstin = gstin != null && d.vendor_gstin === gstin;
      const sameVendor =
        !!x.vendor.name && !!d.vendor_name && d.vendor_name.trim().toLowerCase() === x.vendor.name.trim().toLowerCase();
      if ((sameInv && (sameGstin || sameDate || sameTotal)) || (!inv && sameDate && sameTotal && (sameGstin || sameVendor))) {
        return {
          documentId: d.id,
          purchaseExpenseId: d.purchase_expense_id,
          refCode: null,
          why: sameInv ? "Same invoice number already in the Bill Inbox" : "Same shop, date and total already in the Bill Inbox",
        };
      }
    }
  }

  // Purchases recorded before the inbox (ingest stores the invoice number in payment_reference).
  if (total != null) {
    let q = supabase
      .from("material_purchase_expenses")
      .select("id, ref_code, payment_reference, purchase_date, vendor_name")
      .eq("total_amount", total)
      .limit(25);
    if (date) q = q.eq("purchase_date", date);
    const { data: purchases } = await q;
    for (const p of purchases ?? []) {
      const sameInv = inv != null && normalizeInvoiceNo(p.payment_reference) === inv;
      const sameVendor =
        !!x.vendor.name && !!p.vendor_name && p.vendor_name.trim().toLowerCase() === x.vendor.name.trim().toLowerCase();
      if (sameInv || (date && sameVendor)) {
        return {
          documentId: null,
          purchaseExpenseId: p.id,
          refCode: p.ref_code,
          why: `Looks like purchase ${p.ref_code}, already recorded`,
        };
      }
    }
  }
  return null;
}
