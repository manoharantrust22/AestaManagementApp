# Per-Trade Contract Money Visibility — Design

- **Date:** 2026-06-30
- **Status:** Approved (design); ready for implementation plan
- **Approach:** Reuse the existing contract rollup (no new source of truth), built in 3 value-first phases

---

## 1. Problem

The owner is a "manager of managers." Day to day, a site engineer **activates a trade and marks attendance** (paying daily wage), but nothing in that flow tells him — or the owner — whether a **contract with an agreed amount** even exists for that trade. Consequences:

- Workers get paid **daily-wage blind**: money goes out with no agreed ceiling, and nobody notices there's no contract.
- The owner cannot see, where the work actually happens, **"₹X agreed · ₹Y spent · ₹Z remaining"** for the contract made with the office.
- The agreed/spent/remaining numbers **already exist**, but they're buried in a separate "Contracts" tab (with sections), not where attendance is recorded.

Civil already works the way the owner wants (a "Civil contractor" contract with sections). The ask: give Painting, Electrical, and Carpenter the **same** money-visibility, and make the contract's presence/absence and agreed amount obvious **where work happens**.

### Example (owner's words)
Painter "Ashish" has an agreed **₹1,00,000 at the Srinivasa site** and **₹2,00,000 at the Padmavati site**. Each is a separate per-site contract; the agreed amount belongs on that contract.

---

## 2. Key insight — what to actually warn about

The accepted/agreed amount is **not** a new concept. It is the existing field **`subcontracts.total_value`** (typed `TradeContract.totalValue`, surfaced as **"Contract value"** in the workspace and **"Agreed value" / "Quoted total"** in the forms). Contracts are per-site, so per-site agreed amounts are already naturally modelled.

Reading the chip-gating rule (`src/lib/trades/visibleTradeWorkspaces.ts`) clarified the real-world states:

- A **non-Civil** trade only shows an attendance chip **after a detailed contract exists** (the chip needs something to record against). So you can't even mark Painting attendance without a contract.
- But a contract can be created with **agreed amount = ₹0** (the create form literally says *"Leave 0 if no fixed quote yet"*).
- **Civil** is always on and has an auto-created in-house contract, often with ₹0 agreed.

Therefore the thing that makes the owner "blind" is **not** a missing contract — it is a contract with **no agreed amount set**. That is the signal to surface everywhere: **"Daily-wage only — no agreed amount."**

### The 4-state lifecycle (single source of truth for every surface)

| State | Meaning | Surfaced as |
|---|---|---|
| **1. Not activated** | Workspace toggle OFF | Ladder only, no chip (a settings concern) |
| **2. Activated, no contract** | Workspace ON but no detailed contract | No chip yet → **Phase 2** prompts to create one; flagged in **Phase 3** |
| **3. Contract, ₹0 agreed** | Recording attendance, no ceiling | 🟠 "Daily-wage only — set agreed amount" |
| **4. Contract, ₹ agreed** | Healthy | "₹1,00,000 agreed · ₹40,000 spent · ₹60,000 left" + verdict |

---

## 3. Goals / Non-goals

**Goals**
- Make the agreed/spent/remaining money picture visible **on the attendance screen**, scoped to the contract being recorded against.
- Make "no agreed amount (daily-wage only)" obvious **at a glance** on the trade chips.
- Prompt for a contract **at the moment a trade is activated**, so attendance is never recorded against nothing.
- Give the owner a **cross-site overview** that floats problems (no contract / ₹0 agreed / overpaid) to the top.
- **No new accounting and no schema changes** — reuse the existing reconciliation rollup.

**Non-goals**
- No second "trade-level agreed amount" field that could disagree with the contracts (explicitly rejected — see §8 Approach 2).
- No change to how settlements/payments are recorded or how `total_value` is computed.
- No removal of the existing `/site/trades` contract detail panes; they remain the deep-dive.

---

