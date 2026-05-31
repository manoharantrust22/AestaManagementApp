# Wallet Spend Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every spend (and return) row in the engineer-wallet activity feed tappable, opening a read-only "Spend details" dialog that shows the row's data + payment-proof image, and — for misc expenses — the linked vendor bill, vendor, category and description.

**Architecture:** A new `SpendDetailDialog` classifies the tapped row from its `description`. For misc rows it fetches the linked `misc_expenses` record (by `engineer_transaction_id`) via a new React Query hook; for all rows it reuses the existing fullscreen `PhotoLightbox` for image viewing. Pure logic (classification, reference parsing, row→view mapping, photo-list building, payer prettifying) lives in a tested helper module. `WalletLedgerList` gains an `onSpendClick` prop so spend/return rows become clickable without changing the existing deposit-edit path; both wallet pages wire the dialog.

**Tech Stack:** Next.js 15, MUI v7, React Query (TanStack v5), Supabase JS, Vitest. Frontend-only — no DB/schema change.

**Spec:** `docs/superpowers/specs/2026-05-31-wallet-spend-verification-design.md`

---

## File Structure

- **Create** `src/components/wallet-v2/spendDetailHelpers.ts` — pure helpers + the `MiscExpenseVerification` type. No React. Imported by the hook and the dialog.
- **Create** `src/components/wallet-v2/spendDetailHelpers.test.ts` — Vitest unit tests for every helper.
- **Create** `src/hooks/queries/useMiscExpenseForTransaction.ts` — React Query hook fetching the linked `misc_expenses` row.
- **Create** `src/components/wallet-v2/SpendDetailDialog.tsx` — the read-only detail dialog.
- **Modify** `src/components/wallet-v2/WalletLedgerList.tsx` — add `onSpendClick`; make spend/return clickable; import `prettyPayerSource` from the new helper (remove the local copy).
- **Modify** `src/app/(main)/company/engineer-wallet/page.tsx` — `detailRow` state, pass `onViewSpend` into both sub-panels, render the dialog.
- **Modify** `src/app/(main)/site/my-wallet/page.tsx` — `detailRow` state, pass `onSpendClick`, render the dialog.

Dependency direction (no cycles): `spendDetailHelpers.ts` (types only) ← `useMiscExpenseForTransaction.ts` ← `SpendDetailDialog.tsx` ← pages. `WalletLedgerList.tsx` also imports `prettyPayerSource` from the helper.

---

## Task 1: Pure helpers + tests

