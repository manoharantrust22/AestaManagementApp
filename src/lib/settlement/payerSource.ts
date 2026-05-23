import type {
  PayerSource,
  PayerSourceInput,
  PayerSourceSplitRow,
} from "@/types/settlement.types";
import { requiresPayerName } from "@/types/settlement.types";

const LABEL_BY_SOURCE: Record<PayerSource, string> = {
  own_money: "Own Money",
  amma_money: "Amma Money",
  client_money: "Client Money",
  trust_account: "Trust Account",
  other_site_money: "Other Site",
  custom: "Other",
  mothers_money: "Mother's Money",
};

function labelFor(row: { source: PayerSource; name?: string | null }): string {
  if (requiresPayerName(row.source) && row.name) return row.name;
  return LABEL_BY_SOURCE[row.source] ?? row.source;
}

const inr = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

export function toRpcArgs(payer: PayerSourceInput): {
  p_payer_source: string;
  p_payer_name: string | null;
  p_payer_source_split: PayerSourceSplitRow[] | null;
} {
  if (payer.mode === "split") {
    return {
      p_payer_source: "split",
      p_payer_name: null,
      p_payer_source_split: payer.rows.map((r) => ({
        source: r.source,
        ...(r.name && requiresPayerName(r.source) ? { name: r.name } : {}),
        amount: r.amount,
      })),
    };
  }
  return {
    p_payer_source: payer.source,
    p_payer_name:
      requiresPayerName(payer.source) && payer.name ? payer.name : null,
    p_payer_source_split: null,
  };
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePayerSourceInput(
  payer: PayerSourceInput,
  total: number,
): ValidationResult {
  if (payer.mode === "single") {
    if (requiresPayerName(payer.source) && !payer.name?.trim()) {
      return { ok: false, reason: `name is required for '${payer.source}'` };
    }
    return { ok: true };
  }
  const n = payer.rows.length;
  if (n < 2 || n > 3) {
    return { ok: false, reason: `split must have 2 or 3 rows (got ${n})` };
  }
  for (let i = 0; i < n; i++) {
    const r = payer.rows[i];
    if (!(r.amount > 0)) {
      return { ok: false, reason: `row ${i + 1} amount must be > 0` };
    }
    if (requiresPayerName(r.source) && !r.name?.trim()) {
      return {
        ok: false,
        reason: `row ${i + 1} name is required for '${r.source}'`,
      };
    }
  }
  const seen = new Set<string>();
  for (const r of payer.rows) {
    if (seen.has(r.source)) {
      return {
        ok: false,
        reason: "split cannot repeat the same source twice",
      };
    }
    seen.add(r.source);
  }
  const sum = payer.rows.reduce((a, r) => a + r.amount, 0);
  if (Math.abs(sum - total) > 1) {
    return {
      ok: false,
      reason: `split sum ${sum} does not equal total ${total}`,
    };
  }
  return { ok: true };
}

export function formatPayerSource(row: {
  payer_source: string | null;
  payer_name: string | null;
  payer_source_split: PayerSourceSplitRow[] | null;
}):
  | { kind: "single"; label: string }
  | {
      kind: "split";
      rows: { label: string; amount: number }[];
      summary: string;
    } {
  if (row.payer_source_split && row.payer_source_split.length > 0) {
    const rows = row.payer_source_split.map((r) => ({
      label: labelFor({ source: r.source, name: r.name }),
      amount: r.amount,
    }));
    const summary =
      "Split: " + rows.map((r) => `${r.label} ${inr(r.amount)}`).join(" · ");
    return { kind: "split", rows, summary };
  }
  const source = (row.payer_source ?? "own_money") as PayerSource;
  return {
    kind: "single",
    label: labelFor({ source, name: row.payer_name }),
  };
}
