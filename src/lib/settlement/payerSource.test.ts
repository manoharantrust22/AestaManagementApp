import { describe, it, expect } from "vitest";
import {
  toRpcArgs,
  validatePayerSourceInput,
  formatPayerSource,
} from "./payerSource";
import type { PayerSourceInput } from "@/types/settlement.types";

describe("formatPayerSource — pending gaps", () => {
  it("labels a single pending source as Pending", () => {
    expect(
      formatPayerSource({
        payer_source: "pending",
        payer_name: null,
        payer_source_split: null,
      }),
    ).toEqual({ kind: "single", label: "Pending" });
  });

  it("labels a pending row inside a split breakdown", () => {
    const out = formatPayerSource({
      payer_source: "split",
      payer_name: null,
      // 'pending' is a valid stored value though not a PayerSource union member.
      payer_source_split: [
        { source: "amma_money", amount: 150 },
        { source: "pending", amount: 30 },
      ] as unknown as never,
    });
    expect(out).toEqual({
      kind: "split",
      rows: [
        { label: "Amma Money", amount: 150 },
        { label: "Pending", amount: 30 },
      ],
      summary: "Split: Amma Money ₹150 · Pending ₹30",
    });
  });
});

describe("toRpcArgs", () => {
  it("maps single-source input to legacy RPC params", () => {
    const input: PayerSourceInput = { mode: "single", source: "amma_money" };
    expect(toRpcArgs(input)).toEqual({
      p_payer_source: "amma_money",
      p_payer_name: null,
      p_payer_source_split: null,
    });
  });

  it("forwards payer_name only for custom/other_site_money", () => {
    const input: PayerSourceInput = {
      mode: "single",
      source: "custom",
      name: "Brother-in-law",
    };
    expect(toRpcArgs(input)).toMatchObject({
      p_payer_source: "custom",
      p_payer_name: "Brother-in-law",
      p_payer_source_split: null,
    });
  });

  it("drops payer_name for sources that don't need it", () => {
    const input: PayerSourceInput = {
      mode: "single",
      source: "amma_money",
      name: "should-not-be-sent",
    };
    expect(toRpcArgs(input).p_payer_name).toBeNull();
  });

  it("maps split-source input to p_payer_source='split' + JSONB", () => {
    const input: PayerSourceInput = {
      mode: "split",
      rows: [
        { source: "amma_money", amount: 3000 },
        { source: "trust_account", amount: 2500 },
      ],
    };
    expect(toRpcArgs(input)).toEqual({
      p_payer_source: "split",
      p_payer_name: null,
      p_payer_source_split: [
        { source: "amma_money", amount: 3000 },
        { source: "trust_account", amount: 2500 },
      ],
    });
  });
});

describe("validatePayerSourceInput", () => {
  it("accepts a valid single source", () => {
    expect(
      validatePayerSourceInput(
        { mode: "single", source: "amma_money" },
        5000,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects single 'custom' without a name", () => {
    expect(
      validatePayerSourceInput({ mode: "single", source: "custom" }, 5000),
    ).toEqual({ ok: false, reason: "name is required for 'custom'" });
  });

  it("rejects split with 1 row", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [{ source: "amma_money", amount: 5000 }],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "split must have 2 or 3 rows (got 1)" });
  });

  it("rejects split with 4 rows", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 1000 },
            { source: "trust_account", amount: 1000 },
            { source: "own_money", amount: 1000 },
            { source: "client_money", amount: 2000 },
          ],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "split must have 2 or 3 rows (got 4)" });
  });

  it("rejects split whose sum != total", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 3000 },
            { source: "trust_account", amount: 2000 },
          ],
        },
        5500,
      ),
    ).toEqual({ ok: false, reason: "split sum 5000 does not equal total 5500" });
  });

  it("accepts split within ₹1 of total (rounding tolerance)", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 3333.33 },
            { source: "trust_account", amount: 3333.33 },
            { source: "own_money", amount: 3333.34 },
          ],
        },
        10000,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects duplicate source within a split", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 3000 },
            { source: "amma_money", amount: 2000 },
          ],
        },
        5000,
      ),
    ).toEqual({
      ok: false,
      reason: "split cannot repeat the same source twice",
    });
  });

  it("rejects split row with non-positive amount", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "amma_money", amount: 0 },
            { source: "trust_account", amount: 5000 },
          ],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "row 1 amount must be > 0" });
  });

  it("rejects split row missing name when source requires it", () => {
    expect(
      validatePayerSourceInput(
        {
          mode: "split",
          rows: [
            { source: "custom", amount: 3000 },
            { source: "trust_account", amount: 2000 },
          ],
        },
        5000,
      ),
    ).toEqual({ ok: false, reason: "row 1 name is required for 'custom'" });
  });
});

describe("formatPayerSource", () => {
  it("renders single source label", () => {
    const out = formatPayerSource({
      payer_source: "amma_money",
      payer_name: null,
      payer_source_split: null,
    });
    expect(out).toEqual({ kind: "single", label: "Amma Money" });
  });

  it("falls back to payer_name for custom", () => {
    const out = formatPayerSource({
      payer_source: "custom",
      payer_name: "Sister",
      payer_source_split: null,
    });
    expect(out).toEqual({ kind: "single", label: "Sister" });
  });

  it("renders split summary", () => {
    const out = formatPayerSource({
      payer_source: "split",
      payer_name: null,
      payer_source_split: [
        { source: "amma_money", amount: 3000 },
        { source: "trust_account", amount: 2500 },
      ],
    });
    expect(out.kind).toBe("split");
    if (out.kind !== "split") throw new Error("expected split");
    expect(out.summary).toBe("Split: Amma Money ₹3,000 · Trust Account ₹2,500");
    expect(out.rows).toEqual([
      { label: "Amma Money", amount: 3000 },
      { label: "Trust Account", amount: 2500 },
    ]);
  });
});
