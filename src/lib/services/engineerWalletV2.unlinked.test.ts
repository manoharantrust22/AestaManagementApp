import { describe, it, expect, vi } from "vitest";
import { getUnlinkedWalletSpends } from "./engineerWalletV2";

function makeSupabase(
  rpcImpl: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>
) {
  const rpc = vi.fn(rpcImpl);
  return { supabase: { rpc } as never, rpc };
}

describe("getUnlinkedWalletSpends", () => {
  it("returns [] without calling the RPC when no engineer ids are given", async () => {
    const { supabase, rpc } = makeSupabase(async () => ({ data: [], error: null }));
    const out = await getUnlinkedWalletSpends(supabase, []);
    expect(out).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls list_unlinked_wallet_spends with the ids + site and returns the rows", async () => {
    const rows = [{ id: "s1", transaction_type: "spend", amount: 950 }];
    const { supabase, rpc } = makeSupabase(async () => ({ data: rows, error: null }));

    const out = await getUnlinkedWalletSpends(supabase, ["u1", "u2"], "site-1");

    expect(rpc).toHaveBeenCalledWith("list_unlinked_wallet_spends", {
      p_user_ids: ["u1", "u2"],
      p_site_id: "site-1",
    });
    expect(out).toEqual(rows);
  });

  it("passes a null site when omitted (all sites for those engineers)", async () => {
    const { supabase, rpc } = makeSupabase(async () => ({ data: [], error: null }));
    await getUnlinkedWalletSpends(supabase, ["u1"]);
    expect(rpc).toHaveBeenCalledWith("list_unlinked_wallet_spends", {
      p_user_ids: ["u1"],
      p_site_id: null,
    });
  });

  it("throws when the RPC errors", async () => {
    const { supabase } = makeSupabase(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    await expect(getUnlinkedWalletSpends(supabase, ["u1"])).rejects.toBeTruthy();
  });
});
