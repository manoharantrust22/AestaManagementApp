/**
 * Mode-config contract + state-machine types for the AI ingestion dialog.
 *
 * Each ingestion mode (Purchase / Quotation / Warranty / future Rental) supplies
 * a `ModeConfig` describing how its data flows through the shared dialog.
 */

import type { z } from "zod";

import type { MatchResult, MaterialMatchCandidate, VendorMatchCandidate } from "./fuzzyMatch";

export type IngestionMode = "purchase" | "quotation" | "warranty" | "purchase_batch";

/**
 * Step name in the dialog state machine. UI renders one panel per step.
 */
export type IngestionStep =
  | "mode" // Mode picker (skipped if locked at open)
  | "context" // Site / date / file upload
  | "prompt" // Render + copy AI prompt
  | "paste" // Paste AI response, parse + validate
  | "preview" // Match preview with NEW/MATCH/AMBIGUOUS chips
  | "committing" // CommitProgress UI
  | "done" // Success
  | "error"; // Terminal error from commit

/**
 * Context the dialog needs before generating a prompt or committing.
 * Unused fields are mode-specific (e.g. `purchaseId` is warranty-only).
 */
export interface IngestionContext {
  siteId: string | null;
  defaultDate: string; // ISO YYYY-MM-DD
  billUrls: string[]; // already-uploaded URLs (multi-page warranty support)
  /** Warranty mode only — the purchase row to attach warranty to. */
  purchaseId?: string | null;
  /**
   * Purchase mode + company-flow only. Toggle exposed in ContextPicker:
   * "Also record as site expense?". Default true on /site/* callers (site is
   * locked); default false on /company/* (catalog-only ingest unless user
   * opts in). When false, siteId stays null and the RPC skips creating a
   * material_purchase_expenses row.
   */
  recordAsSiteExpense?: boolean;
}

/**
 * Per-row pricing intelligence shown on the Preview step. Computed by the
 * mode's resolvePreview against the price_history table.
 */
export interface RowPriceContext {
  lastFromSameVendor: { price: number; date: string; daysAgo: number } | null;
  lastFromAnyVendor: {
    price: number;
    vendorId: string;
    vendorName: string;
    date: string;
  } | null;
  /** (current - lastFromSameVendor.price) / lastFromSameVendor.price * 100 */
  deltaPctVsSameVendor: number | null;
}

/**
 * Vendor-level summary shown below the preview table.
 */
export interface VendorSummary {
  vendorId: string;
  vendorName: string;
  last30Days: { billCount: number; totalAmount: number; avgAmount: number };
  thisBill: { totalAmount: number };
}

/**
 * Per-row resolution outcome that the preview shows the user.
 */
export type RowMatchOutcome<TEntity> =
  | { kind: "matched"; entity: TEntity; score: number; candidates: TEntity[] }
  | { kind: "ambiguous"; candidates: TEntity[]; chosenId: string | null }
  | { kind: "new"; suggestedName: string };

/**
 * A size/pack variant the user can snap a line to in ResolveRowEditor (e.g.
 * "5L can"), shown with its last-paid price. Variants are sibling materials in
 * the same parent family.
 */
export interface VariantOption {
  id: string;
  name: string;
  unit: string;
  lastPrice: number | null;
}

export interface ResolvedPreviewRow {
  /** Stable index inside the AI items array. */
  index: number;
  rawName: string;
  rawLocalName: string | null;
  rawCategoryHint: string | null;
  rawBrand: string | null;
  quantity: number | null;
  unit: string;
  unitPrice: number;
  totalPrice: number | null;
  hsnCode: string | null;
  gstRate: number | null;
  /** Notes to attach on commit. */
  notes: string | null;
  /** Per-entity match outcomes. */
  materialMatch: RowMatchOutcome<MaterialMatchCandidate>;
  /** Override material chosen by user via ResolveRowEditor. */
  overrideMaterialId: string | null;
  /** Free-text edit of the material name (for NEW rows). */
  overrideMaterialName: string | null;
  warnings: string[];
  /**
   * Pricing intelligence — populated only when the row matched a known
   * material (or override id is set) and we could look up price_history.
   * `null` for new materials with no history yet.
   */
  priceContext: RowPriceContext | null;
  /**
   * Per-line-item product photo, uploaded inside PreviewTable before commit
   * (stored at `work-updates/product-photos/...`). On commit, this URL is
   * patched onto `materials.image_url` for the resolved material — new
   * materials always receive the photo; existing materials receive it after
   * the user saw `existingImageUrl` and the "replaces existing photo" hint.
   */
  productPhotoUrl: string | null;
  /**
   * Existing `materials.image_url` for a matched row, fetched at preview
   * time so PreviewTable can warn the user before overwriting. `null` for
   * NEW rows and matched rows with no photo set yet.
   */
  existingImageUrl: string | null;
  /**
   * Size/pack variants of the matched material's family (each with last-paid
   * price), for the "pick the exact can size" chips in ResolveRowEditor.
   * Empty when the matched material has no variant family (or row is NEW).
   */
  variantOptions: VariantOption[];
  /** AI-extracted pack/can size hint for packaged goods (e.g. "5L can"). */
  rawPackSize: string | null;
}