**Files:**
- Create: `src/components/wallet-v2/spendDetailHelpers.ts`
- Test: `src/components/wallet-v2/spendDetailHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/wallet-v2/spendDetailHelpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import {
  classifySpend,
  parseMiscReference,
  mapMiscExpenseRow,
  buildSpendPhotos,
  prettyPayerSource,
} from "./spendDetailHelpers";

describe("classifySpend", () => {
  it("classifies misc expenses", () => {
    expect(classifySpend("Misc expense MISC-260530-003 - Pudukai Building Materials")).toBe("misc");
  });
  it("classifies contract payments before salary (both carry SET-)", () => {
    expect(classifySpend("Contract payment for Chithranjith (SET-260525-001)")).toBe("contract");
  });
  it("classifies salary settlements", () => {
    expect(classifySpend("Salary settlement SET-260528-003")).toBe("salary");
  });
  it("falls back to other for material/rental/empty", () => {
    expect(classifySpend("Group stock advance payment")).toBe("other");
    expect(classifySpend(null)).toBe("other");
    expect(classifySpend(undefined)).toBe("other");
  });
});

describe("parseMiscReference", () => {
  it("extracts the MISC reference", () => {
    expect(parseMiscReference("Misc expense MISC-260530-003 - Vendor")).toBe("MISC-260530-003");
  });
  it("extracts a UUID-suffixed fallback reference", () => {
    expect(parseMiscReference("Misc expense MISC-260530-AB12CD34")).toBe("MISC-260530-AB12CD34");
  });
  it("returns null when there is no MISC reference", () => {
    expect(parseMiscReference("Salary settlement SET-260528-003")).toBeNull();
    expect(parseMiscReference(null)).toBeNull();
  });
});

describe("mapMiscExpenseRow", () => {
  it("flattens the joined category and passes fields through", () => {
    const raw = {
      bill_url: "https://x/bill.jpg",
      vendor_name: "Pudukai",
      description: "Plastering",
      notes: "urgent",
      amount: 150,
      payer_source: "site_cash",
      payer_name: null,
      expense_categories: { name: "Hardware" },
    };
    expect(mapMiscExpenseRow(raw)).toEqual({
      bill_url: "https://x/bill.jpg",
      vendor_name: "Pudukai",
      description: "Plastering",
      notes: "urgent",
      amount: 150,
      payer_source: "site_cash",
      payer_name: null,
      category_name: "Hardware",
    });
  });
  it("nulls missing fields and a missing category join", () => {
    expect(mapMiscExpenseRow({})).toEqual({
      bill_url: null,
      vendor_name: null,
      description: null,
      notes: null,
      amount: null,
      payer_source: null,
      payer_name: null,
      category_name: null,
    });
  });
});

describe("buildSpendPhotos", () => {
  const row = { proof_url: "https://x/proof.jpg", transaction_date: "2026-05-30" } as WalletLedgerEntry;
  it("lists the vendor bill first, then the payment proof", () => {
    const photos = buildSpendPhotos(row, { bill_url: "https://x/bill.jpg" } as any);
    expect(photos.map((p) => p.id)).toEqual(["bill", "proof"]);
    expect(photos[0].description).toBe("Vendor bill");
    expect(photos[1].url).toBe("https://x/proof.jpg");
  });
  it("returns only the proof when there is no bill", () => {
    const photos = buildSpendPhotos(row, null);
    expect(photos.map((p) => p.id)).toEqual(["proof"]);
  });
  it("returns an empty array when nothing is attached", () => {
    const photos = buildSpendPhotos({ proof_url: null, transaction_date: "2026-05-30" } as WalletLedgerEntry, null);
    expect(photos).toEqual([]);
  });
});

describe("prettyPayerSource", () => {
  it("maps known keys", () => {
    expect(prettyPayerSource("client_money", null)).toBe("Client Money");
  });
  it("uses the custom name for other_site/custom", () => {
    expect(prettyPayerSource("custom", "Friend")).toBe("Friend");
  });
  it("falls back to the raw key when unknown", () => {
    expect(prettyPayerSource("site_cash", null)).toBe("site_cash");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/wallet-v2/spendDetailHelpers.test.ts`
Expected: FAIL — cannot resolve `./spendDetailHelpers` (module not found).

- [ ] **Step 3: Write the helper module**

Create `src/components/wallet-v2/spendDetailHelpers.ts`:

