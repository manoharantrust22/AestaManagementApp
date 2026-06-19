# Task Work — Completion Flow & Expense Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task-work payments traceable to their site-expense record (visible IDs + a deep link), give the `/site/expenses` row a title-led label, and replace the instant "Mark as completed" with a confirmation that captures a reason and a waived-vs-owed choice for any unpaid balance — all reversible.

**Architecture:** Pure helpers (`paymentRef`, `completion`) hold the testable logic; thin React changes consume them. Per-payment IDs are *computed* at render (`packageNumber · #n`, chronological) so the same number appears in the task drawer and the expenses expand panel with no schema for the id. One additive migration adds `completion_reason` + `balance_waived` to `task_work_packages` for the completion UX (the expense/books logic is untouched — it is already paid-driven).

**Tech Stack:** Next.js 15 (App Router, client components), MUI v7, React Query, `material-react-table` (via `@/components/common/DataTable`), Supabase (Postgres), Vitest.

## Global Constraints

- **No change to expense posting / category / `v_all_expenses`.** Task-work payments already surface there and consolidate; this work is display + completion UX only.
- **Target V1 expenses page only** (`src/app/(main)/site/expenses/page.tsx`). `NEXT_PUBLIC_FF_EXPENSES_REDESIGN` is **not set in prod**, so V1 is live. Do not touch `page.v2.tsx`.
- **Per-payment id format:** `TW-260618-001 · #6` = `${package_number} · #${chronologicalLineNumber}` (oldest payment = `#1`), numbering only non-deleted payments.
- **Everything reversible:** completion is undone by Reopen, which also clears the waiver/reason. No destructive operations.
- **MUI hydration rules** (from CLAUDE.md): block elements inside `ListItemText` `primary`/`secondary` need `*TypographyProps={{ component: "div" }}` (already present in `TaskWorkPaymentsPanel`).
- **Supabase MCP = PRODUCTION.** Applying the migration is a prod write — confirm with the user before applying (it is additive/non-destructive).
- **Dev server:** test against `npm run dev:cloud` (uses prod Supabase). The migration must therefore be applied to prod before manual testing of the completion write path.
- **Commit style:** end commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Work happens on branch `feat/task-work-completion-traceability` (already created).

---

### Task 1: Data layer — migration + types

**Files:**
- Create: `supabase/migrations/20260619200000_task_work_completion_fields.sql`
- Modify: `src/types/taskWork.types.ts` (add fields to `TaskWorkPackage` and `TaskWorkPackageInput`)

**Interfaces:**
- Produces: `task_work_packages.completion_reason text NULL`, `task_work_packages.balance_waived boolean NOT NULL DEFAULT false`; TS fields `completion_reason: string | null`, `balance_waived: boolean` on `TaskWorkPackage`, and optional `completion_reason?`, `balance_waived?` on `TaskWorkPackageInput`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260619200000_task_work_completion_fields.sql`:

```sql
-- Task Work completion UX: capture WHY a package was completed (esp. with an
-- unsettled balance) and whether that balance is intentionally waived.
-- Additive + nullable/defaulted — no backfill, no view changes. The expense
-- in v_all_expenses stays paid-driven; these columns are display/audit only.
ALTER TABLE task_work_packages
  ADD COLUMN IF NOT EXISTS completion_reason text,
  ADD COLUMN IF NOT EXISTS balance_waived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN task_work_packages.completion_reason IS
  'Free-text reason recorded when completing a package, especially when a balance is left unsettled.';
COMMENT ON COLUMN task_work_packages.balance_waived IS
  'TRUE when the remaining (unpaid) balance at completion is intentionally not owed (bargained down / scope reduced). Display only; reset to false on reopen.';
```

- [ ] **Step 2: Add the fields to the row type**

In `src/types/taskWork.types.ts`, inside `export interface TaskWorkPackage`, after the `notes: string | null;` line add:

```ts
  completion_reason: string | null;
  balance_waived: boolean;
