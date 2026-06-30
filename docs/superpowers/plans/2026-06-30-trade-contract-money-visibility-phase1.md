# Trade Contract Money Visibility — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each trade's agreed / spent / remaining money picture (and an explicit "daily-wage only — no agreed amount" state) on the site attendance screen and the trade chips, so engineers never mark attendance blind.

**Architecture:** A pure derivation module turns the *existing* `useSiteTrades` + `useSiteTradeReconciliations` data into per-trade and per-contract money summaries (reusing `rollupTasks`/`rollupSeverity` from `exposure.ts`). A thin hook exposes those maps. Two presentational surfaces consume them: a new `ContractMoneyStrip` rendered under the trade chips on `/site/attendance`, and an optional amber "no agreed amount" dot on `TradeChipFilter` chips. No schema changes, no new write paths — "Set agreed ₹" deep-links to the existing contract editor.

**Tech Stack:** Next.js 15 (app router), React 19, MUI v7, TanStack React Query v5, Vitest + React Testing Library, TypeScript.

## Global Constraints

- No database schema changes. Reuse `subcontracts.total_value` (`TradeContract.totalValue`) and the `v_subcontract_reconciliation` view.
- One source of truth: agreed amount = Σ `total_value`; never introduce a second trade-level amount field.
- Currency display: `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })`.
- "No agreed amount" warning state = `agreed === 0` (NOT "no contract"). Wording: **"Daily-wage only — no agreed amount"**.
- Amber marker color = `wsColors.amber` (`#d9870b`) from `src/lib/workforce/workspaceTokens.ts`.
- `TradeChipFilter` changes MUST be backward compatible: the badge is driven by an **optional** prop; call sites that don't pass it (payments, expenses) render exactly as today.
- Verdict label/color come from `severityMeta` in `workspaceTokens.ts` — do not invent new thresholds.

---

## File Structure

- **Create** `src/lib/workforce/tradeContractSummary.ts` — pure derivation (types + `buildContractMoneySummary`, `buildTradeMoneySummary`, `assembleSummaries`).
- **Create** `src/lib/workforce/__tests__/tradeContractSummary.test.ts` — unit tests for the pure module.
- **Create** `src/hooks/queries/useTradeContractSummary.ts` — thin hook composing the two existing hooks + `assembleSummaries`.
- **Create** `src/hooks/queries/__tests__/useTradeContractSummary.test.tsx` — hook test (mocks the two source hooks).
- **Create** `src/components/attendance/ContractMoneyStrip.tsx` — presentational strip (state 3 vs state 4).
- **Create** `src/components/attendance/__tests__/ContractMoneyStrip.test.tsx` — render tests.
- **Modify** `src/components/attendance/TradeChipFilter.tsx` — add optional `noAgreedAmountCategoryIds` prop + amber dot.
- **Modify** `src/components/attendance/__tests__/TradeChipFilter.workspace.test.tsx` — add a dot test.
- **Modify** `src/app/(main)/site/attendance/attendance-content.tsx` — wire the hook, render the strip, pass the prop.

---

### Task 1: Pure money-summary derivation

**Files:**
- Create: `src/lib/workforce/tradeContractSummary.ts`
- Test: `src/lib/workforce/__tests__/tradeContractSummary.test.ts`

**Interfaces:**
- Consumes: `rollupTasks`, `rollupSeverity`, `Severity`, `RollupTask` from `./exposure`; `Trade`, `TradeContract`, `ContractReconciliation` from `@/types/trade.types`.
- Produces:
  - `interface ContractMoneySummary { contractId: string; title: string; tradeName: string; agreed: number; spent: number; remaining: number; overpaid: boolean; hasAgreedAmount: boolean; severity: Severity }`
  - `interface TradeMoneySummary { tradeCategoryId: string; tradeName: string; hasDetailedContract: boolean; hasAgreedAmount: boolean; agreed: number; spent: number; remaining: number; severity: Severity; contractCount: number }`
  - `interface AssembledSummaries { byCategoryId: Map<string, TradeMoneySummary>; byContractId: Map<string, ContractMoneySummary>; noAgreedAmountCategoryIds: Set<string> }`
  - `buildContractMoneySummary(c: TradeContract, tradeName: string, recon?: ContractReconciliation): ContractMoneySummary`
  - `buildTradeMoneySummary(trade: Trade, reconMap: Map<string, ContractReconciliation>): TradeMoneySummary`
  - `assembleSummaries(trades: Trade[] | undefined, reconMap: Map<string, ContractReconciliation> | undefined): AssembledSummaries`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/workforce/__tests__/tradeContractSummary.test.ts
