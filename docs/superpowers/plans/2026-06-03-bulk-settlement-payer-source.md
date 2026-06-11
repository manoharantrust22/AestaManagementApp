# Payer Source on Advance / Bulk Settlements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin/office pick (and optionally split) a payment source when recording an advance / "Complete Bulk Settlement" vendor payment, and persist it on the materialized `material_purchase_expenses` row.

**Architecture:** Approach A (unified, no migration). A new pure helper builds the expense row + line-items + payer-source columns. `useRecordAdvancePayment` calls it for **both** the admin/direct and engineer-wallet paths, creating the expense row early; the delivery flow's existing "skip if a row already exists for this PO" guard prevents duplicates. The dialog stops hiding `PayerSourceSplitInput` on advance flows for non-engineers.

**Tech Stack:** Next.js 15, React Query (TanStack), Supabase JS client, MUI v7, Vitest. Spec: [docs/superpowers/specs/2026-06-03-bulk-settlement-payer-source-design.md](../specs/2026-06-03-bulk-settlement-payer-source-design.md).

**Key existing facts (verified):**
- `material_purchase_expenses` already has `settlement_payer_source`, `settlement_payer_name`, `payer_source_split`. **No migration.**
- Delivery hooks skip expense + item creation when a row already exists for `purchase_order_id` (`usePurchaseOrders.ts` ~L2270 and ~L2888).
- `toRpcArgs` / `validatePayerSourceInput` live in `src/lib/settlement/payerSource.ts`.
- Expense line-items table is `material_purchase_expense_items` with FK column `purchase_expense_id`.

---

### Task 1: Pure helper — build the advance expense payload

**Files:**
- Create: `src/lib/materials/advanceExpensePayload.ts`
- Test: `src/lib/materials/advanceExpensePayload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/materials/advanceExpensePayload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAdvanceExpensePayload, parsePoNotes } from "./advanceExpensePayload";

const groupPo = {
  id: "po-1",
  site_id: "site-A",
  po_number: "PO-001",
  vendor_id: "v-1",
  vendor: { name: "Vairam" },
  total_amount: 6900,
  transport_cost: 0,
  items: [{ material_id: "m-1", brand_id: null, quantity: 1000, unit_price: 6.9 }],
  internal_notes: JSON.stringify({
    is_group_stock: true,
    site_group_id: "g-1",
    payment_source_site_id: "site-A",
  }),
};

describe("parsePoNotes", () => {
  it("parses a JSON string", () => {
    expect(parsePoNotes('{"is_group_stock":true}')).toEqual({ is_group_stock: true });
  });
  it("passes through an object and tolerates junk", () => {
    expect(parsePoNotes({ is_group_stock: false })).toEqual({ is_group_stock: false });
    expect(parsePoNotes("not json")).toBeNull();
    expect(parsePoNotes(null)).toBeNull();
  });
});

describe("buildAdvanceExpensePayload", () => {
  it("writes a single payer source and marks a group-stock bulk payment paid", () => {
    const { expenseRow, expenseItems, isGroupStock } = buildAdvanceExpensePayload(
      groupPo,
      {
        amount_paid: 6900,
        payment_date: "2026-06-03",
        payment_mode: "upi",
        payer_source: "client_money",
        payer_name: null,
        payer_source_split: null,
        is_complete: true,
        payment_channel: "direct",
      },
      "MPE-TEST",
      "auth-1",
    );
    expect(isGroupStock).toBe(true);
    expect(expenseRow.purchase_type).toBe("group_stock");
    expect(expenseRow.settlement_payer_source).toBe("client_money");
    expect(expenseRow.settlement_payer_name).toBeNull();
    expect(expenseRow.payer_source_split).toBeNull();
    expect(expenseRow.is_paid).toBe(true);
    expect(expenseRow.paid_date).toBe("2026-06-03");
    expect(expenseRow.payment_channel).toBe("direct");
    expect(expenseRow.site_group_id).toBe("g-1");
    expect(expenseRow.paying_site_id).toBe("site-A");
    expect(expenseRow.created_by).toBe("auth-1");
    expect(expenseItems).toHaveLength(1);
    expect(expenseItems[0]).toMatchObject({ material_id: "m-1", brand_id: null, quantity: 1000, unit_price: 6.9 });
  });

  it("writes a split payload and leaves an own-site partial advance unpaid", () => {
    const ownPo = { ...groupPo, internal_notes: null, total_amount: 10000 };
    const split = [
      { source: "own_money", amount: 4000 },
      { source: "client_money", amount: 2000 },
    ];
    const { expenseRow, isGroupStock } = buildAdvanceExpensePayload(
      ownPo,
      {
        amount_paid: 6000,
        payment_date: "2026-06-03",
        payer_source: "split",
        payer_name: null,
        payer_source_split: split,
        is_complete: false,
        payment_channel: "direct",
      },
      "MPE-2",
      null,
    );
    expect(isGroupStock).toBe(false);
    expect(expenseRow.purchase_type).toBe("own_site");
    expect(expenseRow.settlement_payer_source).toBe("split");
    expect(expenseRow.payer_source_split).toEqual(split);
    expect(expenseRow.is_paid).toBe(false);
    expect(expenseRow.paid_date).toBeNull();
    expect(expenseRow.site_group_id).toBeNull();
    expect(expenseRow.paying_site_id).toBeNull();
    expect(expenseRow.created_by).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/materials/advanceExpensePayload.test.ts`