```

- [ ] **Step 3: Add the fields to the input type**

In `src/types/taskWork.types.ts`, inside `export interface TaskWorkPackageInput`, after the `notes?: string | null;` line add:

```ts
  completion_reason?: string | null;
  balance_waived?: boolean;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "taskWork.types" || echo "OK"`
Expected: `OK`

- [ ] **Step 5: Apply the migration to prod (confirm with user first)**

This is required so `npm run dev:cloud` (prod DB) can read/write the new columns during testing. It is additive and non-destructive. With the user's confirmation, apply via `mcp__supabase__apply_migration` with `name: "task_work_completion_fields"` and the SQL from Step 1. Then verify:

Run (via `mcp__supabase__execute_sql`):
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'task_work_packages'
  AND column_name IN ('completion_reason', 'balance_waived');
```
Expected: two rows — `completion_reason | text | NULL`, `balance_waived | boolean | false`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260619200000_task_work_completion_fields.sql src/types/taskWork.types.ts
git commit -m "feat(task-work): add completion_reason + balance_waived columns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Per-payment reference helper (pure, TDD)

**Files:**
- Create: `src/lib/taskWork/paymentRef.ts`
- Test: `src/lib/taskWork/paymentRef.test.ts`

**Interfaces:**
- Produces:
  - `interface NumberablePayment { id: string; payment_date: string; created_at?: string | null }`
  - `taskPaymentLineNumbers(payments: NumberablePayment[]): Map<string, number>` — oldest `payment_date` = 1; ties broken by `created_at` then `id`.
  - `formatTaskPaymentRef(packageNumber: string, lineNumber: number): string` → `"TW-260618-001 · #6"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/taskWork/paymentRef.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { taskPaymentLineNumbers, formatTaskPaymentRef } from "./paymentRef";

describe("taskPaymentLineNumbers", () => {
  it("numbers payments chronologically, oldest = 1", () => {
    const map = taskPaymentLineNumbers([
      { id: "c", payment_date: "2026-06-13" },
      { id: "a", payment_date: "2026-05-31" },
      { id: "b", payment_date: "2026-06-03" },
    ]);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("breaks same-date ties by created_at then id", () => {
    const map = taskPaymentLineNumbers([
      { id: "y", payment_date: "2026-06-10", created_at: "2026-06-10T12:00:00Z" },
      { id: "x", payment_date: "2026-06-10", created_at: "2026-06-10T09:00:00Z" },
    ]);
    expect(map.get("x")).toBe(1);
    expect(map.get("y")).toBe(2);
  });

  it("does not mutate the input array order", () => {
    const input = [
      { id: "c", payment_date: "2026-06-13" },
      { id: "a", payment_date: "2026-05-31" },
    ];
    taskPaymentLineNumbers(input);
    expect(input[0].id).toBe("c");
  });
});

describe("formatTaskPaymentRef", () => {
  it("renders 'PKG · #n'", () => {
    expect(formatTaskPaymentRef("TW-260618-001", 6)).toBe("TW-260618-001 · #6");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/taskWork/paymentRef.test.ts`
Expected: FAIL — `Failed to resolve import "./paymentRef"` / function not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/taskWork/paymentRef.ts`:

```ts
// Per-payment reference for Task Work. The id is COMPUTED (not stored) so the
// same "PKG · #n" appears in the task drawer and the /site/expenses expand panel
// and they line up exactly. Number only the rows you pass (exclude soft-deleted).

export interface NumberablePayment {
  id: string;
  payment_date: string;
  created_at?: string | null;
}