## 4. Foundation — `useTradeContractSummary(siteId)`

One shared hook is the engine for all four surfaces. It derives everything from data that already exists.

**Output (per trade at the site):**
```ts
interface TradeContractSummary {
  tradeCategoryId: string;
  tradeName: string;
  hasDetailedContract: boolean; // state 2 vs 3/4: any detailed contract exists?
  hasAgreedAmount: boolean;     // Σ total_value > 0
  agreed: number;               // Σ total_value across the trade's contracts
  spent: number;                // Σ amount_paid (settlements + subcontract payments)
  remaining: number;            // max(agreed - spent, ...) per existing rollup semantics
  verdict: ExposureSeverity;    // reuse exposure.ts thresholds (none/safe/instep/watch/high)
  contractCount: number;
}
```

**Derivation (no new queries beyond what exists):**
- `subcontracts` rows grouped by `trade_category_id` (already via `useSiteTrades` / `groupContractsByTrade`).
- Money from the **existing** `v_subcontract_reconciliation` view (`quoted_amount` = `total_value`, `amount_paid`), already wrapped by `useTradeReconciliations` (`ContractReconciliation`).
- Rollup + verdict from the **existing** `src/lib/workforce/exposure.ts` (`rollupTasks`) and `workspaceModel.ts` aggregation logic.

**Per-contract variant:** the attendance strip needs the figure for the *currently-scoped* contract, not the whole trade. Provide a per-contract selector (e.g. `summaryForContract(contractId)`) from the same data, so the strip and the chip/overview share one computation.

---

## 5. Phase 1a — Attendance-screen money strip

**Where:** top of the trade-scoped attendance view, directly under `TradeChipFilter`, above the attendance table (`src/app/(main)/site/attendance/attendance-content.tsx`). Reads the **currently-scoped contract's** summary.

**State 4 — agreed amount set (healthy):**
```
Ashish · Painting                         ● In step
₹1,00,000 agreed    ₹40,000 spent    ₹60,000 left
```
- Verdict chip + colors come straight from `exposure.ts` thresholds (no new logic).
- Tap → deep-links to the full contract detail (`/site/trades?contract=<id>`).
- Reuse existing presentational pieces (`RemainingStrip`, `StatCard` in `src/components/workforce/`).

**State 3 — ₹0 agreed (the "blind" case):**
```
🟠 Daily-wage only — no agreed amount set
₹40,000 paid so far on daily wage.            [ Set agreed ₹ ]
```
- **Spent-so-far is still shown** even with no agreed amount — the whole point is seeing money leave with no ceiling.
- `[Set agreed ₹]` opens the **existing `EditContractDialog`** focused on its "Agreed value" field. No new write path.

**Behavior**
- Sub-picker present (trade has 2+ detailed contracts): strip follows the **selected** contract.
- **Civil:** same strip, scoped to the in-house contract being recorded against. The whole-trade Civil rollup (parent + sections) stays on `/site/trades`.

Phase 1a is **read + reuse only** — zero new write paths.

---

## 6. Phase 1b — Trade-chip "no agreed amount" badge

**Where:** `src/components/attendance/TradeChipFilter.tsx`.

- Add a small **amber corner dot** (MUI `Badge`) on a trade chip when `hasAgreedAmount === false` (state 3). Tooltip: *"No agreed amount — daily wage only."*
- When an agreed amount **is** set (state 4): **no badge**, chip stays its normal trade color (clean = healthy).
- The existing `(N)` contract-count label is unchanged; the dot sits on the chip corner.
- Civil chip gets the same dot when its in-house contract has ₹0 agreed.

**Chosen marker:** amber corner dot (selected over `₹?` label, warning-icon prefix, and amber-tinted chip), because it preserves the per-trade color used to distinguish trades while still flagging the state. Colors via existing `getTradeColor` (`src/theme/tradeColors.ts`).

