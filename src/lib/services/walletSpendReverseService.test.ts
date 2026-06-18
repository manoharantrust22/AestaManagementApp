import { describe, it, expect, vi } from "vitest";
import { deleteOrphanWalletSpend } from "./walletSpendReverseService";

function makeSupabase(
  rpcImpl: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>
) {
  const rpc = vi.fn(rpcImpl);
  return { supabase: { rpc } as never, rpc };
}

describe("deleteOrphanWalletSpend", () => {
  it("calls delete_orphan_wallet_spend with the spend id + reason and returns the result", async () => {
    const result = {
      deleted_spend_id: "s1",
      deleted_allocations: 1,
      amount: 950,
      user_id: "u1",
      site_id: "site1",
    };
    const { supabase, rpc } = makeSupabase(async () => ({ data: result, error: null }));

    const out = await deleteOrphanWalletSpend(supabase, { spendId: "s1", reason: "junk" });

    expect(rpc).toHaveBeenCalledWith("delete_orphan_wallet_spend", {
      p_spend_id: "s1",
      p_reason: "junk",
    });
    expect(out).toEqual(result);
  });

  it("passes a null reason when omitted", async () => {
    const { supabase, rpc } = makeSupabase(async () => ({ data: {}, error: null }));

    await deleteOrphanWalletSpend(supabase, { spendId: "s1" });

    expect(rpc).toHaveBeenCalledWith("delete_orphan_wallet_spend", {
      p_spend_id: "s1",
      p_reason: null,
    });
  });

  it("throws the RPC error message when the spend is linked (guard refuses)", async () => {
    const { supabase } = makeSupabase(async () => ({
      data: null,
      error: { message: "Spend s1 is linked to a misc record — use the reverse/undo action, not delete" },
    }));

    await expect(
      deleteOrphanWalletSpend(supabase, { spendId: "s1" })
    ).rejects.toThrow(/linked to a misc/);
  });
});
