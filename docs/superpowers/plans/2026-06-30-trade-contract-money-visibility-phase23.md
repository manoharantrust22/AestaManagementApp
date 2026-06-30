# Trade Contract Money Visibility — Phase 2 + 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (P2) Prompt the user to create a contract the moment a trade's Workspace is ON but has no detailed contract; (P3) a manager cross-site overview tab on `/company/contracts` listing every site×trade's agreed/spent/remaining, attention-first.

**Architecture:** Both reuse the Phase-1 `useTradeContractSummaries` hook + `TradeMoneySummary`. P2 adds a presentational prompt + the existing `QuickCreateContractDialog` into `SiteTradeWorkspacesManager`. P3 adds one pure aggregator (`buildTradeOverview`) + a presentational table + a per-site collector component (to fetch each site's summaries without violating Rules of Hooks) + a tab.

**Tech Stack:** Next.js 15 app router, React 19, MUI v7, TanStack React Query v5, Vitest + RTL, TypeScript.

## Global Constraints
- No DB schema changes. Reuse `useTradeContractSummaries` / `TradeMoneySummary` from Phase 1.
- Currency: `Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0})`.
- Components used in tests must `import React from "react"` (classic JSX runtime in this repo's vitest).
- Amber/red/green from `wsColors` in `src/lib/workforce/workspaceTokens.ts`.
- **Rules of Hooks:** never call `useTradeContractSummaries` inside a `.map()` over sites — use one collector component per site instead.
- Reuse `QuickCreateContractDialog` (no new contract-create code). Reuse the existing `Tabs` on `/company/contracts` (no new route).

---

## File Structure
- **Create** `src/components/site-settings/NoContractPrompt.tsx` — presentational prompt (P2).
- **Create** `src/components/site-settings/__tests__/NoContractPrompt.test.tsx`.
- **Modify** `src/components/site-settings/SiteTradeWorkspacesManager.tsx` — wire detection + prompt + dialog (P2).
- **Create** `src/lib/workforce/tradeOverview.ts` — pure aggregator (P3).
- **Create** `src/lib/workforce/__tests__/tradeOverview.test.ts`.
- **Create** `src/components/contracts/TradeOverviewTable.tsx` — presentational table (P3).
- **Create** `src/components/contracts/__tests__/TradeOverviewTable.test.tsx`.
- **Create** `src/components/contracts/CrossSiteTradeOverview.tsx` — collectors + aggregation + table (P3).
- **Modify** `src/app/(main)/company/contracts/page.tsx` — add the "Cross-site overview" tab (P3).

---

## PHASE 2

### Task P2.1: `NoContractPrompt` presentational component

**Files:** Create `src/components/site-settings/NoContractPrompt.tsx`; Test `src/components/site-settings/__tests__/NoContractPrompt.test.tsx`.

**Interfaces:**
- Produces: `function NoContractPrompt(props: { show: boolean; onCreate: () => void }): JSX.Element | null`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/site-settings/__tests__/NoContractPrompt.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoContractPrompt } from "../NoContractPrompt";

describe("NoContractPrompt", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(<NoContractPrompt show={false} onCreate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the warning and fires onCreate when the button is clicked", () => {
    const onCreate = vi.fn();
    render(<NoContractPrompt show onCreate={onCreate} />);
    expect(screen.getByText(/no contract yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create contract/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/site-settings/__tests__/NoContractPrompt.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/site-settings/NoContractPrompt.tsx
"use client";

import React from "react";
import { Alert, Button } from "@mui/material";

/**
 * Shown inside a trade card when its Workspace is ON but it has no detailed
 * contract — workers can't be recorded against it and there's no agreed amount.
 * The button opens the existing QuickCreateContractDialog (handled by the parent).
 */
export function NoContractPrompt({ show, onCreate }: { show: boolean; onCreate: () => void }) {
  if (!show) return null;
  return (
    <Alert
      severity="warning"
      sx={{ mt: 1 }}
      action={
        <Button color="inherit" size="small" onClick={onCreate}>
          Create contract & set agreed ₹
        </Button>
      }
    >
      No contract yet — workers can&apos;t be recorded against this trade, and there&apos;s no agreed amount.
    </Alert>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/site-settings/__tests__/NoContractPrompt.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/site-settings/NoContractPrompt.tsx src/components/site-settings/__tests__/NoContractPrompt.test.tsx
git commit -m "feat(site-settings): NoContractPrompt for activated-but-contractless trades"
```

---

### Task P2.2: Wire detection + prompt + dialog into `SiteTradeWorkspacesManager`

**Files:** Modify `src/components/site-settings/SiteTradeWorkspacesManager.tsx`.

**Interfaces:**
- Consumes: `useTradeContractSummaries` (`@/hooks/queries/useTradeContractSummary`); `QuickCreateContractDialog` (`@/components/trades/QuickCreateContractDialog`); `NoContractPrompt`.

- [ ] **Step 1: Add imports** (with the existing imports at the top)

```tsx
import { useState } from "react"; // already imported alongside useMemo — ensure useState present
import { useTradeContractSummaries } from "@/hooks/queries/useTradeContractSummary";
import { QuickCreateContractDialog } from "@/components/trades/QuickCreateContractDialog";
import { NoContractPrompt } from "./NoContractPrompt";
```
(Note: `useMemo, useState` are already imported from "react" at line 3 — only add the three module imports if `useState` is present; otherwise add `useState` too.)

- [ ] **Step 2: Add the summaries hook + dialog state** — right after `const upsert = useUpsertSiteTradeSetting();` (around line 28)

```tsx
  const summaries = useTradeContractSummaries(siteId);
  const [createCtx, setCreateCtx] = useState<{ tradeCategoryId: string; tradeName: string } | null>(null);
```

- [ ] **Step 3: Compute the flag inside `renderCard`** — after `const effectiveWs = ov?.has_workspace ?? true;` (around line 66)

```tsx
    const hasDetailedContract = summaries.byCategoryId.get(c.id)?.hasDetailedContract ?? false;
    const showNoContractPrompt = effectiveWs && !hasDetailedContract;
```

- [ ] **Step 4: Render the prompt inside the card** — replace the card's outer `<Card ...><Stack direction="row" ...>...</Stack></Card>` closing so the prompt sits below the row. Find the end of the `renderCard` return (the `</Card>` that closes the card) and insert the prompt just before it, wrapping the existing row Stack. Concretely, change the card body to:

```tsx
    return (
      <Card key={c.id} variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          {/* ...existing left Box + right Switch Stack unchanged... */}
        </Stack>
        <NoContractPrompt
          show={showNoContractPrompt}
          onCreate={() => setCreateCtx({ tradeCategoryId: c.id, tradeName: c.name })}
        />
      </Card>
    );
```
(Keep everything currently inside the `<Stack direction="row" ...>` exactly as-is; only add the `<NoContractPrompt .../>` line after that Stack, still inside `<Card>`.)

- [ ] **Step 5: Render the dialog once** — at the end of the component's top-level returned JSX, just before the final closing `</Box>` of the `return (<Box>...</Box>)`:

```tsx
      {createCtx && (
        <QuickCreateContractDialog
          open={!!createCtx}
          onClose={() => setCreateCtx(null)}
          onCreated={() => setCreateCtx(null)}
          siteId={siteId}
          tradeCategoryId={createCtx.tradeCategoryId}
          tradeName={createCtx.tradeName}
          tier="contract"
          initialStatus="active"
        />
      )}
```

- [ ] **Step 6: Typecheck + build the file**

Run: `npx tsc --noEmit 2>&1 | grep -iE "SiteTradeWorkspacesManager|NoContractPrompt" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/components/site-settings/SiteTradeWorkspacesManager.tsx
git commit -m "feat(site-settings): prompt to create a contract when a trade is activated without one"
```

---

## PHASE 3

### Task P3.1: Pure `buildTradeOverview` aggregator

**Files:** Create `src/lib/workforce/tradeOverview.ts`; Test `src/lib/workforce/__tests__/tradeOverview.test.ts`.

**Interfaces:**
- Consumes: `TradeMoneySummary` from `./tradeContractSummary`.
- Produces:
  - `type OverviewTier = "no_contract" | "blind" | "overpaid" | "healthy"`
  - `interface OverviewRow { siteId; siteName; tradeCategoryId; tradeName; agreed; spent; remaining; contractCount; tier }`
  - `interface OverviewTotals { agreed; spent; remaining; blindCount }`
  - `interface SiteSummaries { siteId; siteName; summaries: TradeMoneySummary[] }`
  - `tierForSummary(s: TradeMoneySummary): OverviewTier`
  - `buildTradeOverview(perSite: SiteSummaries[]): { rows: OverviewRow[]; totals: OverviewTotals }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workforce/__tests__/tradeOverview.test.ts
import { describe, it, expect } from "vitest";
import { buildTradeOverview, tierForSummary } from "../tradeOverview";
import type { TradeMoneySummary } from "../tradeContractSummary";

const s = (over: Partial<TradeMoneySummary> & { tradeCategoryId: string; tradeName: string }): TradeMoneySummary => ({
  hasDetailedContract: true, hasAgreedAmount: true, agreed: 0, spent: 0, remaining: 0,
  severity: "instep", contractCount: 1, ...over,
});

describe("tierForSummary", () => {
  it("no contract when contractCount is 0", () => {
    expect(tierForSummary(s({ tradeCategoryId: "e", tradeName: "Electrical", contractCount: 0, hasAgreedAmount: false }))).toBe("no_contract");
  });
  it("blind when has contract but no agreed amount", () => {
    expect(tierForSummary(s({ tradeCategoryId: "p", tradeName: "Painting", hasAgreedAmount: false, agreed: 0 }))).toBe("blind");
  });
  it("overpaid when spent exceeds agreed", () => {
    expect(tierForSummary(s({ tradeCategoryId: "c", tradeName: "Carpenter", agreed: 100, spent: 120, remaining: -20 }))).toBe("overpaid");
  });
  it("healthy otherwise", () => {
    expect(tierForSummary(s({ tradeCategoryId: "v", tradeName: "Civil", agreed: 100, spent: 40, remaining: 60 }))).toBe("healthy");
  });
});

describe("buildTradeOverview", () => {
  it("flattens, sorts attention-first, and totals", () => {
    const { rows, totals } = buildTradeOverview([
      { siteId: "s1", siteName: "Srinivasan", summaries: [
        s({ tradeCategoryId: "v", tradeName: "Civil", agreed: 800000, spent: 500000, remaining: 300000 }),       // healthy
        s({ tradeCategoryId: "p", tradeName: "Painting", hasAgreedAmount: false, agreed: 0, spent: 38000 }),     // blind
      ]},
      { siteId: "s2", siteName: "Padmavati", summaries: [
        s({ tradeCategoryId: "e", tradeName: "Electrical", contractCount: 0, hasAgreedAmount: false }),          // no_contract
        s({ tradeCategoryId: "c", tradeName: "Carpenter", agreed: 100000, spent: 112000, remaining: -12000 }),  // overpaid
      ]},
    ]);
    // attention-first: no_contract, blind, overpaid, then healthy
    expect(rows.map((r) => r.tier)).toEqual(["no_contract", "blind", "overpaid", "healthy"]);
    expect(rows[0].tradeName).toBe("Electrical");
    expect(totals.agreed).toBe(900000);
    expect(totals.spent).toBe(650000);
    expect(totals.remaining).toBe(288000);
    expect(totals.blindCount).toBe(2); // no_contract + blind
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/workforce/__tests__/tradeOverview.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/workforce/tradeOverview.ts
/**
 * Pure cross-site aggregator for the manager overview. Flattens per-site trade
 * money summaries into rows, classifies each into an attention tier, sorts
 * attention-first, and totals. No React.
 */
import type { TradeMoneySummary } from "./tradeContractSummary";

export type OverviewTier = "no_contract" | "blind" | "overpaid" | "healthy";

export interface OverviewRow {
  siteId: string;
  siteName: string;
  tradeCategoryId: string;
  tradeName: string;
  agreed: number;
  spent: number;
  remaining: number;
  contractCount: number;
  tier: OverviewTier;
}

export interface OverviewTotals {
  agreed: number;
  spent: number;
  remaining: number;
  /** Trades running blind = no_contract + blind (₹0 agreed). */
  blindCount: number;
}

export interface SiteSummaries {
  siteId: string;
  siteName: string;
  summaries: TradeMoneySummary[];
}

export function tierForSummary(s: TradeMoneySummary): OverviewTier {
  if (s.contractCount === 0) return "no_contract";
  if (!s.hasAgreedAmount) return "blind";
  if (s.spent > s.agreed) return "overpaid";
  return "healthy";
}

const TIER_RANK: Record<OverviewTier, number> = {
  no_contract: 0,
  blind: 1,
  overpaid: 2,
  healthy: 3,
};

export function buildTradeOverview(perSite: SiteSummaries[]): {
  rows: OverviewRow[];
  totals: OverviewTotals;
} {
  const rows: OverviewRow[] = [];
  for (const { siteId, siteName, summaries } of perSite) {
    for (const s of summaries) {
      rows.push({
        siteId,
        siteName,
        tradeCategoryId: s.tradeCategoryId,
        tradeName: s.tradeName,
        agreed: s.agreed,
        spent: s.spent,
        remaining: s.remaining,
        contractCount: s.contractCount,
        tier: tierForSummary(s),
      });
    }
  }
  rows.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.spent - a.spent);
  const totals: OverviewTotals = {
    agreed: rows.reduce((n, r) => n + r.agreed, 0),
    spent: rows.reduce((n, r) => n + r.spent, 0),
    remaining: rows.reduce((n, r) => n + r.remaining, 0),
    blindCount: rows.filter((r) => r.tier === "no_contract" || r.tier === "blind").length,
  };
  return { rows, totals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/workforce/__tests__/tradeOverview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workforce/tradeOverview.ts src/lib/workforce/__tests__/tradeOverview.test.ts
git commit -m "feat(workforce): pure cross-site trade overview aggregator (tiers + totals)"
```

---

### Task P3.2: `TradeOverviewTable` presentational component

**Files:** Create `src/components/contracts/TradeOverviewTable.tsx`; Test `src/components/contracts/__tests__/TradeOverviewTable.test.tsx`.

**Interfaces:**
- Consumes: `OverviewRow`, `OverviewTotals`, `OverviewTier` from `@/lib/workforce/tradeOverview`.
- Produces: `function TradeOverviewTable(props: { rows: OverviewRow[]; totals: OverviewTotals; onOpenRow: (row: OverviewRow) => void }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contracts/__tests__/TradeOverviewTable.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradeOverviewTable } from "../TradeOverviewTable";
import type { OverviewRow, OverviewTotals } from "@/lib/workforce/tradeOverview";

const rows: OverviewRow[] = [
  { siteId: "s2", siteName: "Padmavati", tradeCategoryId: "e", tradeName: "Electrical", agreed: 0, spent: 0, remaining: 0, contractCount: 0, tier: "no_contract" },
  { siteId: "s1", siteName: "Srinivasan", tradeCategoryId: "v", tradeName: "Civil", agreed: 800000, spent: 500000, remaining: 300000, contractCount: 3, tier: "healthy" },
];
const totals: OverviewTotals = { agreed: 800000, spent: 500000, remaining: 300000, blindCount: 1 };

describe("TradeOverviewTable", () => {
  it("renders a row per entry with site + trade and fires onOpenRow", () => {
    const onOpen = vi.fn();
    render(<TradeOverviewTable rows={rows} totals={totals} onOpenRow={onOpen} />);
    expect(screen.getByText("Electrical")).toBeTruthy();
    expect(screen.getByText("Civil")).toBeTruthy();
    expect(screen.getByText(/NO CONTRACT/i)).toBeTruthy();
    fireEvent.click(screen.getByText("Civil"));
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
  });

  it("shows the totals row with blind count", () => {
    render(<TradeOverviewTable rows={rows} totals={totals} onOpenRow={vi.fn()} />);
    expect(screen.getByText(/1 running blind/i)).toBeTruthy();
  });

  it("renders an empty state when there are no rows", () => {
    render(<TradeOverviewTable rows={[]} totals={{ agreed: 0, spent: 0, remaining: 0, blindCount: 0 }} onOpenRow={vi.fn()} />);
    expect(screen.getByText(/no trades/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/contracts/__tests__/TradeOverviewTable.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/contracts/TradeOverviewTable.tsx
"use client";

import React from "react";
import {
  Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import type { OverviewRow, OverviewTotals, OverviewTier } from "@/lib/workforce/tradeOverview";
import { wsColors } from "@/lib/workforce/workspaceTokens";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const TIER_META: Record<OverviewTier, { label: string; color: string; bg: string }> = {
  no_contract: { label: "NO CONTRACT", color: wsColors.red, bg: wsColors.redBg },
  blind: { label: "₹0 agreed", color: wsColors.amber, bg: wsColors.amberBg },
  overpaid: { label: "Overpaid", color: wsColors.amber, bg: wsColors.amberBg },
  healthy: { label: "Healthy", color: wsColors.green, bg: wsColors.greenBg },
};

export function TradeOverviewTable({
  rows,
  totals,
  onOpenRow,
}: {
  rows: OverviewRow[];
  totals: OverviewTotals;
  onOpenRow: (row: OverviewRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 2, fontStyle: "italic" }}>
        No trades with contracts across your sites yet.
      </Typography>
    );
  }
  return (
    <Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Site</TableCell>
            <TableCell>Trade</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Agreed</TableCell>
            <TableCell align="right">Spent</TableCell>
            <TableCell align="right">Remaining</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const meta = TIER_META[r.tier];
            return (
              <TableRow
                key={`${r.siteId}:${r.tradeCategoryId}`}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => onOpenRow(r)}
              >
                <TableCell>{r.siteName}</TableCell>
                <TableCell>{r.tradeName}</TableCell>
                <TableCell>
                  <Chip size="small" label={meta.label} sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700 }} />
                </TableCell>
                <TableCell align="right">{inr(r.agreed)}</TableCell>
                <TableCell align="right">{inr(r.spent)}</TableCell>
                <TableCell align="right" sx={{ color: r.tier === "overpaid" ? wsColors.red : undefined }}>
                  {r.tier === "overpaid" ? `-${inr(Math.abs(r.remaining))}` : inr(r.remaining)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mt: 1.5, px: 1, py: 1, bgcolor: wsColors.canvas, borderRadius: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Agreed {inr(totals.agreed)}</Typography>
        <Typography sx={{ fontWeight: 700 }}>Spent {inr(totals.spent)}</Typography>
        <Typography sx={{ fontWeight: 700 }}>Remaining {inr(totals.remaining)}</Typography>
        <Typography sx={{ fontWeight: 700, color: totals.blindCount > 0 ? wsColors.amber : wsColors.green }}>
          {totals.blindCount} running blind
        </Typography>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/contracts/__tests__/TradeOverviewTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/contracts/TradeOverviewTable.tsx src/components/contracts/__tests__/TradeOverviewTable.test.tsx
git commit -m "feat(contracts): TradeOverviewTable (attention-first cross-site rows + totals)"
```

---

### Task P3.3: `CrossSiteTradeOverview` (collectors + aggregation)

**Files:** Create `src/components/contracts/CrossSiteTradeOverview.tsx`.

**Interfaces:**
- Consumes: `useSitesData` (`@/contexts/SiteContext/SitesDataContext`), `useSiteActions` (`@/contexts/SiteContext/SiteActionsContext`), `useTradeContractSummaries`, `buildTradeOverview`, `TradeOverviewTable`, `useRouter`.
- Produces: `function CrossSiteTradeOverview(): JSX.Element`.

- [ ] **Step 1: Write the implementation** (integration component — verified by build + manual; no unit test, the testable logic is in P3.1/P3.2)

```tsx
// src/components/contracts/CrossSiteTradeOverview.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Box } from "@mui/material";
import { useRouter } from "next/navigation";
import { useSitesData } from "@/contexts/SiteContext/SitesDataContext";
import { useSiteActions } from "@/contexts/SiteContext/SiteActionsContext";
import { useTradeContractSummaries } from "@/hooks/queries/useTradeContractSummary";
import { buildTradeOverview, type SiteSummaries } from "@/lib/workforce/tradeOverview";
import type { TradeMoneySummary } from "@/lib/workforce/tradeContractSummary";
import { TradeOverviewTable } from "./TradeOverviewTable";

/**
 * One collector per site — calls useTradeContractSummaries(siteId) (so the hook
 * is never called inside a .map over a dynamic list) and reports the site's trade
 * summaries up to the parent. Renders nothing.
 */
function SiteSummaryCollector({
  siteId,
  onLoaded,
}: {
  siteId: string;
  onLoaded: (siteId: string, summaries: TradeMoneySummary[]) => void;
}) {
  const summ = useTradeContractSummaries(siteId);
  const rows = useMemo(() => Array.from(summ.byCategoryId.values()), [summ.byCategoryId]);
  React.useEffect(() => {
    if (!summ.isLoading) onLoaded(siteId, rows);
  }, [summ.isLoading, rows, siteId, onLoaded]);
  return null;
}

export function CrossSiteTradeOverview() {
  const { sites } = useSitesData();
  const { setSelectedSite } = useSiteActions();
  const router = useRouter();
  const [bySite, setBySite] = useState<Map<string, TradeMoneySummary[]>>(new Map());

  const handleLoaded = useCallback((siteId: string, summaries: TradeMoneySummary[]) => {
    setBySite((prev) => {
      const next = new Map(prev);
      next.set(siteId, summaries);
      return next;
    });
  }, []);

  const { rows, totals } = useMemo(() => {
    const perSite: SiteSummaries[] = sites.map((s) => ({
      siteId: s.id,
      siteName: s.name,
      summaries: bySite.get(s.id) ?? [],
    }));
    return buildTradeOverview(perSite);
  }, [sites, bySite]);

  return (
    <Box>
      {sites.map((s) => (
        <SiteSummaryCollector key={s.id} siteId={s.id} onLoaded={handleLoaded} />
      ))}
      <TradeOverviewTable
        rows={rows}
        totals={totals}
        onOpenRow={(row) => {
          const site = sites.find((x) => x.id === row.siteId);
          if (site) setSelectedSite(site);
          router.push("/site/trades");
        }}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "CrossSiteTradeOverview|tradeOverview|TradeOverviewTable" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/components/contracts/CrossSiteTradeOverview.tsx
git commit -m "feat(contracts): CrossSiteTradeOverview collectors + aggregation"
```

---

### Task P3.4: Add the "Cross-site overview" tab to `/company/contracts`

**Files:** Modify `src/app/(main)/company/contracts/page.tsx`.

**Interfaces:**
- Consumes: `CrossSiteTradeOverview`. The page has `const [activeTab, setActiveTab] = useState<ContractStatus | "all">("all")` (line ~111) and a `<Tabs value={activeTab} ...>` block (~line 863).

- [ ] **Step 1: Widen the tab state type** — change the `activeTab` state declaration:

```tsx
const [activeTab, setActiveTab] = useState<ContractStatus | "all" | "overview">("all");
```

- [ ] **Step 2: Add the import** (with other imports at the top)

```tsx
import { CrossSiteTradeOverview } from "@/components/contracts/CrossSiteTradeOverview";
```

- [ ] **Step 3: Add the Tab** — inside the `<Tabs ...>` block, after the `<Tab label="All" value="all" />`:

```tsx
            <Tab label="Money by trade" value="overview" />
```

- [ ] **Step 4: Render the overview when selected** — immediately after the `</Card>` that closes the Tabs Card (around line 876), add:

```tsx
        {activeTab === "overview" && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <CrossSiteTradeOverview />
            </CardContent>
          </Card>
        )}
```

And guard the existing contract-list rendering so it does NOT show on the overview tab — wrap the existing list/table block (the part filtered by status) in `{activeTab !== "overview" && ( ... )}`. (Find where the status-filtered contracts render below the Tabs and add this guard around it.)

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -iE "company/contracts|CrossSiteTradeOverview" || echo "clean"`
Expected: `clean`.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(main)/company/contracts/page.tsx"
git commit -m "feat(contracts): add 'Money by trade' cross-site overview tab"
```

---

## Self-Review
**Spec coverage:** P2 activation prompt (spec §7) → P2.1–P2.2. P3 manager overview tab, attention-first, three tiers, totals, deep-link (spec §8) → P3.1–P3.4. ✓
**Placeholders:** none — all code complete, all commands have expected output. ✓
**Type consistency:** `TradeMoneySummary` fields (agreed/spent/remaining/hasAgreedAmount/contractCount/severity/tradeCategoryId/tradeName) match Phase-1. `OverviewRow`/`OverviewTotals`/`OverviewTier`/`SiteSummaries` consistent across P3.1→P3.2→P3.3. `QuickCreateContractDialog` props match the real signature. `useSitesData`/`useSiteActions` return shapes per exploration. ✓
**Rules of Hooks:** P3.3 uses one collector component per site (no hook in a `.map`). ✓
**Manual verification** (after build): /company/settings (trades) — activate a contractless trade → prompt appears, create dialog opens pre-scoped. /company/contracts → "Money by trade" tab → attention-first rows + totals; click a row → switches site + opens /site/trades.