/**
 * Multi-bill batch preview: a list of independent single-bill previews. Each
 * bill renders the same `ResolvedPreview` UI (incl. the per-bill date card and
 * inline row editing), plus an optional bill photo mapped from the Context
 * upload set (`billUrl`, reassignable in the preview).
 */
export interface BatchBill {
  /** Stable index for list keys + patching (matches the parsed.purchases index). */
  id: number;
  preview: ResolvedPreview;
  /** Bill photo for this bill, mapped from ctx.billUrls by order (editable). */
  billUrl: string | null;
}

export interface BatchResolvedPreview {
  bills: BatchBill[];
}

export interface ResolvedPreview {
  vendorRawName: string;
  vendorMatch: RowMatchOutcome<VendorMatchCandidate>;
  /** Override vendor chosen by user. */
  overrideVendorId: string | null;
  rows: ResolvedPreviewRow[];
  /**
   * Vendor-level summary card shown below the row list. `null` for unmatched
   * vendors or vendors with no recent bills in the visible site set.
   */
  vendorSummary: VendorSummary | null;
  /**
   * Purchase-mode date reconciliation, populated by resolvePreview.
   * `billDate` is what the AI read off the bill (null if it couldn't);
   * `effectiveDate` is the date that will actually be committed and is
   * user-editable on the Preview step (initialized to billDate ?? the
   * Context "Purchase date"). Optional so quotation/warranty previews — which
   * don't surface this card — stay valid without setting them.
   */
  billDate?: string | null;
  effectiveDate?: string;
}

export type CommitPhase =
  | "uploading"
  | "rpc"
  | "invalidating"
  | "complete"
  | "failed";

/** Per-bill status line shown in CommitProgress during a multi-bill commit. */
export interface BatchCommitItem {
  label: string;
  status: "pending" | "saving" | "done" | "failed";
  error?: string;
}

export interface CommitState {
  phase: CommitPhase;
  message: string;
  error?: string;
  /** Present only for batch commits — per-bill progress for "7 of 8 saved". */
  items?: BatchCommitItem[];
}

/**
 * Mode-specific glue between the shared UI shell and the underlying RPC + Zod.
 *
 * @template TParsed The strict shape returned by the AI (Zod-validated).
 * @template TCommitResult The shape returned by the commit mutation (e.g. ref_code).
 */
export interface ModeConfig<TParsed, TCommitResult, TPreview = ResolvedPreview> {
  mode: IngestionMode;
  label: string;
  description: string;
  /**
   * Renders the prompt the user copies into ChatGPT/Gemini. Receives the
   * dialog's context (e.g. site/date) so the prompt can reference it.
   */
  buildPrompt(ctx: IngestionContext): string;
  /**
   * Zod schema for the AI's expected output. Used by PasteAndParse.
   */
  schema: z.ZodType<TParsed>;
  /**
   * Run fuzzy matching against the catalog and produce a preview that the
   * user can edit before commit. Receives the dialog context so modes can
   * seed context-dependent preview fields (e.g. purchase mode reconciles the
   * AI-read bill date against the user's selected "Purchase date"). `TPreview`
   * defaults to a single `ResolvedPreview`; the batch mode returns a
   * `BatchResolvedPreview` (list of bills).
   */
  resolvePreview(parsed: TParsed, ctx: IngestionContext): Promise<TPreview>;
  /**
   * Commit the resolved preview transactionally. Implementations are expected
   * to call `aiIngestionService.commitX(...)` and return whatever metadata
   * the success Snackbar should display.
   */
  commit(args: {
    parsed: TParsed;
    preview: TPreview;
    ctx: IngestionContext;
    onPhaseChange: (state: CommitState) => void;
  }): Promise<TCommitResult>;
  /**
   * One-line summary of the parsed payload, shown above the preview table.
   */
  summary(parsed: TParsed): string;
}

/**
 * Type-erased ModeConfig for storage in registries / dialog props.
 */
export type AnyModeConfig = ModeConfig<unknown, unknown, unknown>;