```ts
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import type { WorkPhoto } from "@/types/work-updates.types";

export type SpendKind = "misc" | "salary" | "contract" | "other";

/**
 * Classify a wallet spend/return row from its description. Order matters:
 * contract-payment descriptions also contain a SET- reference, so they must be
 * matched before the generic salary branch.
 */
export function classifySpend(description: string | null | undefined): SpendKind {
  if (!description) return "other";
  if (/MISC-\d{6}/.test(description)) return "misc";
  if (/^Contract payment/i.test(description)) return "contract";
  if (/Salary settlement|SET-\d{6}/.test(description)) return "salary";
  return "other";
}

/** Extract the human-readable MISC reference for display (data fetch uses the id). */
export function parseMiscReference(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = description.match(/MISC-\d{6}-[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

/** The misc_expenses fields we surface for verification. */
export interface MiscExpenseVerification {
  bill_url: string | null;
  vendor_name: string | null;
  description: string | null;
  notes: string | null;
  amount: number | null;
  payer_source: string | null;
  payer_name: string | null;
  category_name: string | null;
}

/** Map a raw misc_expenses row (with joined expense_categories) to the view shape. */
export function mapMiscExpenseRow(raw: any): MiscExpenseVerification {
  return {
    bill_url: raw?.bill_url ?? null,
    vendor_name: raw?.vendor_name ?? null,
    description: raw?.description ?? null,
    notes: raw?.notes ?? null,
    amount: raw?.amount ?? null,
    payer_source: raw?.payer_source ?? null,
    payer_name: raw?.payer_name ?? null,
    category_name: raw?.expense_categories?.name ?? null,
  };
}

/**
 * Build the lightbox photo list: vendor bill first (misc only), then the
 * payment proof from the wallet row itself. `uploadedAt` is required by
 * WorkPhoto but unused by PhotoLightbox; the transaction date is a safe value.
 */
export function buildSpendPhotos(
  row: Pick<WalletLedgerEntry, "proof_url" | "transaction_date">,
  misc: Pick<MiscExpenseVerification, "bill_url"> | null
): WorkPhoto[] {
  const photos: WorkPhoto[] = [];
  if (misc?.bill_url) {
    photos.push({ id: "bill", url: misc.bill_url, description: "Vendor bill", uploadedAt: row.transaction_date });
  }
  if (row.proof_url) {
    photos.push({ id: "proof", url: row.proof_url, description: "Payment proof", uploadedAt: row.transaction_date });
  }
  return photos;
}

/**
 * Friendly label for a payer-source key. Mirrors the map previously inlined in
 * WalletLedgerList (now the single source of truth, imported by both).
 */
export function prettyPayerSource(key: string, name: string | null): string {
  const map: Record<string, string> = {
    own_money: "Own Money",
    amma_money: "Amma Money",
    mothers_money: "Amma Money",
    client_money: "Client Money",
    trust_account: "Trust Account",
    other_site_money: name ?? "Other Site",
    custom: name ?? "Other",
  };
  return map[key] ?? key;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/wallet-v2/spendDetailHelpers.test.ts`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/components/wallet-v2/spendDetailHelpers.ts src/components/wallet-v2/spendDetailHelpers.test.ts
git commit -m "feat(wallet): spend-detail classification + view helpers"
```

---

## Task 2: Misc-expense fetch hook

**Files:**
- Create: `src/hooks/queries/useMiscExpenseForTransaction.ts`

There is no separate unit test for this hook: it is a thin React Query wrapper over a single Supabase select, and the pure transform it relies on (`mapMiscExpenseRow`) is already tested in Task 1. Integration is covered by the manual Playwright pass in Task 6 (matches the codebase convention for thin query hooks).

- [ ] **Step 1: Write the hook**

Create `src/hooks/queries/useMiscExpenseForTransaction.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import {
  mapMiscExpenseRow,
  type MiscExpenseVerification,
} from "@/components/wallet-v2/spendDetailHelpers";

/**
 * Fetch the misc_expenses row linked to a wallet spend transaction, for the
 * Spend details verification dialog. Linked by engineer_transaction_id (the
 * robust link — not by parsing the description). Returns null when no live
 * misc_expenses row points at this transaction (legacy / cancelled spends).
 */
