import { describe, it, expect, vi, beforeEach } from "vitest";
import { softDeleteSubcontractPayment } from "./subcontractService";
import { reverseWalletSpend } from "./walletSpendReverseService";

// The RPC wrapper has its own suite; here we only assert that the soft delete
// routes to it for wallet-funded rows and never for company-direct ones.
vi.mock("./walletSpendReverseService", () => ({
  reverseWalletSpend: vi.fn(),
}));
vi.mock("./engineerWalletV2", () => ({
  recordSpend: vi.fn(),
  cancelTransaction: vi.fn(),
}));

type PaymentRow = {
  id: string;
  is_deleted: boolean;
  site_engineer_transaction_id: string | null;
};

/**
 * Minimal chainable Supabase stub for subcontract_payments. Captures the payload
 * passed to .update() so the audit stamp can be asserted.
 */
function makeSupabase(opts: {
  payment?: PaymentRow;
  fetchError?: unknown;
  updateError?: unknown;
}) {
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table !== "subcontract_payments") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.payment ?? null,
            error: opts.fetchError ?? null,
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return { eq: async () => ({ error: opts.updateError ?? null }) };
      },
    };
  });
  return { supabase: { from } as never, updates };
}

const args = { paymentId: "pay-1", reason: "Wrong section", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("softDeleteSubcontractPayment", () => {
  it("reverses the wallet spend for a wallet-funded payment instead of updating the row", async () => {
    const { supabase, updates } = makeSupabase({
      payment: { id: "pay-1", is_deleted: false, site_engineer_transaction_id: "txn-9" },
    });

    const result = await softDeleteSubcontractPayment(supabase, args);

    expect(result).toEqual({ success: true, walletReversed: true });
    expect(reverseWalletSpend).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reverseWalletSpend).mock.calls[0][1]).toEqual({
      spendId: "txn-9",
      mode: "undo",
      reason: "Wrong section",
    });
    // The RPC cascades the soft delete itself — a local update would double-write
    // and, worse, strand the wallet debit if the RPC were skipped.
    expect(updates).toHaveLength(0);
  });

  it("soft-deletes with the audit stamp for a company-direct payment", async () => {
    const { supabase, updates } = makeSupabase({
      payment: { id: "pay-1", is_deleted: false, site_engineer_transaction_id: null },
    });

    const result = await softDeleteSubcontractPayment(supabase, args);

    expect(result).toEqual({ success: true, walletReversed: false });
    expect(reverseWalletSpend).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      is_deleted: true,
      deleted_by_user_id: "user-1",
      deletion_reason: "Wrong section",
    });
    expect(updates[0].deleted_at).toEqual(expect.any(String));
  });

  it("is a no-op on an already-removed payment", async () => {
    const { supabase, updates } = makeSupabase({
      payment: { id: "pay-1", is_deleted: true, site_engineer_transaction_id: "txn-9" },
    });

    const result = await softDeleteSubcontractPayment(supabase, args);

    expect(result).toEqual({ success: true, walletReversed: false });
    // get_wallet_spend_source filters is_deleted = false, so calling the RPC here
    // would raise "no linked record to cascade to" rather than no-op.
    expect(reverseWalletSpend).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("rejects a blank reason before touching the database", async () => {
    const { supabase, updates } = makeSupabase({
      payment: { id: "pay-1", is_deleted: false, site_engineer_transaction_id: null },
    });

    const result = await softDeleteSubcontractPayment(supabase, {
      ...args,
      reason: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/reason is required/i);
    expect(updates).toHaveLength(0);
  });

  it("surfaces a wallet reversal failure instead of reporting success", async () => {
    vi.mocked(reverseWalletSpend).mockRejectedValue(
      new Error("Not authorised to reverse this wallet spend")
    );
    const { supabase, updates } = makeSupabase({
      payment: { id: "pay-1", is_deleted: false, site_engineer_transaction_id: "txn-9" },
    });

    const result = await softDeleteSubcontractPayment(supabase, args);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorised/i);
    // The payment must stay live — a half-applied removal would hide the money
    // from the ledger while the wallet debit remains.
    expect(updates).toHaveLength(0);
  });
});