import { describe, it, expect } from "vitest";
import {
  buildContractMoneySummary,
  buildTradeMoneySummary,
  assembleSummaries,
} from "../tradeContractSummary";
import type { Trade, TradeContract, ContractReconciliation } from "@/types/trade.types";

function contract(over: Partial<TradeContract> & { id: string }): TradeContract {
  return {
    siteId: "s1",
    tradeCategoryId: "cat",
    stageId: null,
    title: "Ashish",
    laborTrackingMode: "detailed",
    isInHouse: false,
    contractType: "specialist",
    status: "active",
    totalValue: 0,
    workProgressPercent: null,
    teamId: null,
    laborerId: null,
    mesthriOrSpecialistName: "Ashish",
    parentSubcontractId: null,
    createdAt: "",
    ...over,
  };
}
const recon = (over: Partial<ContractReconciliation> & { subcontractId: string }): ContractReconciliation => ({
  quotedAmount: 0,
  amountPaid: 0,
  amountPaidSubcontractPayments: 0,
  amountPaidSettlements: 0,
  impliedLaborValueDetailed: 0,
  impliedLaborValueHeadcount: 0,
  ...over,
});

describe("buildContractMoneySummary", () => {
  it("flags ₹0 agreed as daily-wage-only but still reports spent", () => {
    const s = buildContractMoneySummary(
      contract({ id: "c1", totalValue: 0 }),
      "Painting",
      recon({ subcontractId: "c1", quotedAmount: 0, amountPaid: 40000 })
    );
    expect(s.hasAgreedAmount).toBe(false);
    expect(s.agreed).toBe(0);
    expect(s.spent).toBe(40000);
    expect(s.overpaid).toBe(false);
  });

  it("reports agreed/spent/remaining for a healthy contract", () => {
    const s = buildContractMoneySummary(
      contract({ id: "c1" }),
      "Painting",
      recon({ subcontractId: "c1", quotedAmount: 100000, amountPaid: 40000 })
    );
    expect(s.hasAgreedAmount).toBe(true);
    expect(s.agreed).toBe(100000);
    expect(s.spent).toBe(40000);
    expect(s.remaining).toBe(60000);
    expect(s.overpaid).toBe(false);
  });

  it("marks overpaid when spent exceeds agreed", () => {
    const s = buildContractMoneySummary(
      contract({ id: "c1" }),
      "Painting",
      recon({ subcontractId: "c1", quotedAmount: 100000, amountPaid: 112000 })
    );
    expect(s.remaining).toBe(-12000);
    expect(s.overpaid).toBe(true);
  });

  it("falls back to totalValue when no reconciliation row exists", () => {
    const s = buildContractMoneySummary(contract({ id: "c1", totalValue: 200000 }), "Painting");
    expect(s.agreed).toBe(200000);
    expect(s.spent).toBe(0);
    expect(s.hasAgreedAmount).toBe(true);
  });
});

describe("buildTradeMoneySummary", () => {
  it("sums agreed/spent across the trade's contracts and detects a detailed contract", () => {
    const trade: Trade = {
      category: { id: "cat", name: "Civil", isSystemSeed: true, isActive: true, hasWorkspace: true },
      contracts: [
        contract({ id: "a", laborTrackingMode: "detailed", totalValue: 500000 }),
        contract({ id: "b", laborTrackingMode: "mesthri_only", totalValue: 300000 }),
      ],
    };
    const map = new Map<string, ContractReconciliation>([
      ["a", recon({ subcontractId: "a", quotedAmount: 500000, amountPaid: 100000 })],
      ["b", recon({ subcontractId: "b", quotedAmount: 300000, amountPaid: 50000 })],
    ]);
    const s = buildTradeMoneySummary(trade, map);
    expect(s.agreed).toBe(800000);
    expect(s.spent).toBe(150000);
    expect(s.remaining).toBe(650000);
    expect(s.hasDetailedContract).toBe(true);
    expect(s.hasAgreedAmount).toBe(true);
    expect(s.contractCount).toBe(2);
  });
});