Expected: FAIL — `Failed to resolve import "./advanceExpensePayload"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/materials/advanceExpensePayload.ts`:

```ts
import type { PayerSourceSplitRow } from "@/types/settlement.types";

/** Subset of a purchase_orders row needed to materialize an expense at advance time. */
export interface AdvancePoForExpense {
  id: string;
  site_id: string;
  po_number?: string | null;
  vendor_id?: string | null;
  vendor?: { name?: string | null } | null;
  total_amount?: number | null;
  transport_cost?: number | null;
  items?: Array<{
    material_id: string;
    brand_id?: string | null;
    quantity: number;
    unit_price: number;
  }> | null;
  internal_notes?: unknown;
}

/** Payment + payer inputs. Payer fields are already normalized via toRpcArgs(). */
export interface AdvancePaymentArgs {
  amount_paid: number;
  payment_date: string;
  payment_mode?: string;
  payment_reference?: string;
  payment_screenshot_url?: string;
  notes?: string;
  payer_source?: string;
  payer_name?: string | null;
  payer_source_split?: PayerSourceSplitRow[] | null;
  /** True when the dialog knows this is a full bulk settlement (isGroupStockAdvancePO). */
  is_complete?: boolean;
  payment_channel: "direct" | "engineer_wallet";
  /** Explicit group-stock paying-site override (from dialog / PO notes). */
  paying_site_id?: string | null;
  /** Explicit site group id override (from dialog / PO notes). */
  site_group_id?: string | null;
}

export interface BuiltAdvanceExpense {
  expenseRow: Record<string, unknown>;
  /** Items WITHOUT purchase_expense_id — caller stamps it after the row insert. */
  expenseItems: Array<{
    material_id: string;
    brand_id: string | null;
    quantity: number;
    unit_price: number;
  }>;
  isGroupStock: boolean;
}

export function parsePoNotes(internalNotes: unknown): {
  is_group_stock?: boolean;
  site_group_id?: string;
  group_id?: string;
  payment_source_site_id?: string;
} | null {
  if (!internalNotes) return null;
  try {
    return typeof internalNotes === "string"
      ? JSON.parse(internalNotes)
      : (internalNotes as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Build the material_purchase_expenses row (+ line items) for an advance / bulk
 * settlement. Mirrors the delivery-flow expense shape so the delivery skip-guard
 * treats the early row as authoritative. Pure — no I/O — so it is unit-testable.
 */
export function buildAdvanceExpensePayload(
  po: AdvancePoForExpense,
  args: AdvancePaymentArgs,
  refCode: string,
  createdByAuthId: string | null,
): BuiltAdvanceExpense {
  const notes = parsePoNotes(po.internal_notes);
  const isGroupStock = notes?.is_group_stock === true;
  const siteGroupId = args.site_group_id ?? notes?.site_group_id ?? notes?.group_id ?? null;
  const totalAmount = Number(po.total_amount ?? args.amount_paid);
  const totalQty = (po.items ?? []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  const isFullyPaid = !!args.is_complete || args.amount_paid >= totalAmount;
  const payingSiteId = isGroupStock
    ? (args.paying_site_id ?? notes?.payment_source_site_id ?? po.site_id)
    : null;

  const expenseRow: Record<string, unknown> = {
    site_id: po.site_id,
    ref_code: refCode,
    purchase_type: isGroupStock ? "group_stock" : "own_site",
    purchase_order_id: po.id,
    vendor_id: po.vendor_id ?? null,
    vendor_name: po.vendor?.name ?? null,
    purchase_date: args.payment_date,
    total_amount: totalAmount,
    transport_cost: po.transport_cost ?? 0,
    status: "recorded",
    is_paid: isFullyPaid,
    paid_date: isFullyPaid ? args.payment_date : null,
    payment_mode: args.payment_mode ?? "cash",
    payment_reference: args.payment_reference ?? null,
    payment_screenshot_url: args.payment_screenshot_url ?? null,
    amount_paid: args.amount_paid,
    notes: args.notes ?? `Advance payment for PO ${po.po_number ?? po.id}`,
    paying_site_id: payingSiteId,
    site_group_id: isGroupStock ? siteGroupId : null,
    original_qty: isGroupStock ? totalQty || null : null,
    remaining_qty: isGroupStock ? totalQty || null : null,
    payment_channel: args.payment_channel,
    settlement_payer_source: args.payer_source ?? null,
    settlement_payer_name: args.payer_name ?? null,
    payer_source_split: args.payer_source_split ?? null,
    created_by: createdByAuthId,
  };

  const expenseItems = (po.items ?? []).map((it) => ({
    material_id: it.material_id,
    brand_id: it.brand_id ?? null,
    quantity: it.quantity,
    unit_price: it.unit_price,
  }));

  return { expenseRow, expenseItems, isGroupStock };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/materials/advanceExpensePayload.test.ts`
