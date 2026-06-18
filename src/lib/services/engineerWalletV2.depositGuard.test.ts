import { describe, it, expect, vi } from "vitest";
import { recordDeposit } from "./engineerWalletV2";
import { WalletValidationError } from "@/types/engineer-wallet-v2.types";
import type { RecordDepositInput } from "@/types/engineer-wallet-v2.types";

// Mock Supabase: payer_sources lookup returns `allowedKeys`; the deposit RPC
// returns a new id. The chain is .from("payer_sources").select().eq().eq().
function makeSupabase(allowedKeys: string[]) {
  const rpc = vi.fn(async () => ({ data: "dep-1", error: null }));
  const from = vi.fn((table: string) => {
    if (table === "payer_sources") {
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: allowedKeys.map((k) => ({ key: k })),
                error: null,
              }),
          }),
        }),
      };
    }
    return {};
  });
  return { rpc, from } as never;
}

function baseInput(over: Partial<RecordDepositInput> = {}): RecordDepositInput {
  return {
    engineer_id: "eng-1",
    site_id: "site-1",
    amount: 5000,
    payment_mode: "cash",
    payer: { mode: "single", source: "client_money" },
    recorded_by: "Hari Admin",
    recorded_by_user_id: "admin-1",
    ...over,
  } as RecordDepositInput;
}

describe("recordDeposit — payer source must be configured for the site", () => {
  it("accepts a source that is configured (non-hidden) for the site", async () => {
    const supabase = makeSupabase(["own_money", "client_money"]);
    const out = await recordDeposit(supabase, baseInput());
    expect(out).toEqual({ id: "dep-1" });
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a source the site has hidden / not configured (e.g. Trust)", async () => {
    const supabase = makeSupabase(["own_money", "client_money"]);
    await expect(
      recordDeposit(supabase, baseInput({ payer: { mode: "single", source: "trust_account" } }))
    ).rejects.toBeInstanceOf(WalletValidationError);
    // never reaches the insert RPC
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("rejects when ANY split row uses a non-configured source", async () => {
    const supabase = makeSupabase(["own_money", "client_money"]);
    await expect(
      recordDeposit(
        supabase,
        baseInput({
          amount: 1000,
          payer: {
            mode: "split",
            rows: [
              { source: "client_money", amount: 500 },
              { source: "trust_account", amount: 500 },
            ],
          },
        })
      )
    ).rejects.toBeInstanceOf(WalletValidationError);
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("does NOT block when the site has no configured registry (empty) — legacy fallback", async () => {
    const supabase = makeSupabase([]); // unconfigured site
    const out = await recordDeposit(
      supabase,
      baseInput({ payer: { mode: "single", source: "trust_account" } })
    );
    expect(out).toEqual({ id: "dep-1" });
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledTimes(1);
  });
});