describe("assembleSummaries", () => {
  it("collects category ids with a contract but ₹0 agreed into noAgreedAmountCategoryIds", () => {
    const trades: Trade[] = [
      {
        category: { id: "paint", name: "Painting", isSystemSeed: true, isActive: true, hasWorkspace: true },
        contracts: [contract({ id: "p1", tradeCategoryId: "paint", totalValue: 0 })],
      },
      {
        category: { id: "civ", name: "Civil", isSystemSeed: true, isActive: true, hasWorkspace: true },
        contracts: [contract({ id: "c1", tradeCategoryId: "civ", totalValue: 800000 })],
      },
    ];
    const map = new Map<string, ContractReconciliation>([
      ["c1", recon({ subcontractId: "c1", quotedAmount: 800000, amountPaid: 0 })],
    ]);
    const a = assembleSummaries(trades, map);
    expect(a.noAgreedAmountCategoryIds.has("paint")).toBe(true);
    expect(a.noAgreedAmountCategoryIds.has("civ")).toBe(false);
    expect(a.byContractId.get("p1")?.hasAgreedAmount).toBe(false);
    expect(a.byCategoryId.get("civ")?.agreed).toBe(800000);
  });

  it("returns empty structures for undefined input", () => {
    const a = assembleSummaries(undefined, undefined);
    expect(a.byCategoryId.size).toBe(0);
    expect(a.byContractId.size).toBe(0);
    expect(a.noAgreedAmountCategoryIds.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/workforce/__tests__/tradeContractSummary.test.ts`
Expected: FAIL — `tradeContractSummary` module / exports not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/workforce/tradeContractSummary.ts
/**
 * Pure derivation: turn existing trade + reconciliation data into the money
 * summaries the attendance strip and trade-chip dot need. No React, no styling.
 *
 * agreed = Σ total_value (via reconciliation.quotedAmount, falling back to the
 * contract's own totalValue); spent = Σ amount_paid; severity reuses the workforce
 * exposure rollup. "No agreed amount" (agreed === 0) is the daily-wage-only signal.
 */
import { rollupTasks, rollupSeverity, type Severity, type RollupTask } from "./exposure";
import type { Trade, TradeContract, ContractReconciliation } from "@/types/trade.types";

export interface ContractMoneySummary {
  contractId: string;
  title: string;
  tradeName: string;
  agreed: number;
  spent: number;
  /** agreed − spent; negative means overpaid. */
  remaining: number;
  overpaid: boolean;
  hasAgreedAmount: boolean;
  severity: Severity;
}

export interface TradeMoneySummary {
  tradeCategoryId: string;
  tradeName: string;
  hasDetailedContract: boolean;
  hasAgreedAmount: boolean;
  agreed: number;
  spent: number;
  remaining: number;
  severity: Severity;
  contractCount: number;
}

export interface AssembledSummaries {
  byCategoryId: Map<string, TradeMoneySummary>;
  byContractId: Map<string, ContractMoneySummary>;
  /** Category ids that have ≥1 contract but Σ agreed === 0 (drives the amber chip dot). */
  noAgreedAmountCategoryIds: Set<string>;
}

function taskFor(c: TradeContract, recon?: ContractReconciliation): RollupTask {
  const quoted = recon?.quotedAmount ?? c.totalValue ?? 0;
  const paid = recon?.amountPaid ?? 0;
  const work = c.workProgressPercent == null ? null : c.workProgressPercent / 100;
  return { quoted, paid, work };
}

export function buildContractMoneySummary(
  c: TradeContract,
  tradeName: string,
  recon?: ContractReconciliation
): ContractMoneySummary {
  const r = rollupTasks([taskFor(c, recon)]);
  const remaining = r.quoted - r.paid;
  return {
    contractId: c.id,
    title: c.title,
    tradeName,
    agreed: r.quoted,
    spent: r.paid,
    remaining,
    overpaid: remaining < 0,
    hasAgreedAmount: r.quoted > 0,
    severity: rollupSeverity(r),
  };
}

export function buildTradeMoneySummary(
  trade: Trade,
  reconMap: Map<string, ContractReconciliation>
): TradeMoneySummary {
  const r = rollupTasks(trade.contracts.map((c) => taskFor(c, reconMap.get(c.id))));
  const remaining = r.quoted - r.paid;
  return {
    tradeCategoryId: trade.category.id,
    tradeName: trade.category.name,
    hasDetailedContract: trade.contracts.some((c) => c.laborTrackingMode === "detailed"),
    hasAgreedAmount: r.quoted > 0,
    agreed: r.quoted,
    spent: r.paid,
    remaining,
    severity: rollupSeverity(r),
    contractCount: trade.contracts.length,
  };
}

export function assembleSummaries(
  trades: Trade[] | undefined,
  reconMap: Map<string, ContractReconciliation> | undefined
): AssembledSummaries {
  const map = reconMap ?? new Map<string, ContractReconciliation>();
  const byCategoryId = new Map<string, TradeMoneySummary>();
  const byContractId = new Map<string, ContractMoneySummary>();
  const noAgreedAmountCategoryIds = new Set<string>();

  for (const trade of trades ?? []) {
    const tradeSummary = buildTradeMoneySummary(trade, map);
    byCategoryId.set(trade.category.id, tradeSummary);
    if (trade.contracts.length > 0 && !tradeSummary.hasAgreedAmount) {
      noAgreedAmountCategoryIds.add(trade.category.id);
    }
    for (const c of trade.contracts) {
      byContractId.set(c.id, buildContractMoneySummary(c, trade.category.name, map.get(c.id)));
    }
  }

  return { byCategoryId, byContractId, noAgreedAmountCategoryIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/workforce/__tests__/tradeContractSummary.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workforce/tradeContractSummary.ts src/lib/workforce/__tests__/tradeContractSummary.test.ts
git commit -m "feat(workforce): pure per-trade/per-contract money-summary derivation"
```

---

### Task 2: `useTradeContractSummaries` hook

**Files:**
- Create: `src/hooks/queries/useTradeContractSummary.ts`
- Test: `src/hooks/queries/__tests__/useTradeContractSummary.test.tsx`

**Interfaces:**
- Consumes: `useSiteTrades` from `@/hooks/queries/useTrades`; `useSiteTradeReconciliations` from `@/hooks/queries/useTradeReconciliations`; `assembleSummaries`, `AssembledSummaries` from `@/lib/workforce/tradeContractSummary`.
- Produces: `useTradeContractSummaries(siteId: string | undefined): AssembledSummaries & { isLoading: boolean }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/queries/__tests__/useTradeContractSummary.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/hooks/queries/useTrades", () => ({ useSiteTrades: vi.fn() }));
vi.mock("@/hooks/queries/useTradeReconciliations", () => ({ useSiteTradeReconciliations: vi.fn() }));

import { useSiteTrades } from "@/hooks/queries/useTrades";
import { useSiteTradeReconciliations } from "@/hooks/queries/useTradeReconciliations";
import { useTradeContractSummaries } from "../useTradeContractSummary";
import type { Trade } from "@/types/trade.types";

const trade = (id: string, name: string, totalValue: number): Trade => ({
  category: { id, name, isSystemSeed: true, isActive: true, hasWorkspace: true },
  contracts: [
    {
      id: `${id}-c`, siteId: "s1", tradeCategoryId: id, stageId: null, title: name,
      laborTrackingMode: "detailed", isInHouse: false, contractType: "specialist",
      status: "active", totalValue, workProgressPercent: null, teamId: null,
      laborerId: null, mesthriOrSpecialistName: name, parentSubcontractId: null, createdAt: "",
    },
  ],
});

describe("useTradeContractSummaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assembles summaries from the two source hooks", () => {
    vi.mocked(useSiteTrades).mockReturnValue({
      data: [trade("paint", "Painting", 0), trade("civ", "Civil", 800000)],
      isLoading: false,
    } as any);
    vi.mocked(useSiteTradeReconciliations).mockReturnValue({
      data: new Map([["civ-c", { subcontractId: "civ-c", quotedAmount: 800000, amountPaid: 0, amountPaidSubcontractPayments: 0, amountPaidSettlements: 0, impliedLaborValueDetailed: 0, impliedLaborValueHeadcount: 0 }]]),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useTradeContractSummaries("s1"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.noAgreedAmountCategoryIds.has("paint")).toBe(true);
    expect(result.current.byCategoryId.get("civ")?.agreed).toBe(800000);
  });

  it("reports loading while either source hook is loading", () => {
    vi.mocked(useSiteTrades).mockReturnValue({ data: undefined, isLoading: true } as any);
    vi.mocked(useSiteTradeReconciliations).mockReturnValue({ data: undefined, isLoading: false } as any);
    const { result } = renderHook(() => useTradeContractSummaries("s1"));
    expect(result.current.isLoading).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/hooks/queries/__tests__/useTradeContractSummary.test.tsx`
Expected: FAIL — `useTradeContractSummaries` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/hooks/queries/useTradeContractSummary.ts
import { useMemo } from "react";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { useSiteTradeReconciliations } from "@/hooks/queries/useTradeReconciliations";
import {
  assembleSummaries,
  type AssembledSummaries,
} from "@/lib/workforce/tradeContractSummary";

/**
 * Compose the existing trades + reconciliation queries into money summaries
 * (per trade and per contract) for the attendance money strip and chip dot.
 * Pure assembly lives in tradeContractSummary.ts; this is glue + memoisation.
 */
export function useTradeContractSummaries(
  siteId: string | undefined
): AssembledSummaries & { isLoading: boolean } {
  const tradesQuery = useSiteTrades(siteId);
  const reconQuery = useSiteTradeReconciliations(siteId);

  const assembled = useMemo(
    () => assembleSummaries(tradesQuery.data, reconQuery.data),
    [tradesQuery.data, reconQuery.data]
  );

  return { ...assembled, isLoading: tradesQuery.isLoading || reconQuery.isLoading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/hooks/queries/__tests__/useTradeContractSummary.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useTradeContractSummary.ts src/hooks/queries/__tests__/useTradeContractSummary.test.tsx
git commit -m "feat(workforce): useTradeContractSummaries hook composing trades + reconciliation"
```

---

### Task 3: `ContractMoneyStrip` component

**Files:**
- Create: `src/components/attendance/ContractMoneyStrip.tsx`
- Test: `src/components/attendance/__tests__/ContractMoneyStrip.test.tsx`

**Interfaces:**
- Consumes: `ContractMoneySummary` from `@/lib/workforce/tradeContractSummary`; `wsColors`, `severityMeta` from `@/lib/workforce/workspaceTokens`.
- Produces: `function ContractMoneyStrip(props: { summary: ContractMoneySummary | null; onOpenContract: (contractId: string) => void }): JSX.Element | null`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/attendance/__tests__/ContractMoneyStrip.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContractMoneyStrip } from "../ContractMoneyStrip";
import type { ContractMoneySummary } from "@/lib/workforce/tradeContractSummary";

const base: ContractMoneySummary = {
  contractId: "c1", title: "Ashish", tradeName: "Painting",
  agreed: 100000, spent: 40000, remaining: 60000, overpaid: false,
  hasAgreedAmount: true, severity: "instep",
};

describe("ContractMoneyStrip", () => {
  it("renders nothing when summary is null", () => {
    const { container } = render(<ContractMoneyStrip summary={null} onOpenContract={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows agreed / spent / left for a healthy contract", () => {
    render(<ContractMoneyStrip summary={base} onOpenContract={vi.fn()} />);
    expect(screen.getByText(/agreed/i)).toBeTruthy();
    expect(screen.getByText(/spent/i)).toBeTruthy();
    expect(screen.getByText(/left/i)).toBeTruthy();
    expect(screen.getByTestId("contract-money-strip-verdict").textContent).toMatch(/in step/i);
  });

  it("shows the daily-wage-only warning with spent-so-far and a Set agreed action", () => {
    const onOpen = vi.fn();
    render(
      <ContractMoneyStrip
        summary={{ ...base, agreed: 0, remaining: 0, hasAgreedAmount: false }}
        onOpenContract={onOpen}
      />
    );
    expect(screen.getByText(/daily-wage only/i)).toBeTruthy();
    expect(screen.getByText(/40,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /set agreed/i }));
    expect(onOpen).toHaveBeenCalledWith("c1");
  });

  it("labels an overpaid contract", () => {
    render(
      <ContractMoneyStrip
        summary={{ ...base, spent: 112000, remaining: -12000, overpaid: true, severity: "high" }}
        onOpenContract={vi.fn()}
      />
    );
    expect(screen.getByText(/overpaid/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/attendance/__tests__/ContractMoneyStrip.test.tsx`
Expected: FAIL — `ContractMoneyStrip` not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/attendance/ContractMoneyStrip.tsx
"use client";

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { ContractMoneySummary } from "@/lib/workforce/tradeContractSummary";
import { wsColors, severityMeta } from "@/lib/workforce/workspaceTokens";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** Stat block: label + value, used for agreed / spent / left. */
function Cell({ label, value, color = wsColors.ink }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: wsColors.muted }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Compact money strip shown under the trade chips on /site/attendance, scoped to
 * the contract being recorded against. Two states:
 *  - agreed amount set → agreed / spent / left + the exposure verdict;
 *  - ₹0 agreed → amber "Daily-wage only" with spent-so-far + "Set agreed ₹".
 * Reuse-only: the Set-agreed action deep-links to the existing contract editor.
 */
export function ContractMoneyStrip({
  summary,
  onOpenContract,
}: {
  summary: ContractMoneySummary | null;
  onOpenContract: (contractId: string) => void;
}) {
  if (!summary) return null;

  if (!summary.hasAgreedAmount) {
    return (
      <Box
        data-testid="contract-money-strip"
        sx={{
          mb: 2, px: 1.75, py: 1.25, borderRadius: 2,
          bgcolor: wsColors.amberBg, border: `1px solid ${wsColors.amber}33`,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, color: wsColors.amber, fontSize: 14 }}>
              Daily-wage only — no agreed amount
            </Typography>
            <Typography sx={{ fontSize: 13, color: wsColors.ink2 }}>
              {inr(summary.spent)} paid so far on daily wage.
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={() => onOpenContract(summary.contractId)}>
            Set agreed ₹
          </Button>
        </Stack>
      </Box>
    );
  }

  const meta = severityMeta[summary.severity];
  return (
    <Box
      data-testid="contract-money-strip"
      role="button"
      tabIndex={0}
      onClick={() => onOpenContract(summary.contractId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenContract(summary.contractId);
      }}
      sx={{
        mb: 2, px: 1.75, py: 1.25, borderRadius: 2, cursor: "pointer",
        bgcolor: wsColors.surface, border: `1px solid ${wsColors.hairline}`,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography sx={{ fontWeight: 700, color: wsColors.ink, fontSize: 14, minWidth: 0 }} noWrap>
          {summary.title} · {summary.tradeName}
        </Typography>
        <Chip
          data-testid="contract-money-strip-verdict"
          size="small"
          label={meta.label}
          sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700 }}
        />
      </Stack>
      <Stack direction="row" spacing={3}>
        <Cell label="Agreed" value={inr(summary.agreed)} />
        <Cell label="Spent" value={inr(summary.spent)} color={wsColors.primary} />
        {summary.overpaid ? (
          <Cell label="Overpaid" value={inr(Math.abs(summary.remaining))} color={wsColors.red} />
        ) : (
          <Cell label="Left" value={inr(summary.remaining)} color={wsColors.green} />
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/attendance/__tests__/ContractMoneyStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/attendance/ContractMoneyStrip.tsx src/components/attendance/__tests__/ContractMoneyStrip.test.tsx
git commit -m "feat(attendance): ContractMoneyStrip (agreed/spent/left + daily-wage-only state)"
```

---

### Task 4: Amber "no agreed amount" dot on `TradeChipFilter`

**Files:**
- Modify: `src/components/attendance/TradeChipFilter.tsx`
- Test: `src/components/attendance/__tests__/TradeChipFilter.workspace.test.tsx`

**Interfaces:**
- Consumes: `noAgreedAmountCategoryIds?: Set<string>` (new optional prop); `wsColors` from `@/lib/workforce/workspaceTokens`.
- Produces: a `data-testid="trade-chip-noamount-<lowercased trade name>"` element rendered only when that trade's category id is in the set.

- [ ] **Step 1: Write the failing test** (append to the existing describe block in `TradeChipFilter.workspace.test.tsx`)

```tsx
  it("shows an amber 'no agreed amount' dot only for trades in noAgreedAmountCategoryIds", () => {
    mockTrades([
      trade({ id: "civ", name: "Civil", hasWorkspace: true }, [detailedContract("civ-c", "civ")]),
      trade({ id: "paint", name: "Painting", hasWorkspace: true }, [detailedContract("paint-c", "paint")]),
    ]);

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={vi.fn()}
        onNavigateScope={vi.fn()}
        noAgreedAmountCategoryIds={new Set(["paint"])}
      />
    );

    expect(screen.getByTestId("trade-chip-noamount-painting")).toBeTruthy();
    expect(screen.queryByTestId("trade-chip-noamount-civil")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/attendance/__tests__/TradeChipFilter.workspace.test.tsx`
Expected: FAIL — `trade-chip-noamount-painting` not found (prop ignored).

- [ ] **Step 3: Add the import** (top of `TradeChipFilter.tsx`)

Add `Badge` and `Tooltip` to the existing `@mui/material` import, and add the tokens import:

```tsx
import { Box, Stack, Chip, Typography, Skeleton, Badge, Tooltip } from "@mui/material";
import { wsColors } from "@/lib/workforce/workspaceTokens";
```

- [ ] **Step 4: Add the optional prop** (in `TradeChipFilterProps`, after `onNavigateScope`)

```tsx
  /**
   * Category ids whose trade has a contract but no agreed amount (Σ total_value === 0).
   * When a rendered chip's trade is in this set, an amber dot flags "daily-wage only".
   * Optional + opt-in: call sites that omit it render exactly as before.
   */
  noAgreedAmountCategoryIds?: Set<string>;
```

And destructure it in the function signature:

```tsx
export function TradeChipFilter({
  siteId,
  selected,
  onChange,
  allowAllChip = false,
  compact = false,
  onNavigateScope,
  noAgreedAmountCategoryIds,
}: TradeChipFilterProps) {
```

- [ ] **Step 5: Wrap the chip with the dot** — replace the `return (` block inside `visibleTrades.map((trade) => { ... })` (the existing `return <Chip ... />;`) with:

```tsx
          const chip = (
            <Chip
              key={trade.category.id}
              size={compact ? "small" : "medium"}
              label={
                isCivil ? "Civil" : `${trade.category.name} (${trade.contracts.length})`
              }
              variant={isSelected ? "filled" : "outlined"}
              onClick={
                isCivil
                  ? () =>
                      onNavigateScope
                        ? onNavigateScope(null)
                        : onChange({ kind: "civil" })
                  : () =>
                      handleTradeChipClick(
                        trade.category.id,
                        trade.category.name,
                        trade.contracts
                      )
              }
              sx={{ cursor: "pointer", ...selectedSx }}
              data-testid={isCivil ? "trade-chip-civil" : `trade-chip-${trade.category.name.toLowerCase()}`}
            />
          );

          if (!noAgreedAmountCategoryIds?.has(trade.category.id)) return chip;

          return (
            <Tooltip key={trade.category.id} title="No agreed amount — daily wage only">
              <Badge
                variant="dot"
                overlap="circular"
                slotProps={{
                  badge: {
                    "data-testid": `trade-chip-noamount-${trade.category.name.toLowerCase()}`,
                  } as Record<string, unknown>,
                }}
                sx={{ "& .MuiBadge-badge": { bgcolor: wsColors.amber } }}
              >
                {chip}
              </Badge>
            </Tooltip>
          );
```

Note: the `key` moves from the `Chip` to the returned outer element. The bare-chip branch keeps `key` on the `Chip`; the badge branch puts `key` on the `Tooltip`. Both satisfy React's list-key requirement.

- [ ] **Step 6: Run the test to verify it passes (and existing tests still pass)**

Run: `npm run test -- src/components/attendance/__tests__/TradeChipFilter.workspace.test.tsx src/components/attendance/__tests__/TradeChipFilter.nav.test.tsx`
Expected: PASS — new dot test passes; all prior gating/nav tests still pass (prop is optional, untouched call sites unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/components/attendance/TradeChipFilter.tsx src/components/attendance/__tests__/TradeChipFilter.workspace.test.tsx
git commit -m "feat(attendance): amber 'no agreed amount' dot on trade chips (opt-in prop)"
```

---

### Task 5: Wire the strip + dot into `/site/attendance`

**Files:**
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx`

**Interfaces:**
- Consumes: `useTradeContractSummaries` from `@/hooks/queries/useTradeContractSummary`; `ContractMoneyStrip` from `@/components/attendance/ContractMoneyStrip`; existing `tradeScope`, `router`, `selectedSite`, and the `<TradeChipFilter>` render block (line ~3465).
- Produces: no exports; integration only.

- [ ] **Step 1: Add the imports** (with the other component/hook imports near the top of the file)

```tsx
import { ContractMoneyStrip } from "@/components/attendance/ContractMoneyStrip";
import { useTradeContractSummaries } from "@/hooks/queries/useTradeContractSummary";
```

- [ ] **Step 2: Call the hook** — immediately AFTER the `tradeScope` `useMemo` (around line 589), add:

```tsx
  // Money summaries (agreed/spent/left + "no agreed amount" flags) for this site.
  const moneySummaries = useTradeContractSummaries(selectedSite?.id);
  const scopedMoneySummary = tradeScope?.contractId
    ? moneySummaries.byContractId.get(tradeScope.contractId) ?? null
    : null;
```

- [ ] **Step 3: Render the strip + pass the prop** — replace the existing `<TradeChipFilter ... />` block (lines ~3465–3470) with:

```tsx
        <TradeChipFilter
          siteId={selectedSite?.id}
          selected={tradeChipSelectionForDisplay}
          onChange={setTradeChipSelection}
          onNavigateScope={(id) => router.push(id ? `/site/attendance?contractId=${id}` : "/site/attendance")}
          noAgreedAmountCategoryIds={moneySummaries.noAgreedAmountCategoryIds}
        />
        <ContractMoneyStrip
          summary={scopedMoneySummary}
          onOpenContract={(id) => router.push(`/site/trades?contract=${id}`)}
        />
```

(The `<ContractMoneyStrip>` sits just below the chips and renders nothing unless a contract is scoped via `?contractId=`.)

- [ ] **Step 4: Typecheck + lint the changed file**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `attendance-content.tsx`, `ContractMoneyStrip`, or `useTradeContractSummary`.

Run: `npx next lint --file "src/app/(main)/site/attendance/attendance-content.tsx"`
Expected: no new lint errors.

- [ ] **Step 5: Run the full affected test set + production build**

Run: `npm run test -- src/lib/workforce/__tests__/tradeContractSummary.test.ts src/hooks/queries/__tests__/useTradeContractSummary.test.tsx src/components/attendance/__tests__/ContractMoneyStrip.test.tsx src/components/attendance/__tests__/TradeChipFilter.workspace.test.tsx src/components/attendance/__tests__/TradeChipFilter.nav.test.tsx`
Expected: PASS.

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Manual verification (Playwright MCP, per CLAUDE.md "After UI Changes")**

1. Ensure `npm run dev:cloud` is running.
2. Navigate to `http://localhost:3000/dev-login`, then `/site/attendance`.
3. Tap a non-Civil trade chip that has a contract with no agreed amount → confirm the amber dot on the chip AND the amber "Daily-wage only — no agreed amount" strip with spent-so-far + "Set agreed ₹".
4. Click "Set agreed ₹" → confirm it lands on `/site/trades` scoped to that contract; set an agreed amount there.
5. Return to `/site/attendance`, re-scope the trade → confirm the strip now shows Agreed / Spent / Left + a verdict chip, and the chip dot is gone.
6. Read console logs; fix any errors/warnings before closing the browser.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(main)/site/attendance/attendance-content.tsx"
git commit -m "feat(attendance): show contract money strip + chip dot on /site/attendance"
```

---

## Self-Review

**1. Spec coverage (Phase 1 scope):**
- Foundation hook (spec §4) → Tasks 1–2. ✓
- Attendance money strip, both states, spent-shown-when-₹0, reuse-not-new-write (spec §5) → Task 3 + Task 5 (Set-agreed deep-links to existing editor instead of reconstructing a `WorkspaceTask` for `EditContractDialog` — documented deviation, same intent). ✓
- Chip amber dot, clean when set, opt-in/back-compat (spec §6) → Task 4. ✓
- Civil-plain-view strip (no `?contractId=`) is intentionally **deferred** within Phase 1 (the strip needs a scoped contract id; the chip dot still flags Civil). Noted in spec §5 and here. Phases 2 & 3 are separate plans.

**2. Placeholder scan:** No TBD/TODO; every code step has complete code; every command has expected output. ✓

**3. Type consistency:** `ContractMoneySummary` / `TradeMoneySummary` / `AssembledSummaries` field names are identical across Tasks 1→2→3→5. `assembleSummaries(trades, reconMap)`, `useTradeContractSummaries(siteId)`, `ContractMoneyStrip({summary,onOpenContract})`, and the `noAgreedAmountCategoryIds: Set<string>` prop match every consumer. `RollupTask`/`rollupTasks`/`rollupSeverity` used per their real signatures in `exposure.ts`. ✓