**Known limitation (by design):** a non-Civil chip only appears after a detailed contract exists, so state 2 ("activated, no contract at all") cannot be shown here — there is no chip to badge. That gap is closed by Phase 2 (activation prompt) and Phase 3 (overview). The three phases interlock: badge catches "₹0 agreed," prompt prevents "no contract," overview catches everything across sites.

---

## 7. Phase 2 — Prompt a contract at trade activation

**Where:** `src/components/site-settings/SiteTradeWorkspacesManager.tsx` — the **Workspace toggle** (`site_trade_settings.has_workspace`) is the owner's "activate the trade" step.

**Trigger:** flipping **Workspace ON** for a trade that has **no detailed contract** (`hasDetailedContract === false`).

**UI:** an inline prompt within that settings card (not a jarring modal):
```
Painting · Workspace turned ON ✓
⚠ No contract yet — workers can't be recorded against this trade until one exists.
  [ Create contract & set agreed amount ]   [ Later ]
```
- `[Create contract & set agreed amount]` opens the **existing `QuickCreateContractDialog`**, pre-scoped to this trade (category + detailed mode pre-filled). Owner types "Ashish" and the ₹1,00,000.
- Agreed amount stays **optional** in that dialog — skip it and the contract is still created (chip appears) and simply shows the **amber dot** until set. Daily-wage stays a valid one-step path, just never invisible.
- `[Later]` is allowed, but the trade (activated, no contract) keeps surfacing in the **Phase 3 overview** so it can't be silently forgotten.

**Reuse-only:** trigger is an existing toggle; action is the existing create dialog. The only new bits are the inline prompt and the "has detailed contract yet?" check (already in the shared hook).

---

## 8. Phase 3 — Manager cross-site overview

**Where:** a new **tab on `src/app/(main)/company/contracts/page.tsx`** (route `/company/contracts`), beside the existing company-level money views.

**Layout — attention-first** (problems float to the top):
```
Trade contracts — all sites                       [site ▾] [trade ▾]

── Needs attention ───────────────────────────────────────────
🔴 Padmavati · Electrical    activated · NO CONTRACT
🟠 Srinivasa · Painting      ₹0 agreed · ₹38,000 spent blind
🟠 Padmavati · Carpenter     Overpaid by ₹12,000

── Healthy ───────────────────────────────────────────────────
Srinivasa · Civil      ₹8,00,000 agreed · 62% paid · in step
Padmavati · Painting   ₹2,00,000 agreed · 20% paid · safe

Totals:  ₹X agreed   ₹Y spent   ₹Z remaining   ·  3 trades running blind
```

- Numbers come from the **same `useTradeContractSummary`** run across every accessible site (`v_subcontract_reconciliation` already spans sites — this is aggregation, not new queries).
- **Three flag tiers** from the §2 state machine: 🔴 no contract (state 2); 🟠 ₹0 agreed (state 3) or overpaid (state 4, negative remaining); ⚪ healthy (state 4).
- Tapping a row deep-links into that site's trade workspace.

**Scope:** this is the largest phase (a genuinely new screen, vs. Phases 1–2 which bolt onto existing screens) and the most deferrable — Phases 1–2 already stop the blindness per site; this is the bird's-eye consolidation.

---

## 9. Approaches considered

- **Approach 1 (chosen):** reuse the existing contract rollup; one shared hook feeds all surfaces. No schema changes, one source of truth, consistent with Civil.
- **Approach 2 (rejected):** store one agreed amount per trade on `site_trade_settings`, independent of contracts. Creates a **second source of truth** that can disagree with the contract/section numbers and sidesteps the trusted recursive rollup — the classic "numbers don't match" bug.
- **Approach 3 (partially adopted):** force a contract at activation. Too rigid (some trades are genuinely daily-wage); the **good part** — an activation prompt — is adopted as Phase 2, but kept **optional** ("Later" allowed).

---