Expected: PASS — 4 tests pass (2 `parsePoNotes`, 2 `buildAdvanceExpensePayload`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/materials/advanceExpensePayload.ts src/lib/materials/advanceExpensePayload.test.ts
git commit -m "feat(materials): pure helper to build advance/bulk expense payload with payer source"
```

---

### Task 2: Wire the helper into `useRecordAdvancePayment`

**Files:**
- Modify: `src/hooks/queries/usePurchaseOrders.ts` (imports near top; `useRecordAdvancePayment` ~L1725–L1891)

This unifies expense creation across the admin/direct and engineer-wallet paths, writes the payer-source columns, creates line items (fixes the latent missing-items gap), is idempotent against an existing row, and only deletes the row on wallet failure when this call inserted it.

- [ ] **Step 1: Add imports**

At the top of `src/hooks/queries/usePurchaseOrders.ts`, after the existing `recordSpend` import (line 6), add:

```ts
import { buildAdvanceExpensePayload } from "@/lib/materials/advanceExpensePayload";
import type { PayerSource, PayerSourceSplitRow } from "@/types/settlement.types";
```

- [ ] **Step 2: Extend the mutation input type**

In `useRecordAdvancePayment`, add these fields to the `mutationFn: async (data: { ... })` parameter type (after `paying_site_id?: string;`):

```ts
      // Payer source (already normalized by the dialog via toRpcArgs)
      payer_source?: PayerSource | "split";
      payer_name?: string;
      payer_source_split?: PayerSourceSplitRow[] | null;
      /** True for a full bulk settlement (isGroupStockAdvancePO) — forces is_paid. */
      is_complete?: boolean;
```

- [ ] **Step 3: Replace the mutationFn body**

Replace the entire body of `mutationFn` (from `await ensureFreshSession();` down to and including the `return { po_id: data.po_id, site_id: data.site_id, walletDebited };` line) with:

```ts
      await ensureFreshSession();

      const isWalletPath = !!(
        data.engineer_id &&
        data.wallet_site_id &&
        data.recorded_by_user_id &&
        data.recorded_by_name
      );

      // Fetch PO details needed to materialize the expense row.
      const { data: po } = await supabase
        .from("purchase_orders")
        .select(`
          id, po_number, site_id, vendor_id, total_amount, transport_cost, internal_notes,
          vendor:vendors(id, name),
          items:purchase_order_items(id, material_id, brand_id, quantity, unit_price)
        `)
        .eq("id", data.po_id)
        .single();

      // Current auth user → created_by (references auth.users(id)).
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id ?? null;

      // Idempotency: reuse an existing expense row for this PO if one exists.
      const { data: existingExpense } = await supabase
        .from("material_purchase_expenses")
        .select("id")
        .eq("purchase_order_id", data.po_id)
        .maybeSingle();

      let expenseId: string | null = existingExpense?.id ?? null;
      const insertedThisCall = !existingExpense;
      let walletDebited = false;

      if (po) {
        const { data: refCode } = await supabase.rpc("generate_material_purchase_reference");
        const built = buildAdvanceExpensePayload(
          po,
          {
            amount_paid: data.amount_paid,
            payment_date: data.payment_date,
            payment_mode: data.payment_mode,
            payment_reference: data.payment_reference,
            payment_screenshot_url: data.payment_screenshot_url,
            notes: data.notes,
            payer_source: data.payer_source,
            payer_name: data.payer_name ?? null,
            payer_source_split: data.payer_source_split ?? null,
            is_complete: data.is_complete,
            payment_channel: isWalletPath ? "engineer_wallet" : "direct",
            paying_site_id: data.paying_site_id ?? null,
            site_group_id: data.site_group_id ?? null,
          },
          refCode || `MAT-${Date.now()}`,
          authUserId,
        );

        if (expenseId) {
          // Idempotent update: refresh paid + payer fields on the existing row.
          const { error: updErr } = await supabase
            .from("material_purchase_expenses")
            .update({
              is_paid: built.expenseRow.is_paid,
              paid_date: built.expenseRow.paid_date,
              payment_mode: built.expenseRow.payment_mode,
              payment_reference: built.expenseRow.payment_reference,
              payment_screenshot_url: built.expenseRow.payment_screenshot_url,
              amount_paid: built.expenseRow.amount_paid,
              settlement_payer_source: built.expenseRow.settlement_payer_source,
              settlement_payer_name: built.expenseRow.settlement_payer_name,
              payer_source_split: built.expenseRow.payer_source_split,
              payment_channel: built.expenseRow.payment_channel,
              updated_at: new Date().toISOString(),
            })
            .eq("id", expenseId);
          if (updErr) throw updErr;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("material_purchase_expenses")
            .insert(built.expenseRow)
            .select("id")
            .single();
          if (insErr) throw insErr;
          expenseId = inserted?.id ?? null;

          // Create line items so landed cost / material detail are complete.
          if (expenseId && built.expenseItems.length > 0) {
            const itemsPayload = built.expenseItems.map((it) => ({
              purchase_expense_id: expenseId,
              ...it,
            }));
            const { error: itemsErr } = await supabase
              .from("material_purchase_expense_items")
              .insert(itemsPayload);
            if (itemsErr) {
              console.warn("[useRecordAdvancePayment] Failed to create expense items:", itemsErr);
            }
          }
        }
      }

      // Engineer-wallet path: debit the wallet and link the spend.
      if (isWalletPath && expenseId) {
        try {
          const spend = await recordSpend(supabase, {
            engineer_id: data.engineer_id!,
            site_id: data.wallet_site_id!,
            amount: data.amount_paid,
            transaction_date: data.payment_date,
            payment_mode: "cash",
            proof_url: data.payment_screenshot_url || null,
            notes: data.notes || null,
            recorded_by: data.recorded_by_name!,
            recorded_by_user_id: data.recorded_by_user_id!,
            description: `Group stock advance payment`,
          });

          if (spend?.id) {
            await supabase
              .from("material_purchase_expenses")
              .update({ engineer_transaction_id: spend.id })
              .eq("id", expenseId);
          }
          walletDebited = true;
        } catch (walletErr) {
          // Roll back ONLY a row this call inserted — never delete a pre-existing one.
          if (insertedThisCall && expenseId) {
            await supabase.from("material_purchase_expenses").delete().eq("id", expenseId);
          }
          throw walletErr;
        }
      }

      // Record advance_paid on the PO.
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          advance_paid: data.amount_paid,
          payment_terms: data.notes
            ? `${data.payment_mode || "Advance"} payment on ${data.payment_date}. ${data.notes}`
            : `${data.payment_mode || "Advance"} payment on ${data.payment_date}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.po_id);

      if (error) throw error;
      return { po_id: data.po_id, site_id: data.site_id, walletDebited };
```

- [ ] **Step 4: Add the expenses cache invalidation**

In the same hook's `onSuccess`, after the existing `queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.bySite(result.site_id) });` line, add:

```ts
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors (no new errors introduced in `usePurchaseOrders.ts`). If pre-existing unrelated errors appear, confirm they are not in the files touched by this task.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/queries/usePurchaseOrders.ts
git commit -m "feat(materials): persist payer source + items on advance/bulk settlements"
```

---

### Task 3: Show the payer-source picker in the dialog on advance flows

**Files:**
- Modify: `src/components/materials/MaterialSettlementDialog.tsx` (advance branch ~L222–L254; payer block ~L757–L780; submit-disabled ~L838–L852)

- [ ] **Step 1: Validate + pass payer args in the advance branch**

In `handleSubmit`, inside `if (isPOAdvancePayment && purchaseOrder) {`, replace the existing `try { setError(""); await advancePaymentMutation.mutateAsync({ ... }); ... }` block with:

```tsx
    if (isPOAdvancePayment && purchaseOrder) {
      // Validate + normalize payer source. Engineers pass their auto LIFO single
      // source; admin/office pass whatever they picked (single or split).
      const advancePayerCheck = validatePayerSourceInput(payer, finalAmountPaid);
      if (!advancePayerCheck.ok) {
        setError(advancePayerCheck.reason);
        return;
      }
      const advancePayerRpc = toRpcArgs(payer);

      try {
        setError("");

        await advancePaymentMutation.mutateAsync({
          po_id: purchaseOrder.id,
          site_id: purchaseOrder.site_id,
          amount_paid: finalAmountPaid,
          payment_date: settlementDate,
          payment_mode: paymentMode,
          payment_reference: paymentReference || undefined,
          payment_screenshot_url: screenshot?.url || undefined,
          notes: notes || undefined,
          payer_source: advancePayerRpc.p_payer_source as PayerSource | "split",
          payer_name: advancePayerRpc.p_payer_name || undefined,
          payer_source_split: advancePayerRpc.p_payer_source_split,
          is_complete: isGroupStockAdvancePO,
          // Pass wallet fields for group_stock POs settled by site engineer
          ...(isSiteEngineer && isGroupStockAdvancePO && engineerId && effectiveWalletSiteId ? {
            engineer_id: engineerId,
            wallet_site_id: effectiveWalletSiteId,
            recorded_by_user_id: engineerId,
            recorded_by_name: userProfile?.name || user?.email || "Unknown",
            site_group_id: (purchaseOrder as any).site_group_id || poNotes?.site_group_id || null,
            paying_site_id: poNotes?.payment_source_site_id || effectiveWalletSiteId,
          } : {}),
        });

        onSuccess?.();
        onClose();
      } catch (err) {
        console.error("Advance payment recording failed:", err);
        setError("Failed to record advance payment. Please try again.");
      }
      return;
    }
```

(Note: `validatePayerSourceInput` and `toRpcArgs` are already imported at the top of this file; `PayerSource` is already imported.)

- [ ] **Step 2: Unhide the payer-source block for non-engineers on advance flows**

Change the gate on the payer-source block. Replace:

```tsx
        {!isPOAdvancePayment && !isSiteEngineer && (
          <Box sx={{ mb: 2 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={Number(amountPaid) || purchaseAmount}
              siteId={purchase?.site_id ?? selectedSite?.id}
              disabled={settleMutation.isPending}
            />
```

with:

```tsx
        {!isSiteEngineer && (
          <Box sx={{ mb: 2 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={Number(amountPaid) || purchaseAmount}
              siteId={purchase?.site_id ?? purchaseOrder?.site_id ?? selectedSite?.id}
              disabled={settleMutation.isPending || advancePaymentMutation.isPending}
            />
```

(Only the `{!isPOAdvancePayment && !isSiteEngineer && (` opening line, the `siteId={...}` line, and the `disabled={...}` line change — leave the inline validation `{(() => { ... })()}` block and closing tags below it unchanged.)

- [ ] **Step 3: Block submit on an invalid split for advance flows too**

In the `<Button ... disabled={...}>` (Confirm) props, replace the split-validity clause:

```tsx
            (!isPOAdvancePayment &&
              !isSiteEngineer &&
              payer.mode === "split" &&
              !validatePayerSourceInput(
                payer,
                Number(amountPaid) || purchaseAmount,
              ).ok)
```

with:

```tsx
            (!isSiteEngineer &&
              payer.mode === "split" &&
              !validatePayerSourceInput(
                payer,
                Number(amountPaid) || purchaseAmount,
              ).ok)
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: PASS — no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/materials/MaterialSettlementDialog.tsx
git commit -m "feat(materials): show payer-source picker on advance/bulk settlement dialog"
```

---

### Task 4: Production build + manual Playwright verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 2: Start dev server (if not already running)**

Run (background): `npm run dev:cloud`
Expected: serves on `http://localhost:3000`.

- [ ] **Step 3: Auto-login**

Via Playwright MCP: navigate to `http://localhost:3000/dev-login`. Wait for redirect to the app (authenticated).

- [ ] **Step 4: Open the bulk settlement dialog**

Navigate to `http://localhost:3000/site/materials/hub`. Find a Group-stock thread with an unpaid bulk vendor payment ("Settle vendor"). Click it to open "Complete Bulk Settlement".
Expected: the **Payment Source** picker (`PayerSourceSplitInput`) now renders for the admin/office user, with the per-site source chips.

- [ ] **Step 5: Submit a split settlement**

Pick a split (e.g. Own + Client summing to the amount), confirm. Take a screenshot.
Expected: dialog closes, no error.

- [ ] **Step 6: Verify persistence (read-only Supabase MCP)**

Query production read-only to confirm the row carries the source + items:

```sql
select mpe.id, mpe.ref_code, mpe.purchase_type, mpe.is_paid,
       mpe.settlement_payer_source, mpe.payer_source_split,
       (select count(*) from material_purchase_expense_items i
          where i.purchase_expense_id = mpe.id) as item_count
from material_purchase_expenses mpe
where mpe.purchase_order_id = '<the PO id just settled>';
```

Expected: one row, `settlement_payer_source = 'split'` with a populated `payer_source_split`, `item_count > 0`.

- [ ] **Step 7: Verify it surfaces in expenses + check console**

Navigate to `http://localhost:3000/site/expenses`, locate the entry, confirm the payer-source chip renders. Read console logs via Playwright; confirm zero errors/warnings introduced by this change. Take a final screenshot. Close the browser.

- [ ] **Step 8: Repeat for a plain (non-group) advance**

Open "Record Advance Payment" for a non-group PO, confirm the picker shows, record a partial advance with a single source.
Expected: an `own_site` `material_purchase_expenses` row is created with `is_paid = false`, `settlement_payer_source` set, and line items present; no console errors.

---

## Notes for the executor

- **No migration** — do not create one; the columns already exist.
- This is **not** a "move to prod" yet. After Task 4 passes, report results and let the user decide when to ship. (Several earlier local-only material commits are already unshipped per memory; shipping will be a deliberate "move to prod".)
- If `npm run build` flags a pre-existing unrelated error, surface it rather than silently working around it.
- Keep edits minimal and within the listed files; do not touch the delivery hooks (their skip-guard is what makes this safe).