export function useMiscExpenseForTransaction(
  transactionId: string | null,
  enabled: boolean
) {
  const supabase = createClient();
  const isEnabled = enabled && !!transactionId;
  return useQuery<MiscExpenseVerification | null>({
    queryKey: ["misc-expense-by-transaction", transactionId],
    enabled: isEnabled,
    staleTime: 60_000,
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await (supabase
          .from("misc_expenses") as any)
          .select(
            "bill_url, vendor_name, description, notes, amount, payer_source, payer_name, expense_categories(name)"
          )
          .eq("engineer_transaction_id", transactionId)
          .maybeSingle();
        if (error) throw error;
        return data ? mapMiscExpenseRow(data) : null;
      },
      { operationName: "useMiscExpenseForTransaction" }
    ),
  });
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit`
Expected: No NEW errors referencing `useMiscExpenseForTransaction.ts` or `spendDetailHelpers.ts`. (Pre-existing errors in unrelated `*.test.tsx` files may remain — ignore those.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/queries/useMiscExpenseForTransaction.ts
git commit -m "feat(wallet): hook to fetch misc-expense detail by transaction id"
```

---

## Task 3: SpendDetailDialog component

**Files:**
- Create: `src/components/wallet-v2/SpendDetailDialog.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/wallet-v2/SpendDetailDialog.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { Close, ReceiptLong } from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import type { WorkPhoto } from "@/types/work-updates.types";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import { useMiscExpenseForTransaction } from "@/hooks/queries/useMiscExpenseForTransaction";
import {
  classifySpend,
  parseMiscReference,
  buildSpendPhotos,
  prettyPayerSource,
} from "./spendDetailHelpers";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

interface SpendDetailDialogProps {
  open: boolean;
  onClose: () => void;
  row: WalletLedgerEntry | null;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <Stack direction="row" spacing={2} sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function SpendDetailDialog({ open, onClose, row }: SpendDetailDialogProps) {
  // Hooks must run unconditionally before any early return.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const kind = classifySpend(row?.description);
  const isMisc = kind === "misc";
  const miscQuery = useMiscExpenseForTransaction(
    isMisc ? row?.id ?? null : null,
    open && isMisc
  );

  if (!row) return null;

  const misc = miscQuery.data ?? null;
  const isReturn = row.transaction_type === "return";
  const reference = parseMiscReference(row.description);
  const photos: WorkPhoto[] = buildSpendPhotos(row, misc);
  const payerKey = misc?.payer_source ?? row.payer_source ?? null;
  const payerName = misc?.payer_name ?? row.payer_name ?? null;
  const noteText = misc?.notes ?? row.notes;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="h6" fontWeight={700}>
              {isReturn ? "Return details" : "Spend details"}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" fontWeight={700}>
                − ₹{fmt(row.amount)}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={row.payment_mode.toUpperCase()}
                sx={{ fontSize: "0.65rem", height: 20 }}
              />
            </Stack>
          </Stack>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ position: "absolute", top: 8, right: 8 }}
            aria-label="Close"
          >
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <DetailRow label="Date" value={dayjs(row.transaction_date).format("D MMM YYYY")} />
          {reference && <DetailRow label="Reference" value={reference} />}
          {!isMisc && row.description && <DetailRow label="Details" value={row.description} />}

          {isMisc && miscQuery.isLoading && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Loading bill details…
              </Typography>
            </Stack>
          )}
          {isMisc && miscQuery.isError && (
            <Typography variant="caption" color="error" sx={{ display: "block", py: 1 }}>
              Couldn’t load bill details.
            </Typography>
          )}
          {isMisc && misc && (
            <>
              <DetailRow label="Vendor" value={misc.vendor_name} />
              <DetailRow label="Category" value={misc.category_name} />
              <DetailRow label="For" value={misc.description} />
            </>
          )}

          <DetailRow
            label="Paid by"
            value={payerKey ? prettyPayerSource(payerKey, payerName) : null}
          />
          <DetailRow label="Recorded" value={row.recorded_by ? `by ${row.recorded_by}` : null} />
          <DetailRow label="Notes" value={noteText} />

          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
              display: "block",
              mt: 2,
            }}
          >
            Attachments
          </Typography>
          {photos.length === 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1, color: "text.secondary" }}>
              <ReceiptLong fontSize="small" sx={{ opacity: 0.5 }} />
              <Typography variant="body2">No bill or payment proof attached</Typography>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                <Stack key={p.id} alignItems="center" spacing={0.5}>
                  <Box
                    component="img"
                    src={p.url}
                    alt={p.description || "attachment"}
                    onClick={() => setLightboxIndex(i)}
                    sx={{
                      width: 88,
                      height: 88,
                      objectFit: "cover",
                      borderRadius: 1,
                      border: 1,
                      borderColor: "divider",
                      cursor: "pointer",
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {p.description}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <PhotoLightbox
        open={lightboxIndex !== null}
        photos={photos}
        startIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No NEW errors referencing `SpendDetailDialog.tsx`. (Pre-existing unrelated `*.test.tsx` errors may remain.)

- [ ] **Step 3: Lint the new files**

Run: `npx eslint src/components/wallet-v2/SpendDetailDialog.tsx src/components/wallet-v2/spendDetailHelpers.ts src/hooks/queries/useMiscExpenseForTransaction.ts`
Expected: EXIT 0 (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/wallet-v2/SpendDetailDialog.tsx
git commit -m "feat(wallet): read-only Spend details dialog with bill + proof viewer"
```