## 10. Edge cases

- **₹0 agreed but money spent** — strip/overview must still show spent (the headline risk), not blank out.
- **Multiple detailed contracts in one trade** — strip follows the selected contract; chip/overview reflect the trade-level rollup (Σ).
- **Civil parent + sections** — attendance strip shows the in-house recording contract; full Civil rollup stays on `/site/trades`. Avoid double-counting parent + children (existing `workspaceModel` de-dup already handles this; the hook must reuse it, not re-sum naively).
- **Overpaid (negative remaining)** — show "Overpaid by ₹N" using existing verdict, both in strip and overview attention tier.
- **Trade activated then later given a contract** — state 2 → 3/4 transitions must reflect live (React Query invalidation on contract create / total_value edit).
- **Permissions** — overview respects the manager's accessible-sites scope; no cross-tenant leakage.
- **Loading/empty** — strip shows a skeleton (match `TradeChipFilter`'s skeleton); overview shows an empty state when a site has no trades.

---

## 11. Testing strategy

- **Unit (Vitest):** `useTradeContractSummary` / its pure derivation — the 4-state classification (`hasDetailedContract`, `hasAgreedAmount`), Σ agreed/spent, verdict mapping, Civil de-dup. Table-driven over the four states.
- **Component:** money strip renders state 3 vs state 4 correctly (spent shown when ₹0 agreed; `[Set agreed ₹]` opens the edit dialog). `TradeChipFilter` shows the amber dot only when `hasAgreedAmount === false` (extend existing `TradeChipFilter.*.test.tsx`).
- **Component:** activation prompt appears only when Workspace flips ON **and** `hasDetailedContract === false`; opens the create dialog pre-scoped.
- **Overview:** attention-first ordering puts 🔴/🟠 before ⚪; totals sum correctly; deep-link targets the right site/trade.

---

## 12. Files in scope (grounding)

**Reused / read:**
- `src/types/trade.types.ts` — `TradeContract.totalValue`, `TradeCategory.hasWorkspace`
- `src/hooks/queries/useTrades.ts` — `useSiteTrades`, `groupContractsByTrade`
- `src/hooks/queries/useTradeReconciliations.ts` — `ContractReconciliation` (`v_subcontract_reconciliation`)
- `src/hooks/queries/useSiteTradeSettings.ts` — `has_workspace` overrides
- `src/lib/workforce/exposure.ts` — `rollupTasks`, verdict thresholds
- `src/lib/workforce/workspaceModel.ts` — de-duped recursive rollup
- `src/lib/trades/visibleTradeWorkspaces.ts` — chip-gating rule (`isTrackedContract`)
- `src/theme/tradeColors.ts` — `getTradeColor`
- `src/components/workforce/{TaskDetailPane,GroupDetailPane,SiteSummaryTiles}.tsx` — `RemainingStrip` / `StatCard`
- `src/components/trades/QuickCreateContractDialog.tsx`, `src/components/workforce/EditContractDialog.tsx`

**New / edited:**
- New: `src/hooks/queries/useTradeContractSummary.ts` (foundation)
- New: money-strip component (Phase 1a) + wire into `src/app/(main)/site/attendance/attendance-content.tsx`
- Edit: `src/components/attendance/TradeChipFilter.tsx` (amber dot)
- Edit: `src/components/site-settings/SiteTradeWorkspacesManager.tsx` (activation prompt)
- New: overview tab + wire into `/company/contracts` page (Phase 3)

---

## 13. Phasing & shippability

- **Phase 1 (1a + 1b):** shared hook + attendance money strip + chip amber dot. Kills "marking attendance blind" per site. Read + reuse only.
- **Phase 2:** activation prompt. Prevents the "activated, no contract" gap at the source.
- **Phase 3:** cross-site manager overview. Bird's-eye consolidation; most deferrable.

Each phase is independently shippable; Phase 1 alone solves the core complaint.
