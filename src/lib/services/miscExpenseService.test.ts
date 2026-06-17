import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMiscExpense } from "./miscExpenseService";
import { recordSpend, cancelTransaction } from "./engineerWalletV2";
import type {
  CreateMiscExpenseConfig,
  MiscExpenseFormData,
} from "@/types/misc-expense.types";

// The wallet primitives are exercised by their own suites — here we only care
// that createMiscExpense calls them correctly around a reference collision.
vi.mock("./engineerWalletV2", () => ({
  recordSpend: vi.fn(),
  cancelTransaction: vi.fn(),
}));
vi.mock("./walletService", () => ({
  recordWalletSpending: vi.fn(),
}));

type InsertResult = { data: unknown; error: unknown };

/**
 * Minimal chainable Supabase stub. `inserts` are returned in order by
 * misc_expenses.insert().select().single() (the last entry repeats), and
 * `refs` are handed out in order by the generate_misc_expense_reference RPC.
 */
function makeSupabase(opts: { inserts: InsertResult[]; refs: string[] }) {
  let insertIdx = 0;
  let refIdx = 0;
  const rpc = vi.fn(async (name: string) => {
    if (name === "generate_misc_expense_reference") {
      const r = opts.refs[Math.min(refIdx, opts.refs.length - 1)];
      refIdx++;
      return { data: r, error: null };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    if (table === "misc_expenses") {
      return {
        insert: () => ({
          select: () => ({
            single: async () => {
              const res = opts.inserts[Math.min(insertIdx, opts.inserts.length - 1)];
              insertIdx++;
              return res;
            },
          }),
        }),
      };
    }
    // site_engineer_transactions (step 5 update) — not reached in these tests.
    return { update: () => ({ eq: async () => ({ data: null, error: null }) }) };
  });
  return { rpc, from } as never;
}

const DUP_ERR = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "misc_expenses_site_reference_key"',
};

function baseFormData(over: Partial<MiscExpenseFormData> = {}): MiscExpenseFormData {
  return {
    date: "2026-06-15",
    amount: 950,
    category_id: "",
    description: "9 feet mattapalagai",
    vendor_name: "",
    payment_mode: "cash",
    payer: { mode: "single", source: "own_money" },
    payer_type: "company_direct",
    site_engineer_id: "",
    subcontract_id: null,
    notes: "",
    ...over,
  };
}

function baseConfig(over: Partial<CreateMiscExpenseConfig> = {}): CreateMiscExpenseConfig {
  return {
    siteId: "site-1",
    formData: baseFormData(),
    userId: "user-1",
    userName: "Ajith Kumar",
    ...over,
  };
}

const genCalls = (sb: { rpc: ReturnType<typeof vi.fn> }) =>
  sb.rpc.mock.calls.filter(
    (c: unknown[]) => c[0] === "generate_misc_expense_reference"
  ).length;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMiscExpense — reference collision handling", () => {
  it("retries with a fresh reference when the insert hits a unique violation, then succeeds", async () => {
    const supabase = makeSupabase({
      refs: ["MISC-260617-001", "MISC-260617-002"],
      inserts: [
        { data: null, error: DUP_ERR }, // first ref collides
        { data: { id: "exp-1" }, error: null }, // regenerated ref succeeds
      ],
    });

    const result = await createMiscExpense(supabase, baseConfig());

    expect(result.success).toBe(true);
    expect(result.expenseId).toBe("exp-1");
    // The reference handed back is the regenerated one, not the colliding one.
    expect(result.referenceNumber).toBe("MISC-260617-002");
    // Initial generate + one regeneration after the collision.
    expect(genCalls(supabase as never)).toBe(2);
    // company_direct → no wallet spend, nothing to reverse.
    expect(recordSpend).not.toHaveBeenCalled();
    expect(cancelTransaction).not.toHaveBeenCalled();
  });

  it("does NOT retry on a non-unique error (e.g. FK violation)", async () => {
    const supabase = makeSupabase({
      refs: ["MISC-260617-001"],
      inserts: [
        { data: null, error: { code: "23503", message: "fk violation" } },
      ],
    });

    const result = await createMiscExpense(supabase, baseConfig());

    expect(result.success).toBe(false);
    // No regeneration — the reference was generated exactly once.
    expect(genCalls(supabase as never)).toBe(1);
  });

  it("reverses the wallet spend when every retry collides (no orphan debit left)", async () => {
    vi.mocked(recordSpend).mockResolvedValue({ id: "txn-1" });
    const supabase = makeSupabase({
      refs: [
        "MISC-260617-001",
        "MISC-260617-002",
        "MISC-260617-003",
        "MISC-260617-004",
        "MISC-260617-005",
      ],
      inserts: [{ data: null, error: DUP_ERR }], // every attempt collides
    });

    const result = await createMiscExpense(
      supabase,
      baseConfig({
        formData: baseFormData({
          payer_type: "site_engineer",
          site_engineer_id: "eng-1",
        }),
        useV2Wallet: true,
      })
    );

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/duplicate key value|unique constraint/i);
    // Spend recorded once (before the insert); reversed exactly once on failure.
    expect(recordSpend).toHaveBeenCalledTimes(1);
    expect(cancelTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cancelTransaction).mock.calls[0][1]).toMatchObject({
      id: "txn-1",
    });
    // 5 insert attempts → initial generate + 4 regenerations.
    expect(genCalls(supabase as never)).toBe(5);
  });
});