---

## Task 4: Make spend/return rows clickable in WalletLedgerList

**Files:**
- Modify: `src/components/wallet-v2/WalletLedgerList.tsx`

- [ ] **Step 1: Import the shared `prettyPayerSource` and remove the local copy**

At the top of `WalletLedgerList.tsx`, after the existing `dayjs` / type imports, add:

```tsx
import { prettyPayerSource } from "./spendDetailHelpers";
```

Then delete the local function at the bottom of the file (currently the last declaration):

```tsx
function prettyPayerSource(key: string, name: string | null): string {
  const map: Record<string, string> = {
    own_money: "Own Money",
    amma_money: "Amma Money",
    mothers_money: "Amma Money",
    client_money: "Client Money",
    trust_account: "Trust Account",
    other_site_money: name ?? "Other Site",
    custom: name ?? "Other",
  };
  return map[key] ?? key;
}
```

- [ ] **Step 2: Add the `onSpendClick` prop**

In the `WalletLedgerListProps` interface, add after `onRowClick?: (entry: WalletLedgerEntry) => void;`:

```tsx
  /** Called when a spend or return row is tapped. Opens the read-only
   *  Spend details verification dialog. Separate from onRowClick (deposits)
   *  so a row is only clickable when its specific handler is provided. */
  onSpendClick?: (entry: WalletLedgerEntry) => void;
```

And add `onSpendClick,` to the destructured props in the `WalletLedgerList({ ... })` signature (next to `onRowClick,`).

- [ ] **Step 3: Replace the clickability logic**

Find:

```tsx
          // Only deposits are editable today — keep the click affordance off other rows
          // so the cursor + hover don't suggest something that won't happen.
          const isClickable = !!onRowClick && row.transaction_type === "deposit";
```

Replace with:

```tsx
          // Deposits open the edit dialog (onRowClick); spends/returns open the
          // read-only Spend details dialog (onSpendClick). A row is clickable only
          // when its own handler is wired, so there are no dead click affordances.
          const handleRowClick =
            row.transaction_type === "deposit"
              ? onRowClick
                ? () => onRowClick(row)
                : undefined
              : onSpendClick
              ? () => onSpendClick(row)
              : undefined;
          const isClickable = !!handleRowClick;
```

- [ ] **Step 4: Use `handleRowClick` on the ListItem**

Find:

```tsx
              <ListItem
                onClick={isClickable ? () => onRowClick!(row) : undefined}
```

Replace with:

```tsx
              <ListItem
                onClick={handleRowClick}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: No NEW errors referencing `WalletLedgerList.tsx`.
Run: `npx eslint src/components/wallet-v2/WalletLedgerList.tsx`
Expected: EXIT 0.

- [ ] **Step 6: Run the existing ledger tests (regression guard)**

Run: `npx vitest run src/components/wallet-v2/WalletLedgerList.dates.test.ts`
Expected: PASS (8 cases — the date helpers are unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/components/wallet-v2/WalletLedgerList.tsx
git commit -m "feat(wallet): make spend/return rows clickable via onSpendClick"
```

---

## Task 5: Wire the dialog into both wallet pages

**Files:**
- Modify: `src/app/(main)/company/engineer-wallet/page.tsx`
- Modify: `src/app/(main)/site/my-wallet/page.tsx`

### 5a — Company engineer-wallet page

- [ ] **Step 1: Import the dialog**

After the existing `import EditDepositDialog from "@/components/wallet-v2/EditDepositDialog";` line, add:

```tsx
import SpendDetailDialog from "@/components/wallet-v2/SpendDetailDialog";
```

- [ ] **Step 2: Add detail-row state**

In `CompanyEngineerWalletPage`, next to `const [editingDeposit, setEditingDeposit] = useState<WalletLedgerEntry | null>(null);`, add:

```tsx
  const [detailRow, setDetailRow] = useState<WalletLedgerEntry | null>(null);
```

- [ ] **Step 3: Pass `onViewSpend` to both panels**

In the `<EngineerDetailPanel ... />` JSX, add this prop (next to `onEditDeposit=...`):

```tsx
          onViewSpend={(row) => setDetailRow(row)}
```

In the `<AllEngineersOverview ... />` JSX, add the same prop (next to `onEditDeposit=...`):

```tsx
          onViewSpend={(row) => setDetailRow(row)}
```

- [ ] **Step 4: Render the dialog**

Immediately after the `<EditDepositDialog ... />` element (before the closing `</Container>`), add:

```tsx
      <SpendDetailDialog
        open={detailRow !== null}
        onClose={() => setDetailRow(null)}
        row={detailRow}
      />
```

- [ ] **Step 5: Add `onViewSpend` to `AllEngineersOverview` props**

In the `AllEngineersOverview` props type, after `onEditDeposit?: (row: WalletLedgerEntry) => void;`, add:

```tsx
  onViewSpend: (row: WalletLedgerEntry) => void;
```

Add `onViewSpend,` to the destructured parameters of `AllEngineersOverview`.

Then update its `<WalletLedgerList ... />` to add the `onSpendClick` prop (next to the existing `onRowClick={...}`):

```tsx
          onSpendClick={onViewSpend}
```

- [ ] **Step 6: Add `onViewSpend` to `EngineerDetailPanel` props**

In the `EngineerDetailPanel` props type, after `onEditDeposit?: (row: WalletLedgerEntry) => void;`, add:

```tsx
  onViewSpend: (row: WalletLedgerEntry) => void;
```

Add `onViewSpend,` to the destructured parameters of `EngineerDetailPanel`.

Then update its `<WalletLedgerList ... />` to add (next to the existing `onRowClick={...}`):

```tsx
          onSpendClick={onViewSpend}
```

### 5b — Site my-wallet page

- [ ] **Step 7: Imports + state**

After `import AddFundsDialog from "@/components/wallet-v2/AddFundsDialog";`, add:

```tsx
import SpendDetailDialog from "@/components/wallet-v2/SpendDetailDialog";
```

Change the existing type import line:

```tsx
import type { WalletLedgerFilters } from "@/types/engineer-wallet-v2.types";
```

to:

```tsx
import type { WalletLedgerEntry, WalletLedgerFilters } from "@/types/engineer-wallet-v2.types";
```

In `MyWalletPage`, next to `const [returnOpen, setReturnOpen] = useState(false);`, add:

```tsx
  const [detailRow, setDetailRow] = useState<WalletLedgerEntry | null>(null);
```

- [ ] **Step 8: Wire the list + render the dialog**

Update the `<WalletLedgerList ... />` (it currently has no click handler) to add:

```tsx
          onSpendClick={(row) => setDetailRow(row)}
```

After the `<AddFundsDialog ... />` element (before the closing `</Container>`), add:

```tsx
      <SpendDetailDialog
        open={detailRow !== null}
        onClose={() => setDetailRow(null)}
        row={detailRow}
      />
```

- [ ] **Step 9: Typecheck + lint both pages**

Run: `npx tsc --noEmit`
Expected: No NEW errors referencing either page.
Run: `npx eslint "src/app/(main)/company/engineer-wallet/page.tsx" "src/app/(main)/site/my-wallet/page.tsx"`
Expected: EXIT 0.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(main)/company/engineer-wallet/page.tsx" "src/app/(main)/site/my-wallet/page.tsx"
git commit -m "feat(wallet): open Spend details dialog on spend/return tap (both pages)"
```

---

## Task 6: Build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: No NEW failures introduced by this change (the new helper suite passes; pre-existing unrelated failures, if any, are unchanged).

- [ ] **Step 3: Manual Playwright verification (per CLAUDE.md)**

Start `npm run dev:cloud`, log in via `http://localhost:3000/dev-login`, then:
1. Navigate to `/company/engineer-wallet`, open an engineer, switch to the **Spends** tab.
2. Tap a **misc expense** that has a bill → confirm the dialog shows vendor/category/"For", and both **Vendor bill** + **Payment proof** thumbnails; tap a thumbnail → fullscreen lightbox opens and zooms.
3. Tap a **cash misc expense with no attachments** → confirm the "No bill or payment proof attached" line.
4. Tap a **salary settlement** spend → confirm the universal block + proof render (no crash, no misc fetch).
5. Confirm **deposit** rows still open the edit dialog (unchanged).
6. Repeat tap-a-spend on `/site/my-wallet`.
7. Read console via `playwright_console_logs` → fix any errors/warnings, re-verify, then `playwright_close`.

- [ ] **Step 4: Deferred scope note**

The "View full settlement →" deep-link for salary/contract spends is intentionally **not** implemented (spec scope boundary: dropped because a clean route can't be cleanly supplied from the wallet page). Salary/contract spends show the universal block + proof. No action — recorded here so it isn't mistaken for an omission.

---

## Self-Review

**Spec coverage:**
- Tap any spend/return → detail dialog → Tasks 3 + 4 + 5. ✓
- Universal block (amount/date/mode/payer/notes + proof) → Task 3 `DetailRow`s + `buildSpendPhotos`. ✓
- Misc enrichment (bill image + vendor/category/description) → Task 2 hook + Task 3 render. ✓
- Proof source of truth = wallet row's `proof_url`; misc contributes `bill_url` only → Task 1 `buildSpendPhotos`. ✓
- "Nothing attached" line → Task 3 empty-photos branch. ✓
- Both pages → Task 5a + 5b. ✓
- Reuse `PhotoLightbox` → Task 3. ✓
- Loading / error / no-linked-row edge cases → Task 3 (`isLoading`, `isError`) + Task 2 (`maybeSingle` → null). ✓
- Vitest helper tests → Task 1. ✓
- No DB change → confirmed; no migration task exists. ✓
- Settlement deep-link = stretch, may be dropped → Task 6 Step 4 documents the deferral. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. ✓

**Type consistency:** `MiscExpenseVerification` defined in Task 1, imported by Tasks 2 + 3. `classifySpend` / `parseMiscReference` / `buildSpendPhotos` / `prettyPayerSource` signatures used in Task 3 match Task 1 definitions. `onSpendClick: (entry: WalletLedgerEntry) => void` defined in Task 4 and supplied in Task 5 (`onViewSpend` / inline). `useMiscExpenseForTransaction(transactionId, enabled)` defined in Task 2, called with `(isMisc ? row?.id ?? null : null, open && isMisc)` in Task 3. ✓
