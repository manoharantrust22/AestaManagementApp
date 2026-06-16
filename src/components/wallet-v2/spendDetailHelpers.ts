import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import type { WorkPhoto } from "@/types/work-updates.types";

export type SpendKind = "misc" | "salary" | "contract" | "other";

/**
 * Classify a wallet spend/return row from its description. Order matters:
 * contract-payment descriptions also contain a SET- reference, so they must be
 * matched before the generic salary branch.
 */
export function classifySpend(description: string | null | undefined): SpendKind {
  if (!description) return "other";
  if (/MISC-\d{6}-/.test(description)) return "misc";
  if (/^Contract payment/i.test(description)) return "contract";
  if (/Salary settlement|SET-\d{6}/.test(description)) return "salary";
  // Free-text / material / rental / group-stock spends fall through to the universal view.
  return "other";
}

/** Extract the human-readable MISC reference for display (data fetch uses the id). */
export function parseMiscReference(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = description.match(/MISC-\d{6}-[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

/** The misc_expenses fields we surface for verification. */
export interface MiscExpenseVerification {
  bill_url: string | null;
  vendor_name: string | null;
  description: string | null;
  notes: string | null;
  amount: number | null;
  payer_source: string | null;
  payer_name: string | null;
  category_name: string | null;
}

/** Map a raw misc_expenses row (with joined expense_categories) to the view shape. */
export function mapMiscExpenseRow(raw: any): MiscExpenseVerification {
  return {
    bill_url: raw?.bill_url ?? null,
    vendor_name: raw?.vendor_name ?? null,
    description: raw?.description ?? null,
    notes: raw?.notes ?? null,
    amount: raw?.amount ?? null,
    payer_source: raw?.payer_source ?? null,
    payer_name: raw?.payer_name ?? null,
    category_name: raw?.expense_categories?.name ?? null,
  };
}

/**
 * Build the lightbox photo list: vendor bill first (misc only), then the
 * payment proof from the wallet row itself. `uploadedAt` is required by
 * WorkPhoto but unused by PhotoLightbox; the transaction date is a safe value.
 */
export function buildSpendPhotos(
  row: Pick<WalletLedgerEntry, "proof_url" | "transaction_date">,
  misc: Pick<MiscExpenseVerification, "bill_url"> | null
): WorkPhoto[] {
  const photos: WorkPhoto[] = [];
  if (misc?.bill_url) {
    photos.push({ id: "bill", url: misc.bill_url, description: "Vendor bill", uploadedAt: row.transaction_date });
  }
  if (row.proof_url) {
    photos.push({ id: "proof", url: row.proof_url, description: "Payment proof", uploadedAt: row.transaction_date });
  }
  return photos;
}

/**
 * Friendly label for a payer-source key. Mirrors the map previously inlined in
 * WalletLedgerList (now the single source of truth, imported by both).
 */
export function prettyPayerSource(key: string, name: string | null): string {
  const map: Record<string, string> = {
    own_money: "Own Money",
    amma_money: "Amma Money",
    mothers_money: "Amma Money",
    client_money: "Client Money",
    trust_account: "Trust Account",
    split: "Multiple sources",
    pending: "Pending",
    other_site_money: name ?? "Other Site",
    custom: name ?? "Other",
  };
  return map[key] ?? key;
}
