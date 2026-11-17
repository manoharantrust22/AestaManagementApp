/**
 * Bill Inbox (procurement P1). Mirrors supabase/migrations/20261114100000_purchase_documents.sql.
 */

import type { Database } from "@/types/database.types";
import type { BillDocKind, BillExtraction } from "@/lib/bill-inbox/schema";

export type PurchaseDocumentStatus =
  | "uploaded"
  | "extracting"
  | "needs_review"
  | "confirmed"
  | "rejected"
  | "failed";

type Row = Database["public"]["Tables"]["purchase_documents"]["Row"];

export type PurchaseDocument = Omit<Row, "status" | "doc_kind" | "extraction"> & {
  status: PurchaseDocumentStatus;
  doc_kind: BillDocKind;
  extraction: BillExtraction | null;
  uploader?: { id: string; name: string } | null;
  purchase?: { id: string; ref_code: string } | null;
};

export const DOC_STATUS_LABEL: Record<PurchaseDocumentStatus, string> = {
  uploaded: "Waiting to be read",
  extracting: "Reading…",
  needs_review: "Ready to check",
  confirmed: "Saved",
  rejected: "Rejected",
  failed: "Could not read",
};

/** A photo captured on this phone that has not reached the server yet. */
export interface QueuedBill {
  localId: string;
  siteId: string | null;
  file: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  capturedAt: string;
  attempts: number;
  lastError: string | null;
  state: "waiting" | "uploading" | "failed";
}