/** Map<paymentId, lineNumber> numbered chronologically (oldest payment = 1). */
export function taskPaymentLineNumbers(
  payments: NumberablePayment[]
): Map<string, number> {
  const sorted = [...payments].sort((a, b) => {
    if (a.payment_date !== b.payment_date)
      return a.payment_date < b.payment_date ? -1 : 1;
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    if (ac !== bc) return ac < bc ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const map = new Map<string, number>();
  sorted.forEach((p, i) => map.set(p.id, i + 1));
  return map;
}

/** "TW-260618-001 · #6" */
export function formatTaskPaymentRef(
  packageNumber: string,
  lineNumber: number
): string {
  return `${packageNumber} · #${lineNumber}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/taskWork/paymentRef.test.ts`
Expected: PASS (5 assertions across 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskWork/paymentRef.ts src/lib/taskWork/paymentRef.test.ts
git commit -m "feat(task-work): computed per-payment reference helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Completion update helpers (pure, TDD)

**Files:**
- Create: `src/lib/taskWork/completion.ts`
- Test: `src/lib/taskWork/completion.test.ts`

**Interfaces:**
- Produces:
  - `type CompletionChoice = "no_balance" | "waive" | "owe"`
  - `buildCompletionUpdate(args: { choice: CompletionChoice; reason: string; actualEndDate: string | null; today: string }): { status: "completed"; actual_end_date?: string; completion_reason: string | null; balance_waived: boolean }`
  - `buildReopenUpdate(): { status: "active"; balance_waived: false; completion_reason: null }`
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/taskWork/completion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCompletionUpdate, buildReopenUpdate } from "./completion";

describe("buildCompletionUpdate", () => {
  it("no_balance: clears reason, not waived, stamps end date when missing", () => {
    const u = buildCompletionUpdate({
      choice: "no_balance",
      reason: "ignored",
      actualEndDate: null,
      today: "2026-06-19",
    });
    expect(u).toEqual({
      status: "completed",
      completion_reason: null,
      balance_waived: false,
      actual_end_date: "2026-06-19",
    });
  });

  it("waive: trims reason, sets balance_waived true", () => {
    const u = buildCompletionUpdate({
      choice: "waive",
      reason: "  bargained to 37k  ",
      actualEndDate: null,
      today: "2026-06-19",
    });
    expect(u.balance_waived).toBe(true);
    expect(u.completion_reason).toBe("bargained to 37k");
  });

  it("owe: keeps reason, not waived", () => {
    const u = buildCompletionUpdate({
      choice: "owe",
      reason: "will pay next week",
      actualEndDate: null,
      today: "2026-06-19",
    });
    expect(u.balance_waived).toBe(false);
    expect(u.completion_reason).toBe("will pay next week");
  });

  it("does not overwrite an existing end date", () => {
    const u = buildCompletionUpdate({
      choice: "owe",
      reason: "x",
      actualEndDate: "2026-06-01",
      today: "2026-06-19",
    });
    expect(u.actual_end_date).toBeUndefined();
  });

  it("empty reason normalises to null", () => {
    const u = buildCompletionUpdate({
      choice: "owe",
      reason: "   ",
      actualEndDate: "2026-06-01",
      today: "2026-06-19",
    });
    expect(u.completion_reason).toBeNull();
  });
});

describe("buildReopenUpdate", () => {
  it("reactivates and clears the waiver + reason", () => {
    expect(buildReopenUpdate()).toEqual({
      status: "active",
      balance_waived: false,
      completion_reason: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/taskWork/completion.test.ts`
Expected: FAIL — cannot resolve `./completion`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/taskWork/completion.ts`:

```ts
// Pure builders for the Task Work completion / reopen update payloads. Kept out
// of the dialog so the rules (reason handling, end-date stamping, waiver) are
// unit-tested. `today` is injected for deterministic tests.

export type CompletionChoice = "no_balance" | "waive" | "owe";

export interface BuildCompletionUpdateArgs {
  choice: CompletionChoice;
  reason: string;
  actualEndDate: string | null;
  today: string;
}

export interface CompletionUpdate {
  status: "completed";
  actual_end_date?: string;
  completion_reason: string | null;
  balance_waived: boolean;
}

export function buildCompletionUpdate({
  choice,
  reason,
  actualEndDate,
  today,
}: BuildCompletionUpdateArgs): CompletionUpdate {
  const update: CompletionUpdate = {
    status: "completed",
    completion_reason: choice === "no_balance" ? null : reason.trim() || null,
    balance_waived: choice === "waive",
  };
  if (!actualEndDate) update.actual_end_date = today;
  return update;
}

export interface ReopenUpdate {
  status: "active";
  balance_waived: false;
  completion_reason: null;
}

export function buildReopenUpdate(): ReopenUpdate {
  return { status: "active", balance_waived: false, completion_reason: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/taskWork/completion.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskWork/completion.ts src/lib/taskWork/completion.test.ts
git commit -m "feat(task-work): completion + reopen update builders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Title-led expense label + `#n` column (TDD)

**Files:**
- Modify: `src/components/expenses/taskWorkExpenseConsolidation.tsx`
- Modify: `src/components/expenses/taskWorkExpenseConsolidation.test.tsx`

**Interfaces:**
- Consumes: `formatTaskPaymentRef`, `taskPaymentLineNumbers` (Task 2).
- Produces: consolidated row with `description = title`, `vendor_name = maistry`; `TaskWorkExpenseDetail` renders a leading `Ref` column showing `PKG · #n`.

- [ ] **Step 1: Update the existing test to the new label (red)**

In `src/components/expenses/taskWorkExpenseConsolidation.test.tsx`, replace these two lines:

```ts
    expect(consol.description).toContain("Varun");
    expect(consol.description).toContain("House Interior plastering");
```

with:

```ts
    expect(consol.vendor_name).toBe("Varun");
    expect(consol.description).toBe("House Interior plastering");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/expenses/taskWorkExpenseConsolidation.test.tsx`
Expected: FAIL — `expected 'Task Work — Varun — House Interior plastering' to be 'House Interior plastering'`.

- [ ] **Step 3: Change the consolidated label**

In `src/components/expenses/taskWorkExpenseConsolidation.tsx`, inside `consolidateTaskWorkRows`, change:

```ts
      description: `Task Work — ${maistry ? maistry + " — " : ""}${title}`,
      vendor_name: maistry,
```

to:

```ts
      // Title-led so the row is instantly recognisable as the task; the maistry
      // moves to vendor_name and the "Task Work" expense_type chip carries the type.
      description: title,
      vendor_name: maistry,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/expenses/taskWorkExpenseConsolidation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the `#n` column to the detail panel**

In `src/components/expenses/taskWorkExpenseConsolidation.tsx`:

Add the import near the top (after the existing `formatPayerSource` import):

```ts
import {
  taskPaymentLineNumbers,
  formatTaskPaymentRef,
} from "@/lib/taskWork/paymentRef";
```

Inside `TaskWorkExpenseDetail`, after `const children = row.__taskChildren ?? [];` add:

```ts
  const lineNumbers = taskPaymentLineNumbers(
    children.map((c) => ({
      id: c.source_id ?? c.id,
      payment_date: c.date,
      created_at: c.created_at ?? null,
    }))
  );
  const pkgNumber = row.settlement_reference ?? "";
```

In the detail `<TableHead>` row, add a leading header cell before `<TableCell>Date</TableCell>`:

```tsx
            <TableCell>Ref</TableCell>
```

In the `<TableBody>` `children.map((c) => { ... })` return, add a leading cell before `<TableCell>{dayjs(c.date)...}</TableCell>`:

```tsx
                <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
                  {pkgNumber
                    ? formatTaskPaymentRef(pkgNumber, lineNumbers.get(c.source_id ?? c.id) ?? 0)
                    : "—"}
                </TableCell>
```

- [ ] **Step 6: Type-check + full consolidation test**

Run: `npx vitest run src/components/expenses/taskWorkExpenseConsolidation.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "taskWorkExpenseConsolidation" || echo "OK"`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add src/components/expenses/taskWorkExpenseConsolidation.tsx src/components/expenses/taskWorkExpenseConsolidation.test.tsx
git commit -m "feat(expenses): title-led task-work label + per-payment ref column

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Payments tab — assurance chip + per-row `#n`

**Files:**
- Modify: `src/components/task-work/TaskWorkPaymentsPanel.tsx`

**Interfaces:**
- Consumes: `taskPaymentLineNumbers`, `formatTaskPaymentRef` (Task 2); `pkg.package_number`, payment `id`/`payment_date`/`created_at`.
- Produces: a clickable "On record in Site Expenses · {package_number}" chip routing to `/site/expenses?ref=<package_number>`; each payment row shows `· #n`.

- [ ] **Step 1: Add imports**

In `src/components/task-work/TaskWorkPaymentsPanel.tsx`, add to the `@mui/icons-material` import the `CheckCircle` and `OpenInNew` icons (extend the existing `{ Add, Delete, ReceiptLong }`):

```ts
import { Add, CheckCircle, Delete, OpenInNew, ReceiptLong } from "@mui/icons-material";
```

Add after the existing imports:

```ts
import { useRouter } from "next/navigation";
import {
  taskPaymentLineNumbers,
  formatTaskPaymentRef,
} from "@/lib/taskWork/paymentRef";
```

- [ ] **Step 2: Compute the router + line numbers**

Inside `TaskWorkPaymentsPanel`, after `const deleteMut = useDeleteTaskWorkPayment();` add:

```ts
  const router = useRouter();
  const lineNumbers = useMemo(
    () =>
      taskPaymentLineNumbers(
        payments.map((p) => ({
          id: p.id,
          payment_date: p.payment_date,
          created_at: p.created_at,
        }))
      ),
    [payments]
  );
```

- [ ] **Step 3: Add the assurance chip**

In the summary `<Paper variant="outlined" ...>` block, immediately AFTER the closing `</Grid>` of the Price/Paid/Balance grid (before the Paper closes), add:

```tsx
        {payments.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              color="success"
              startIcon={<CheckCircle />}
              endIcon={<OpenInNew />}
              sx={{ textTransform: "none" }}
              onClick={() =>
                router.push(
                  `/site/expenses?ref=${encodeURIComponent(pkg.package_number)}`
                )
              }
            >
              On record in Site Expenses · {pkg.package_number}
            </Button>
          </Box>
        )}
```

(`Button` and `Box` are already imported in this file.)

- [ ] **Step 4: Show `· #n` on each payment row**

In the `payments.map((p) => { ... })` primary block, change the primary `<Box>` to append the ref after the type chip. Replace:

```tsx
                      <Chip
                        size="small"
                        variant="outlined"
                        label={TASK_WORK_PAYMENT_TYPE_LABEL[p.payment_type]}
                      />
                    </Box>
```

with:

```tsx
                      <Chip
                        size="small"
                        variant="outlined"
                        label={TASK_WORK_PAYMENT_TYPE_LABEL[p.payment_type]}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                        sx={{ fontFamily: "monospace" }}
                      >
                        {formatTaskPaymentRef(
                          pkg.package_number,
                          lineNumbers.get(p.id) ?? 0
                        )}
                      </Typography>
                    </Box>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "TaskWorkPaymentsPanel" || echo "OK"`
Expected: `OK`.

- [ ] **Step 6: Manual verify (Playwright MCP, dev:cloud running)**

Note: the user's own Chrome may hold the MCP browser profile lock — if so, ask them to close it first. Then:
1. Navigate `http://localhost:3000/dev-login`, then to `/site/task-work`.
2. Open "House Interior plastering" → Payments tab.
3. Confirm: a green "On record in Site Expenses · TW-260618-001" chip, and each row shows `TW-260618-001 · #n`.
4. `playwright_console_logs`: no new errors/warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/task-work/TaskWorkPaymentsPanel.tsx
git commit -m "feat(task-work): site-expenses assurance chip + per-payment ids in Payments tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: TaskWorkCompleteDialog (new component)

**Files:**
- Create: `src/components/task-work/TaskWorkCompleteDialog.tsx`

**Interfaces:**
- Consumes: `CompletionChoice` (Task 3); `inr` formatting.
- Produces: `default export function TaskWorkCompleteDialog(props: { open: boolean; onClose: () => void; title: string; balanceDue: number; isPending: boolean; onSettle: () => void; onConfirm: (choice: CompletionChoice, reason: string) => void })`.
  - When `balanceDue <= 0`: a plain confirm; "Complete" calls `onConfirm("no_balance", "")`.
  - When `balanceDue > 0`: requires a reason; radio chooses `"waive"` vs `"owe"`; a "Record final settlement instead" button calls `onSettle()`; "Complete" is disabled until the reason is non-empty.

- [ ] **Step 1: Create the component**

Create `src/components/task-work/TaskWorkCompleteDialog.tsx`:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import { Payments as PaymentsIcon } from "@mui/icons-material";
import type { CompletionChoice } from "@/lib/taskWork/completion";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  balanceDue: number;
  isPending: boolean;
  onSettle: () => void;
  onConfirm: (choice: CompletionChoice, reason: string) => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function TaskWorkCompleteDialog({
  open,
  onClose,
  title,
  balanceDue,
  isPending,
  onSettle,
  onConfirm,
}: Props) {
  const hasBalance = balanceDue > 0;
  const [choice, setChoice] = useState<"waive" | "owe">("waive");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setChoice("waive");
      setReason("");
    }
  }, [open]);

  const canComplete = !hasBalance || reason.trim().length > 0;

  const handleComplete = () => {
    if (!hasBalance) {
      onConfirm("no_balance", "");
    } else {
      onConfirm(choice, reason);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Complete — {title}</DialogTitle>
      <DialogContent>
        {!hasBalance ? (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Mark this package as completed? You can reopen it later if needed.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1 }}>
            <Alert severity="warning" sx={{ py: 0.5 }}>
              {inr(balanceDue)} is still unpaid.
            </Alert>

            <Button
              variant="contained"
              color="success"
              startIcon={<PaymentsIcon />}
              onClick={onSettle}
            >
              Record final settlement instead
            </Button>

            <Divider>or complete without full payment</Divider>

            <RadioGroup
              value={choice}
              onChange={(e) => setChoice(e.target.value as "waive" | "owe")}
            >
              <FormControlLabel
                value="waive"
                control={<Radio size="small" />}
                label={`Balance waived — bargained down / scope reduced (${inr(
                  balanceDue
                )} no longer owed)`}
              />
              <FormControlLabel
                value="owe"
                control={<Radio size="small" />}
                label={`Still owed — will be paid later (${inr(
                  balanceDue
                )} stays payable)`}
              />
            </RadioGroup>

            <TextField
              fullWidth
              required
              label="Reason"
              placeholder="Why is the balance unsettled?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              multiline
              rows={2}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleComplete}
          disabled={isPending || !canComplete}
        >
          Complete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "TaskWorkCompleteDialog" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/components/task-work/TaskWorkCompleteDialog.tsx
git commit -m "feat(task-work): completion confirm dialog (reason + waive/owe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire completion into the drawer + completed banner + button hierarchy

**Files:**
- Modify: `src/components/task-work/TaskWorkDetailDrawer.tsx`

**Interfaces:**
- Consumes: `TaskWorkCompleteDialog` (Task 6); `buildCompletionUpdate`, `buildReopenUpdate`, `CompletionChoice` (Task 3).
- Produces: confirmation-gated completion; a completed-state banner replacing the action buttons; demoted Reopen; balance shown as "Waived" when `balance_waived`.

- [ ] **Step 1: Add imports**

In `src/components/task-work/TaskWorkDetailDrawer.tsx`, add after the existing component imports (near the `TaskWorkPaymentDialog` import):

```ts
import TaskWorkCompleteDialog from "./TaskWorkCompleteDialog";
import {
  buildCompletionUpdate,
  buildReopenUpdate,
  type CompletionChoice,
} from "@/lib/taskWork/completion";
```

Also remove the now-unused `type TaskWorkStatus` from the existing
`@/types/taskWork.types` import block (the old `setStatus` helper was its only
user; leaving it triggers an unused-import lint error). The block becomes:

```ts
import {
  TASK_WORK_STATUS_LABEL,
  TASK_WORK_UNIT_LABEL,
  type TaskWorkPackageWithMeta,
} from "@/types/taskWork.types";
```

- [ ] **Step 2: Add dialog state + handlers**

Inside the component, after `const [payOpen, setPayOpen] = useState(false);` add:

```ts
  const [completeOpen, setCompleteOpen] = useState(false);
```

Replace the existing `setStatus` helper:

```ts
  const setStatus = (status: TaskWorkStatus) => {
    const data: Record<string, unknown> = { status };
    if (status === "completed" && !pkg.actual_end_date) {
      data.actual_end_date = dayjs().format("YYYY-MM-DD");
    }
    updateMut.mutate({ id: pkg.id, siteId: pkg.site_id, data });
  };
```

with:

```ts
  const handleCompleteConfirm = (choice: CompletionChoice, reason: string) => {
    updateMut.mutate(
      {
        id: pkg.id,
        siteId: pkg.site_id,
        data: buildCompletionUpdate({
          choice,
          reason,
          actualEndDate: pkg.actual_end_date,
          today: dayjs().format("YYYY-MM-DD"),
        }),
      },
      { onSuccess: () => setCompleteOpen(false) }
    );
  };

  const handleReopen = () => {
    updateMut.mutate({
      id: pkg.id,
      siteId: pkg.site_id,
      data: buildReopenUpdate(),
    });
  };
```

- [ ] **Step 3: Rebuild the action area**

Replace the entire action `<Box sx={{ mt: 3, ... }}>...</Box>` block (the one containing "Record final settlement", "Mark as completed", "Reopen", "Edit package") with:

```tsx
          <Box sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 1 }}>
            {canEdit && !isClosed && balanceDue > 0 && (
              <Button
                fullWidth
                variant="contained"
                color="success"
                startIcon={<PaymentsIcon />}
                onClick={() => setPayOpen(true)}
              >
                Record final settlement ({inr(balanceDue)})
              </Button>
            )}
            {canEdit && !isClosed && (
              <Button
                fullWidth
                variant={balanceDue > 0 ? "outlined" : "contained"}
                color="success"
                startIcon={<CheckCircleIcon />}
                disabled={updateMut.isPending}
                onClick={() => setCompleteOpen(true)}
              >
                Mark as completed
              </Button>
            )}

            {pkg.status === "completed" && (
              <Paper
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 2, borderColor: "success.main" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CheckCircleIcon color="success" fontSize="small" />
                  <Typography variant="body2" fontWeight={700}>
                    Completed
                    {pkg.actual_end_date
                      ? ` on ${dayjs(pkg.actual_end_date).format("DD MMM YYYY")}`
                      : ""}{" "}
                    · {inr(paid)} paid
                  </Typography>
                </Box>
                {balanceDue > 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    {pkg.balance_waived
                      ? `Waived ${inr(balanceDue)}`
                      : `${inr(balanceDue)} still owed`}
                    {pkg.completion_reason ? ` · ${pkg.completion_reason}` : ""}
                  </Typography>
                )}
                {canEdit && (
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<ReplayIcon />}
                    disabled={updateMut.isPending}
                    onClick={handleReopen}
                    sx={{ mt: 0.5 }}
                  >
                    Reopen
                  </Button>
                )}
              </Paper>
            )}

            {pkg.status === "cancelled" && canEdit && (
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ReplayIcon />}
                disabled={updateMut.isPending}
                onClick={handleReopen}
              >
                Reopen
              </Button>
            )}

            {onEdit && (
              <Button
                fullWidth
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => onEdit(pkg)}
              >
                Edit package
              </Button>
            )}
          </Box>
```

- [ ] **Step 4: Show waiver in the Actuals "Balance" stat**

In the Actuals `<Paper>` grid, replace:

```tsx
                  <Grid size={{ xs: 6 }}>
                    <Stat label="Balance" value={inr(prof.balance)} color="error.main" />
                  </Grid>
```

with:

```tsx
                  <Grid size={{ xs: 6 }}>
                    <Stat
                      label="Balance"
                      value={pkg.balance_waived ? `Waived ${inr(prof.balance)}` : inr(prof.balance)}
                      color={pkg.balance_waived ? "text.secondary" : "error.main"}
                    />
                  </Grid>
```

- [ ] **Step 5: Render the dialog**

Just before the existing `<TaskWorkPaymentDialog ... />` at the end of the component, add:

```tsx
      <TaskWorkCompleteDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title={pkg.title}
        balanceDue={balanceDue}
        isPending={updateMut.isPending}
        onSettle={() => {
          setCompleteOpen(false);
          setPayOpen(true);
        }}
        onConfirm={handleCompleteConfirm}
      />
```

- [ ] **Step 6: Type-check + full test suite for regressions**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "TaskWorkDetailDrawer" || echo "OK"`
Expected: `OK`.
Run: `npx vitest run src/lib/taskWork src/components/expenses/taskWorkExpenseConsolidation.test.tsx`
Expected: PASS (all task-work helper + consolidation tests).

- [ ] **Step 7: Manual verify (Playwright MCP, dev:cloud)**

1. `/site/task-work` → open a package with a balance due → Overview.
2. "Record final settlement (₹X)" is the filled primary; "Mark as completed" is outlined.
3. Click "Mark as completed" → dialog shows the unpaid amount, a "Record final settlement instead" button, waive/owe radios, and a required Reason. "Complete" is disabled until a reason is typed.
4. Choose "Balance waived", type a reason, Complete → drawer shows the green "Completed on … · ₹… paid · Waived ₹X · {reason}" banner; the Actuals Balance reads "Waived ₹X" (muted); only a small "Reopen" remains.
5. Click "Reopen" → returns to Active; Balance is red again; action buttons return.
6. On a fully-paid package, "Mark as completed" → plain confirm (no reason field) → completes.
7. `playwright_console_logs`: no errors/warnings.

- [ ] **Step 8: Commit**

```bash
git add src/components/task-work/TaskWorkDetailDrawer.tsx
git commit -m "feat(task-work): confirm-gated completion, completed banner, waiver display

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `/site/expenses` deep-link filter (`?ref=`)

**Files:**
- Modify: `src/app/(main)/site/expenses/page.tsx`

**Interfaces:**
- Consumes: the `?ref=` query param; the existing `settlement_reference` column (accessorKey `"settlement_reference"`).
- Produces: on fresh navigation to `/site/expenses?ref=<pkg>`, the table opens with the `settlement_reference` column filtered to `<pkg>` (so the consolidated task row is isolated) and that row tinted.

- [ ] **Step 1: Read the `ref` param**

In `src/app/(main)/site/expenses/page.tsx`, the file already imports `useRouter` from `next/navigation`. Change that import to also bring `useSearchParams`:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

Inside the component, near the other hooks (after the `useRouter()` call), add:

```ts
  const searchParams = useSearchParams();
  const refParam = searchParams.get("ref") || "";
```

- [ ] **Step 2: Seed the column filter + highlight on the DataTable**

In the `<DataTable ... />` usage, replace:

```tsx
          initialState={{
            columnPinning: { left: ["settlement_reference", "date"] },
          }}
```

with:

```tsx
          initialState={{
            columnPinning: { left: ["settlement_reference", "date"] },
            ...(refParam
              ? {
                  columnFilters: [
                    { id: "settlement_reference", value: refParam },
                  ],
                  showColumnFilters: true,
                }
              : {}),
          }}
          muiTableBodyRowProps={({ row }: any) => ({
            sx: {
              "&:hover": { backgroundColor: "action.hover" },
              ...(refParam &&
              row.original.settlement_reference === refParam
                ? { backgroundColor: "warning.light", opacity: 0.95 }
                : {}),
            },
          })}
```

Note: `initialState` is applied on mount, which is exactly when the user arrives from the task's assurance chip (a cross-page navigation that mounts this page fresh). Changing `?ref=` while already on this page will not re-seed — acceptable for this flow.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "expenses/page" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Manual verify (Playwright MCP, dev:cloud)**

1. From `/site/task-work` → open the package → Payments tab → click the "On record in Site Expenses · TW-260618-001" chip.
2. Lands on `/site/expenses`; the `settlement_reference` column filter is pre-filled with `TW-260618-001` and only the consolidated task row (₹45,000) shows, tinted.
3. Expand it → the detail table's leading `Ref` column shows `TW-260618-001 · #1 … #n`, matching the task drawer.
4. `playwright_console_logs`: no errors/warnings.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/site/expenses/page.tsx"
git commit -m "feat(expenses): deep-link filter via ?ref= for task-work rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full task-work + expenses test set**

Run: `npx vitest run src/lib/taskWork src/components/expenses/taskWorkExpenseConsolidation.test.tsx`
Expected: PASS.

- [ ] **Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (warnings unrelated to these files are fine).

- [ ] **End-to-end manual pass** (dev:cloud, Playwright MCP): record a payment → see id + chip → click through to `/site/expenses` filtered → complete with a waived balance + reason → banner + muted balance → reopen → re-complete fully paid (plain confirm). No console errors at any step.

## Spec coverage check

- Per-settlement IDs (`TW-… · #n`, same in task + expenses) → Tasks 2, 4, 5.
- Assurance ("on record in Site Expenses") + deep link/filter → Tasks 5, 8.
- Title-led expense label → Task 4.
- Confirmation on completion + reason + waive/owe + reversible → Tasks 3, 6, 7.
- All settlements with IDs inside the task → Task 5.
- One additive migration; books untouched → Task 1.

## Risks / notes

- **`#n` drift on hard-delete:** payments are soft-deleted and excluded, so the visible sequence stays contiguous (accepted by the user over an opaque stable code).
- **`?ref=` only seeds on mount:** correct for the cross-page chip flow; documented in Task 8.
- **Migration must reach prod before testing the completion write** (dev:cloud = prod DB) — Task 1 Step 5.
- **Playwright browser profile lock:** the user's own Chrome may hold it; ask them to close it before MCP-driving (Task 5 Step 6).
