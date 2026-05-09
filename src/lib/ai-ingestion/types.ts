/**
 * Mode-config contract + state-machine types for the AI ingestion dialog.
 *
 * Each ingestion mode (Purchase / Quotation / Warranty / future Rental) supplies
 * a `ModeConfig` describing how its data flows through the shared dialog.
 */

import type { z } from "zod";

import type { MatchResult, MaterialMatchCandidate, VendorMatchCandidate } from "./fuzzyMatch";

export type IngestionMode = "purchase" | "quotation" | "warranty";

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
}

/**
 * Per-row resolution outcome that the preview shows the user.
 */
export type RowMatchOutcome<TEntity> =
  | { kind: "matched"; entity: TEntity; score: number; candidates: TEntity[] }
  | { kind: "ambiguous"; candidates: TEntity[]; chosenId: string | null }
  | { kind: "new"; suggestedName: string };

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
}

export interface ResolvedPreview {
  vendorRawName: string;
  vendorMatch: RowMatchOutcome<VendorMatchCandidate>;
  /** Override vendor chosen by user. */
  overrideVendorId: string | null;
  rows: ResolvedPreviewRow[];
}

export type CommitPhase =
  | "uploading"
  | "rpc"
  | "invalidating"
  | "complete"
  | "failed";

export interface CommitState {
  phase: CommitPhase;
  message: string;
  error?: string;
}

/**
 * Mode-specific glue between the shared UI shell and the underlying RPC + Zod.
 *
 * @template TParsed The strict shape returned by the AI (Zod-validated).
 * @template TCommitResult The shape returned by the commit mutation (e.g. ref_code).
 */
export interface ModeConfig<TParsed, TCommitResult> {
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
   * user can edit before commit.
   */
  resolvePreview(parsed: TParsed): Promise<ResolvedPreview>;
  /**
   * Commit the resolved preview transactionally. Implementations are expected
   * to call `aiIngestionService.commitX(...)` and return whatever metadata
   * the success Snackbar should display.
   */
  commit(args: {
    parsed: TParsed;
    preview: ResolvedPreview;
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
export type AnyModeConfig = ModeConfig<unknown, unknown>;
