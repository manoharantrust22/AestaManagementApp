# Spot Purchase Flow + ReceiptCapture Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a supervisor-driven "I already bought it" flow on `/site/spot-purchase` (wallet-only, no approval, auto-inventory), a reusable `<ReceiptCapture/>` primitive with paste-from-clipboard, and retrofit the primitive into the three settlement dialogs the user called out.

**Architecture:** A new `record_spot_purchase(jsonb)` RPC writes atomically to `material_purchase_expenses` (extending the existing enum from `own_site|group_stock` to also accept `spot`), creates inline `is_draft=true` material/vendor rows when supervisor adds off-catalog entries, debits the engineer wallet through the existing `atomic_record_wallet_spend` RPC (which already allows negative balances), records every line in `price_history`, and (for group purchases) stores provisional %-splits in a new `spot_purchase_allocations` table that supports two-stage finalization. A RLS gate parallel to the PO-creation gate locks down all the extension surfaces to wallet-only spot purchases for site engineers.

**Tech Stack:** Next.js 15 app router, MUI v7, React Query (TanStack Query), Supabase (PostgreSQL + Auth), Vitest + React Testing Library, Playwright for visual smoke.

**Spec:** [C:\Users\Haribabu\.claude\plans\i-know-you-have-piped-sonnet.md](../../../../../Users/Haribabu/.claude/plans/i-know-you-have-piped-sonnet.md) (approved 2026-05-23)

---

## File Structure

### New files

- `src/components/common/ReceiptCapture.tsx` — the primitive
- `src/components/common/ReceiptCapture.test.tsx` — RTL tests for the primitive
- `src/hooks/queries/useSpotPurchases.ts` — `useCreateSpotPurchase()`, `useUnallocatedSpotBatches()`, `useFinalizeSpotPurchaseAllocation()`
- `src/app/(main)/site/spot-purchase/page.tsx` — route shell
- `src/components/materials/SpotPurchaseForm.tsx` — vendor picker + item rows + allocation panel + submit
- `src/components/materials/SpotPurchaseAllocatorDialog.tsx` — finalize provisional splits
- `src/components/materials/RateUpdatePromptDialog.tsx` — post-submit "Update standard rate?" dialog
- `supabase/migrations/20260524100000_spot_purchase_schema.sql` — extends `material_purchase_expenses.purchase_type`, adds `is_draft` to `materials` + `vendors`, adds `bill_url` to `misc_expenses`, creates `spot_purchase_allocations`, RLS gates, RPCs `record_spot_purchase` and `finalize_spot_purchase_allocation`

### Modified files

- `src/app/(main)/site/today/page.tsx` — 4th tile + 4th chip
- `src/components/payments/SettleViaWalletDialog.tsx` — two `<ReceiptCapture/>` slots
- Material settle dialog (path resolved in Task K via `Grep` for `useSettleMaterialPurchase` callers)
- Misc-expense settle dialog (path resolved in Task L)
- `src/app/(main)/company/expenses/page.tsx` — SPOT chip + filter
- `src/app/(main)/company/materials/page.tsx` — Drafts filter chip
- `src/app/(main)/company/vendors/page.tsx` — Drafts filter chip
- `src/types/material.types.ts` — `PurchaseType`, `SpotPurchaseAllocation`, `is_draft` on `Material` + `Vendor`

### Reused (not modified)

- `hardenedUpload()` in `src/lib/storage/uploadHelpers` — used by `<ReceiptCapture/>` for upload to `work-updates` bucket
- `useEngineerWallet()` + `WalletBalancePreview` — wallet balance display on the form
- `atomic_record_wallet_spend` RPC — called from inside `record_spot_purchase`
- `useInterSiteSettlements()` — receives mirror rows when allocations are finalized
- `useMaterials()`, `useVendors()` — base for the form pickers

---

## Open verification points

Each is a fast Grep/Read at the start of its referenced task; resolved during execution. Do NOT add a separate "verification task" — just resolve inline at the listed task. Listed here so the executing subagent isn't surprised.

1. **Material settle dialog file path** — resolved in Task K: `Grep "useSettleMaterialPurchase" src/components` returns the caller component file.
2. **Misc-expense settle dialog file path** — resolved in Task L: `Grep "useSettleMiscExpense\|misc_expenses.*settle" src/components`.
3. **`materials` and `vendors` column lists** — resolved in Task B before writing the migration: `Read supabase/migrations/<earliest>_*.sql` (the initial schema covers both tables, found at `supabase/migrations/00000000000000_initial_schema.sql`).
4. **`stock_transactions` schema + existing trigger on `material_purchase_expenses`** — resolved in Task B by `Grep "CREATE TABLE.*stock_transactions\|TRIGGER.*stock_inventory" supabase/migrations`. If there's no existing trigger that fires on `material_purchase_expenses` inserts, add one in the new migration.
5. **`get_company_daily_peek` RPC body** — resolved in Task M when extending it: `Grep "CREATE OR REPLACE FUNCTION.*get_company_daily_peek" supabase/migrations`.
6. **`useEngineerWallet` exact hook name + return shape** — resolved at the start of Task E: `Grep "export function useEngineer.*Wallet" src/hooks/queries`. If the function returns `{ balance: number }` or a wallet object, adjust the form's `walletBalance` destructure accordingly. Per memory `engineer_wallet_attribution_phase1_2026_05_20.md`, `WalletBalancePreview` exists — that file is the easiest reference.
7. **`useGroupSiteMembers` existence** — resolved at the start of Task E: `Grep "useGroupSiteMembers\|useSiteGroupMembers" src/hooks`. If the hook doesn't exist by that name, find the existing way to enumerate sites in a group (likely `useSites().filter(s => s.site_group_id === id)`) and inline that instead of importing a non-existent hook.
8. **`Material.last_purchase_rate` / catalog-rate source** — resolved at the start of Task E. Per memory `laborer_drawer_materials_vendors_2026_05_07.md` and commit 858eb34, per-vendor rate lives in `vendor_inventory.current_price`. The form should fetch via the same path as `VariantInlineCard.tsx` — read that file before wiring the catalogRate lookup.

---

## Task A: ReceiptCapture primitive (TDD)

**Files:**
- Create: `src/components/common/ReceiptCapture.tsx`
- Create: `src/components/common/ReceiptCapture.test.tsx`

- [ ] **Step 1: Write failing test for the empty state and three input buttons**

Create `src/components/common/ReceiptCapture.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptCapture } from "./ReceiptCapture";

describe("ReceiptCapture", () => {
  it("renders empty state with file, paste, and camera buttons", () => {
    render(
      <ReceiptCapture
        label="Bill image"
        value={null}
        onChange={vi.fn()}
        folder="bills/test-site"
      />
    );
    expect(screen.getByText("Bill image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /file/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paste/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /camera/i })).toBeInTheDocument();
  });

  it("renders attached state with filename and remove button when value is set", () => {
    const onChange = vi.fn();
    render(
      <ReceiptCapture
        label="Bill image"
        value={{ url: "https://x/bill.jpg", storage_path: "bills/test-site/bill.jpg" }}
        onChange={onChange}
        folder="bills/test-site"
      />
    );
    expect(screen.getByText(/bill\.jpg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("calls onChange(null) when remove is clicked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onChange = vi.fn();
    render(
      <ReceiptCapture
        label="Bill image"
        value={{ url: "https://x/bill.jpg", storage_path: "bills/test-site/bill.jpg" }}
        onChange={onChange}
        folder="bills/test-site"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
npm test -- src/components/common/ReceiptCapture.test.tsx
```

Expected: FAIL — `ReceiptCapture` not found.

- [ ] **Step 3: Implement the primitive**

Create `src/components/common/ReceiptCapture.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AttachFile as FileIcon,
  ContentPaste as PasteIcon,
  PhotoCamera as CameraIcon,
  Close as RemoveIcon,
} from "@mui/icons-material";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";

export interface ReceiptCaptureValue {
  url: string;
  storage_path: string;
}

export interface ReceiptCaptureProps {
  label: string;
  value: ReceiptCaptureValue | null;
  onChange: (next: ReceiptCaptureValue | null) => void;
  folder: string;
  bucket?: string;
  accept?: string;
  disabled?: boolean;
}

export function ReceiptCapture({
  label,
  value,
  onChange,
  folder,
  bucket = "work-updates",
  accept = "image/*",
  disabled = false,
}: ReceiptCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${folder}/${safeName}`;
      const { url } = await hardenedUpload({ bucket, path, file });
      onChange({ url, storage_path: path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split("/")[1] ?? "png";
          const file = new File([blob], `pasted.${ext}`, { type: imageType });
          await upload(file);
          return;
        }
      }
      setError("No image in clipboard");
    } catch {
      setError("Clipboard read not allowed");
    }
  };

  const filename = value
    ? value.storage_path.split("/").pop() ?? "attached"
    : null;

  return (
    <Box>
      <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      {value ? (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            p: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          <Box
            component="img"
            src={value.url}
            alt={label}
            sx={{ width: 40, height: 40, objectFit: "cover", borderRadius: 0.5 }}
          />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {filename}
          </Typography>
          <IconButton
            size="small"
            aria-label="remove"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <ButtonGroup variant="outlined" size="small" disabled={disabled || busy}>
          <Tooltip title="Upload file">
            <Button
              aria-label="file"
              onClick={() => fileInputRef.current?.click()}
              startIcon={busy ? <CircularProgress size={14} /> : <FileIcon fontSize="small" />}
            >
              File
            </Button>
          </Tooltip>
          <Tooltip title="Paste from clipboard">
            <Button aria-label="paste" onClick={handlePaste} startIcon={<PasteIcon fontSize="small" />}>
              Paste
            </Button>
          </Tooltip>
          <Tooltip title="Take photo">
            <Button
              aria-label="camera"
              onClick={() => cameraInputRef.current?.click()}
              startIcon={<CameraIcon fontSize="small" />}
            >
              Camera
            </Button>
          </Tooltip>
        </ButtonGroup>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={accept}
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
```

If `hardenedUpload`'s exact return shape (e.g., property name `url` vs `publicUrl`) differs from the assumption here, adjust at this step — read `src/lib/storage/uploadHelpers.ts` to confirm before saving.

- [ ] **Step 4: Run the tests, verify they pass**

```bash
npm test -- src/components/common/ReceiptCapture.test.tsx
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ReceiptCapture.tsx src/components/common/ReceiptCapture.test.tsx
git commit -m "feat(common): add ReceiptCapture primitive with file/paste/camera"
```

---

## Task B: Database migration — schema, RLS, RPCs

**Files:**
- Create: `supabase/migrations/20260524100000_spot_purchase_schema.sql`

- [ ] **Step 1: Read existing schema files to confirm column lists**

Read once to confirm assumptions before composing the migration:

```bash
# Confirm vendors columns
```

Use Grep and Read:
- `Grep` for `CREATE TABLE.*vendors\b` in `supabase/migrations/00000000000000_initial_schema.sql` (or wherever defined). Confirm: at minimum `name text`, `vendor_type text`, `accepts_cash boolean`, `created_at timestamptz`.
- `Grep` for `CREATE TABLE.*materials\b` similarly. Confirm: `name text`, `category_id uuid`, `unit text`, `created_at timestamptz`.
- `Grep` for `CREATE TABLE.*stock_transactions\b`. Note the columns it expects (likely `material_id`, `quantity`, `transaction_type`, `site_id`, `unit_cost`, `reference_id`).
- `Grep` for any trigger function named like `update_stock_inventory_on_material_purchase` — if it doesn't exist for `material_purchase_expenses`, we'll wire stock increments inside the new RPC body instead of relying on triggers.

This step is read-only and adjusts the SQL in step 2 to match exact column names. Time-box: 5 minutes.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260524100000_spot_purchase_schema.sql`. Substitute exact column names found in Step 1 where bracketed `[…]` appears.

```sql
-- Spot Purchase flow — schema, RLS, RPCs
--
-- Adds 'spot' as a third value for material_purchase_expenses.purchase_type,
-- introduces is_draft flag on materials + vendors so supervisors can quick-add
-- off-catalog rows that office reviews later, adds bill_url to misc_expenses
-- (it already has proof_url; we keep proof_url for payment screenshot and
-- add bill_url for the bill image), and creates the two-stage allocation
-- table for group-purchase deferred reconciliation.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Extend purchase_type CHECK constraint
-- ----------------------------------------------------------------------------

ALTER TABLE material_purchase_expenses
  DROP CONSTRAINT IF EXISTS material_purchase_expenses_purchase_type_check;
ALTER TABLE material_purchase_expenses
  ADD CONSTRAINT material_purchase_expenses_purchase_type_check
    CHECK (purchase_type IN ('own_site', 'group_stock', 'spot'));

COMMENT ON COLUMN material_purchase_expenses.purchase_type IS
  'own_site | group_stock | spot — spot = supervisor walk-in purchase, no MR/PO, always engineer_wallet';

-- ----------------------------------------------------------------------------
-- 2. is_draft flags
-- ----------------------------------------------------------------------------

ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE vendors   ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_materials_is_draft ON materials(is_draft) WHERE is_draft = true;
CREATE INDEX IF NOT EXISTS idx_vendors_is_draft   ON vendors(is_draft)   WHERE is_draft = true;

COMMENT ON COLUMN materials.is_draft IS
  'true = quick-added by site engineer during a spot purchase; needs office review.';
COMMENT ON COLUMN vendors.is_draft IS
  'true = quick-added by site engineer during a spot purchase; needs office review.';

-- ----------------------------------------------------------------------------
-- 3. Add bill_url to misc_expenses (proof_url stays for payment screenshot)
-- ----------------------------------------------------------------------------

ALTER TABLE misc_expenses ADD COLUMN IF NOT EXISTS bill_url text;
COMMENT ON COLUMN misc_expenses.bill_url IS
  'Bill/invoice image; proof_url remains as the payment screenshot column.';

-- ----------------------------------------------------------------------------
-- 4. Two-stage allocation table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS spot_purchase_allocations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES material_purchase_expenses(id) ON DELETE CASCADE,
  site_id      uuid NOT NULL REFERENCES sites(id),
  percentage   numeric(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  is_final     boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_spa_unfinal ON spot_purchase_allocations(batch_id) WHERE is_final = false;

ALTER TABLE spot_purchase_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY spa_select ON spot_purchase_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM material_purchase_expenses mpe
      WHERE mpe.id = spot_purchase_allocations.batch_id
        AND can_access_site(mpe.site_id)
    )
  );

-- Inserts/updates only through RPCs (SECURITY DEFINER).
CREATE POLICY spa_no_direct_write ON spot_purchase_allocations FOR ALL
  USING (false) WITH CHECK (false);

COMMENT ON TABLE spot_purchase_allocations IS
  'Two-stage allocation for spot purchases bought for a site group. Provisional rows (is_final=false) capture supervisor''s initial guess at purchase time; finalize_spot_purchase_allocation RPC locks them and mirrors into inter_site_material_settlements.';

-- ----------------------------------------------------------------------------
-- 5. RLS gate on material_purchase_expenses (parallel to 20260509130000 PO gate)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can insert material purchases for accessible sites"
  ON material_purchase_expenses;

CREATE POLICY material_purchase_expenses_insert ON material_purchase_expenses
  FOR INSERT WITH CHECK (
    get_user_role() = ANY(ARRAY['admin','office'])
    OR (
      get_user_role() = 'site_engineer'
      AND purchase_type = 'spot'
      AND payment_channel = 'engineer_wallet'
      AND can_access_site(site_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 6. RLS gate on materials + vendors — site_engineer can insert ONLY drafts
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS materials_insert ON materials;
CREATE POLICY materials_insert ON materials FOR INSERT
  WITH CHECK (
    get_user_role() = ANY(ARRAY['admin','office'])
    OR (get_user_role() = 'site_engineer' AND is_draft = true)
  );

DROP POLICY IF EXISTS vendors_insert ON vendors;
CREATE POLICY vendors_insert ON vendors FOR INSERT
  WITH CHECK (
    get_user_role() = ANY(ARRAY['admin','office'])
    OR (get_user_role() = 'site_engineer' AND is_draft = true)
  );

-- ----------------------------------------------------------------------------
-- 7. RPC — record_spot_purchase (single atomic transaction)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_spot_purchase(payload jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_id           uuid;
  v_site_group_id     uuid;
  v_vendor_id         uuid;
  v_batch_id          uuid;
  v_ref_code          text;
  v_purchase_type     text;
  v_total             numeric;
  v_payment_mode      text;
  v_item              jsonb;
  v_material_id       uuid;
  v_qty               numeric;
  v_rate              numeric;
  v_alloc             jsonb;
  v_engineer_tx_id    uuid;
BEGIN
  v_site_id       := (payload->>'site_id')::uuid;
  v_purchase_type := COALESCE(payload->>'allocation_mode', 'own_site');
  v_total         := (payload->>'total_amount')::numeric;
  v_payment_mode  := COALESCE(payload->>'payment_mode', 'cash');

  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'total_amount must be > 0';
  END IF;

  -- 'group' means purchase_type='spot' but with site_group_id set.
  IF v_purchase_type = 'group' THEN
    SELECT site_group_id INTO v_site_group_id FROM sites WHERE id = v_site_id;
    IF v_site_group_id IS NULL THEN
      RAISE EXCEPTION 'site is not in a group; cannot allocate';
    END IF;
  END IF;

  -- Vendor
  IF (payload->'vendor') ? 'id' THEN
    v_vendor_id := (payload->'vendor'->>'id')::uuid;
  ELSE
    INSERT INTO vendors (name, vendor_type, accepts_cash, is_draft, created_at)
    VALUES (
      payload->'vendor'->>'name',
      'individual',
      true,
      true,
      now()
    )
    RETURNING id INTO v_vendor_id;
  END IF;

  -- Ref code (timestamp-based; site-scoped)
  v_ref_code := 'SPOT-' || to_char(now(), 'YYMMDD') || '-' ||
                substr(md5(random()::text || v_site_id::text), 1, 5);

  -- Insert the batch
  INSERT INTO material_purchase_expenses (
    site_id, ref_code, purchase_type, vendor_id, vendor_name, purchase_date,
    total_amount, payment_mode, payment_screenshot_url, bill_url,
    is_paid, paid_date, status, payment_channel, site_group_id,
    notes, created_by
  ) VALUES (
    v_site_id, v_ref_code, 'spot', v_vendor_id,
    COALESCE((payload->'vendor'->>'name'), NULL),
    COALESCE((payload->>'purchase_date')::date, CURRENT_DATE),
    v_total, v_payment_mode,
    payload->>'payment_screenshot_url',
    payload->>'bill_url',
    true, CURRENT_DATE, 'completed', 'engineer_wallet',
    v_site_group_id,
    payload->>'notes',
    auth.uid()
  ) RETURNING id INTO v_batch_id;

  -- Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    v_qty  := (v_item->>'qty')::numeric;
    v_rate := (v_item->>'rate')::numeric;

    IF v_item ? 'material_id' THEN
      v_material_id := (v_item->>'material_id')::uuid;
    ELSE
      INSERT INTO materials (name, category_id, unit, is_draft, created_at)
      VALUES (
        v_item->'new_material'->>'name',
        (v_item->'new_material'->>'category_id')::uuid,
        COALESCE(v_item->'new_material'->>'unit', 'pc'),
        true,
        now()
      )
      RETURNING id INTO v_material_id;
    END IF;

    -- Line item — column list must match material_purchase_expense_items
    -- (the executing subagent should verify with a quick Grep before saving)
    INSERT INTO material_purchase_expense_items (
      expense_id, material_id, quantity, unit_price, total_price
    ) VALUES (
      v_batch_id, v_material_id, v_qty, v_rate, v_qty * v_rate
    );

    -- price_history row for every line — full record of paid rates
    INSERT INTO price_history (material_id, vendor_id, unit_price, source, recorded_at)
    VALUES (v_material_id, v_vendor_id, v_rate, 'spot_purchase', now());

    -- Stock increment — write a stock_transactions row of type 'purchase'.
    -- If existing trigger on stock_transactions cascades to stock_inventory /
    -- group_stock_inventory, this is enough. Otherwise the executing subagent
    -- adds a direct UPSERT block here (see verification point 4).
    INSERT INTO stock_transactions (
      site_id, material_id, transaction_type, quantity, unit_cost,
      reference_type, reference_id, created_at
    ) VALUES (
      v_site_id, v_material_id, 'purchase', v_qty, v_rate,
      'material_purchase_expense', v_batch_id, now()
    );
  END LOOP;

  -- Wallet debit through the canonical spend RPC
  v_engineer_tx_id := atomic_record_wallet_spend(
    auth.uid(),
    v_site_id,
    v_total,
    CURRENT_DATE,
    v_payment_mode,
    payload->>'payment_screenshot_url',
    'Spot purchase ' || v_ref_code,
    COALESCE(payload->>'recorded_by_name', ''),
    auth.uid(),
    'Spot purchase ' || v_ref_code
  );

  UPDATE material_purchase_expenses
     SET engineer_transaction_id = v_engineer_tx_id
   WHERE id = v_batch_id;

  -- Provisional group allocation (optional)
  IF v_purchase_type = 'group' AND payload ? 'provisional_split' THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(payload->'provisional_split') LOOP
      INSERT INTO spot_purchase_allocations (batch_id, site_id, percentage, is_final)
      VALUES (
        v_batch_id,
        (v_alloc->>'site_id')::uuid,
        (v_alloc->>'percentage')::numeric,
        false
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'ref_code', v_ref_code,
    'vendor_id', v_vendor_id,
    'engineer_transaction_id', v_engineer_tx_id
  );
END $$;

GRANT EXECUTE ON FUNCTION record_spot_purchase(jsonb) TO authenticated;

COMMENT ON FUNCTION record_spot_purchase(jsonb) IS
  'Atomic spot-purchase entry: creates draft vendor/material if needed, inserts material_purchase_expenses + items, writes stock_transactions, debits engineer wallet, optionally records provisional group allocation.';

-- ----------------------------------------------------------------------------
-- 8. RPC — finalize_spot_purchase_allocation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION finalize_spot_purchase_allocation(
  p_batch_id     uuid,
  p_allocations  jsonb  -- [{ site_id, percentage }, ...]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum     numeric;
  v_alloc   jsonb;
  v_now     timestamptz := now();
BEGIN
  -- Validate sum to 100
  SELECT COALESCE(SUM((value->>'percentage')::numeric), 0)
    INTO v_sum
    FROM jsonb_array_elements(p_allocations);
  IF abs(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'percentages must sum to 100 (got %)', v_sum;
  END IF;

  -- Clear existing rows for this batch (provisional + any prior finalized)
  DELETE FROM spot_purchase_allocations WHERE batch_id = p_batch_id;

  -- Insert final rows
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    INSERT INTO spot_purchase_allocations (
      batch_id, site_id, percentage, is_final, finalized_at, finalized_by
    ) VALUES (
      p_batch_id,
      (v_alloc->>'site_id')::uuid,
      (v_alloc->>'percentage')::numeric,
      true,
      v_now,
      auth.uid()
    );
  END LOOP;

  -- Mirror into inter_site_material_settlements for downstream pipeline.
  -- Exact column list verified by executing subagent — schema reused from
  -- existing useInterSiteSettlements callers; if column names differ, this
  -- block is the only adjustment needed.
  INSERT INTO inter_site_material_settlements (
    source_batch_id, beneficiary_site_id, percentage, amount, status, created_at
  )
  SELECT
    p_batch_id,
    spa.site_id,
    spa.percentage,
    mpe.total_amount * spa.percentage / 100,
    'pending',
    v_now
  FROM spot_purchase_allocations spa
  JOIN material_purchase_expenses mpe ON mpe.id = spa.batch_id
  WHERE spa.batch_id = p_batch_id AND spa.is_final = true;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'finalized', true);
END $$;

GRANT EXECUTE ON FUNCTION finalize_spot_purchase_allocation(uuid, jsonb) TO authenticated;

COMMIT;
```

- [ ] **Step 3: Reset local DB to apply the migration**

```bash
npm run db:reset
```

Expected: migration applies cleanly; seed completes.

If the `inter_site_material_settlements` column names differ from what the RPC mirrors into, adjust the INSERT in step 2 and re-run.

If the `material_purchase_expense_items` column list differs (e.g., `qty` instead of `quantity`), adjust and re-run.

- [ ] **Step 4: Smoke-test the RPC directly via SQL**

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT record_spot_purchase('{
  \"site_id\": \"$(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tA -c "SELECT id FROM sites LIMIT 1")\",
  \"allocation_mode\": \"own_site\",
  \"total_amount\": 490,
  \"payment_mode\": \"cash\",
  \"vendor\": {\"name\": \"Test Walk-in Shop\"},
  \"items\": [
    {\"new_material\": {\"name\": \"Test Binding Wire\", \"unit\": \"roll\"}, \"qty\": 5, \"rate\": 98}
  ]
}'::jsonb);"
```

Expected: returns a jsonb with `batch_id`, `ref_code`, `vendor_id`. Subsequent `SELECT * FROM material_purchase_expenses WHERE ref_code = '<the ref>'` shows the row.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/20260524100000_spot_purchase_schema.sql
git commit -m "feat(spot-purchase): schema, RLS, record/finalize RPCs"
```

---

## Task C: TypeScript types

**Files:**
- Modify: `src/types/material.types.ts`

- [ ] **Step 1: Add new types and extend existing**

Open `src/types/material.types.ts` and append at the end (before any final `export {}`):

```ts
// ---------- Spot Purchase ----------

export type PurchaseType = "own_site" | "group_stock" | "spot";

export interface SpotPurchaseAllocation {
  id: string;
  batch_id: string;
  site_id: string;
  percentage: number;
  is_final: boolean;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpotPurchaseItemInput {
  material_id?: string;
  new_material?: { name: string; category_id?: string; unit: string };
  qty: number;
  rate: number;
}

export interface SpotPurchaseVendorInput {
  id?: string;
  name?: string;
}

export interface SpotPurchasePayload {
  site_id: string;
  allocation_mode: "own_site" | "group";
  total_amount: number;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque" | "credit";
  vendor: SpotPurchaseVendorInput;
  items: SpotPurchaseItemInput[];
  bill_url?: string | null;
  payment_screenshot_url?: string | null;
  provisional_split?: Array<{ site_id: string; percentage: number }>;
  notes?: string;
  purchase_date?: string;
}

export interface SpotPurchaseResult {
  batch_id: string;
  ref_code: string;
  vendor_id: string;
  engineer_transaction_id: string;
}
```

Find the `Material` interface in the same file and add:

```ts
  is_draft?: boolean;
```

Find the `Vendor` interface and add:

```ts
  is_draft?: boolean;
```

Find any existing `purchase_type` field on `MaterialPurchaseExpense` (or equivalent) — if typed as a literal union, extend it to also include `"spot"`.

- [ ] **Step 2: Run typecheck**

```bash
npm run build
```

If build complains about missing `is_draft` on some object literal, that's a downstream call site that wasn't filling in the optional — leave it; new fields are optional.

Expected: build succeeds (or fails only with the consumers we add in later tasks).

- [ ] **Step 3: Commit**

```bash
git add src/types/material.types.ts
git commit -m "feat(types): spot purchase + draft flags on Material/Vendor"
```

---

## Task D: useSpotPurchases hook

**Files:**
- Create: `src/hooks/queries/useSpotPurchases.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/queries/useSpotPurchases.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type {
  SpotPurchaseAllocation,
  SpotPurchasePayload,
  SpotPurchaseResult,
} from "@/types/material.types";

const UNFINAL_KEY = (siteGroupId: string | null) =>
  ["spot-purchases", "unallocated", siteGroupId] as const;

export function useCreateSpotPurchase() {
  const qc = useQueryClient();
  return useMutation<SpotPurchaseResult, Error, SpotPurchasePayload>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.rpc("record_spot_purchase", { payload });
      if (error) throw error;
      return data as SpotPurchaseResult;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["stock-inventory", variables.site_id] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      qc.invalidateQueries({ queryKey: ["spot-purchases"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
  });
}

export interface UnallocatedSpotBatch {
  batch_id: string;
  ref_code: string;
  purchase_date: string;
  total_amount: number;
  remaining_qty: number | null;
  age_days: number;
}

export function useUnallocatedSpotBatches(siteGroupId: string | null | undefined) {
  return useQuery({
    queryKey: UNFINAL_KEY(siteGroupId ?? null),
    enabled: !!siteGroupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_purchase_expenses")
        .select(
          `id, ref_code, purchase_date, total_amount, site_group_id,
           spot_purchase_allocations!inner(is_final),
           group_stock_inventory:group_stock_inventory!batch_ref(remaining_quantity)`
        )
        .eq("purchase_type", "spot")
        .eq("site_group_id", siteGroupId)
        .eq("spot_purchase_allocations.is_final", false);

      if (error) throw error;
      const today = Date.now();
      return (data ?? [])
        .map((row) => {
          const ageDays = Math.floor(
            (today - new Date(row.purchase_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            batch_id: row.id,
            ref_code: row.ref_code,
            purchase_date: row.purchase_date,
            total_amount: Number(row.total_amount),
            remaining_qty: null, // refined when group_stock_inventory link is resolved
            age_days: ageDays,
          } satisfies UnallocatedSpotBatch;
        })
        .filter((b) => b.age_days >= 7 || (b.remaining_qty ?? 0) <= 0);
    },
  });
}

export function useFinalizeSpotPurchaseAllocation() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { batchId: string; allocations: Array<{ site_id: string; percentage: number }> }
  >({
    mutationFn: async ({ batchId, allocations }) => {
      const { error } = await supabase.rpc("finalize_spot_purchase_allocation", {
        p_batch_id: batchId,
        p_allocations: allocations,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spot-purchases"] });
      qc.invalidateQueries({ queryKey: ["inter-site-settlements"] });
    },
  });
}

export function useBatchAllocations(batchId: string | null | undefined) {
  return useQuery({
    queryKey: ["spot-purchase-allocations", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spot_purchase_allocations")
        .select("*")
        .eq("batch_id", batchId);
      if (error) throw error;
      return (data ?? []) as SpotPurchaseAllocation[];
    },
  });
}
```

The `group_stock_inventory:group_stock_inventory!batch_ref(remaining_quantity)` join syntax assumes the FK is named after the batch ref; if it isn't (e.g., the join column is `batch_ref` not `batch_id`), simplify the query by fetching `material_purchase_expenses` first and a second query for `group_stock_inventory` keyed by `ref_code`. The executing subagent verifies which FK exists and adjusts.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/queries/useSpotPurchases.ts
git commit -m "feat(hooks): useSpotPurchases (create/finalize/unallocated/allocations)"
```

---

## Task E: SpotPurchaseForm component

**Files:**
- Create: `src/components/materials/SpotPurchaseForm.tsx`

- [ ] **Step 1: Implement the form**

Create `src/components/materials/SpotPurchaseForm.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Close as RemoveIcon } from "@mui/icons-material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useVendors } from "@/hooks/queries/useVendors";
import { useEngineerWallet } from "@/hooks/queries/useEngineerWallet";
import { useGroupSiteMembers } from "@/hooks/queries/useGroupSiteMembers";
import { ReceiptCapture, type ReceiptCaptureValue } from "@/components/common/ReceiptCapture";
import { useCreateSpotPurchase } from "@/hooks/queries/useSpotPurchases";
import type { SpotPurchaseItemInput, SpotPurchasePayload } from "@/types/material.types";
import { RateUpdatePromptDialog } from "./RateUpdatePromptDialog";

interface FormItem extends SpotPurchaseItemInput {
  uid: string;
  catalogRate?: number;
}

const newRow = (): FormItem => ({ uid: crypto.randomUUID(), qty: 1, rate: 0 });

export function SpotPurchaseForm() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id ?? "";
  const siteGroupId = selectedSite?.site_group_id ?? null;

  const { data: materials = [] } = useMaterials();
  const { data: vendors = [] } = useVendors();
  const { data: walletBalance = 0 } = useEngineerWallet(userProfile?.id, siteId);
  const { data: groupMembers = [] } = useGroupSiteMembers(siteGroupId);

  const [vendor, setVendor] = useState<{ id?: string; name: string } | null>(null);
  const [vendorInput, setVendorInput] = useState("");
  const [allocationMode, setAllocationMode] = useState<"own_site" | "group">("own_site");
  const [items, setItems] = useState<FormItem[]>([newRow()]);
  const [bill, setBill] = useState<ReceiptCaptureValue | null>(null);
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [provisionalSplit, setProvisionalSplit] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi">("cash");
  const [postSubmitRatePrompt, setPostSubmitRatePrompt] = useState<
    { items: { material_id: string; name: string; paid: number; catalog: number }[]; batchId: string } | null
  >(null);

  const create = useCreateSpotPurchase();

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0),
    [items]
  );

  const splitSum = useMemo(
    () => Object.values(provisionalSplit).reduce((a, b) => a + (Number(b) || 0), 0),
    [provisionalSplit]
  );

  const canSubmit =
    !!siteId &&
    !!vendor &&
    items.length > 0 &&
    items.every((it) => it.qty > 0 && it.rate > 0 && (it.material_id || it.new_material?.name)) &&
    total > 0 &&
    (allocationMode === "own_site" ||
      Object.keys(provisionalSplit).length === 0 ||
      Math.abs(splitSum - 100) < 0.01);

  const submit = async () => {
    if (!canSubmit || !vendor) return;
    const payload: SpotPurchasePayload = {
      site_id: siteId,
      allocation_mode: allocationMode,
      total_amount: total,
      payment_mode: paymentMode,
      vendor: vendor.id ? { id: vendor.id } : { name: vendor.name },
      items: items.map((it) => {
        if (it.material_id) {
          return { material_id: it.material_id, qty: Number(it.qty), rate: Number(it.rate) };
        }
        return {
          new_material: it.new_material!,
          qty: Number(it.qty),
          rate: Number(it.rate),
        };
      }),
      bill_url: bill?.url ?? null,
      payment_screenshot_url: screenshot?.url ?? null,
      provisional_split:
        allocationMode === "group" && Object.keys(provisionalSplit).length > 0
          ? Object.entries(provisionalSplit).map(([site_id, percentage]) => ({
              site_id,
              percentage: Number(percentage),
            }))
          : undefined,
    };

    const result = await create.mutateAsync(payload);

    // Post-submit rate prompt: any line where paid rate differs from the
    // material's last catalog rate. Lookups happen against the items array
    // we already have; catalogRate was set when each material was picked.
    const mismatches = items
      .filter(
        (it) =>
          it.material_id &&
          it.catalogRate !== undefined &&
          Math.abs(it.rate - it.catalogRate) >= 0.01
      )
      .map((it) => ({
        material_id: it.material_id!,
        name: materials.find((m) => m.id === it.material_id)?.name ?? "—",
        paid: Number(it.rate),
        catalog: Number(it.catalogRate),
      }));

    if (mismatches.length > 0) {
      setPostSubmitRatePrompt({ items: mismatches, batchId: result.batch_id });
    } else {
      router.push("/site/today");
    }
  };

  return (
    <Stack spacing={2.5} sx={{ p: 2 }}>
      {/* Vendor */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Vendor</Typography>
        <Autocomplete
          freeSolo
          options={vendors}
          getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
          value={vendor ?? null}
          onChange={(_e, val) => {
            if (!val) return setVendor(null);
            if (typeof val === "string") return setVendor({ name: val });
            setVendor({ id: val.id, name: val.name });
          }}
          inputValue={vendorInput}
          onInputChange={(_e, v) => setVendorInput(v)}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search vendor or new shop name…"
              size="small"
            />
          )}
          noOptionsText={
            vendorInput
              ? `Will create new shop "${vendorInput}" on submit`
              : "Type a shop name"
          }
        />
      </Card>

      {/* Allocation mode (only if site is in a group) */}
      {siteGroupId && (
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Buying for</Typography>
          <RadioGroup
            row
            value={allocationMode}
            onChange={(_e, val) => setAllocationMode(val as "own_site" | "group")}
          >
            <FormControlLabel value="own_site" control={<Radio size="small" />} label="This site only" />
            <FormControlLabel value="group" control={<Radio size="small" />} label={`Group (${groupMembers.length} sites)`} />
          </RadioGroup>
          <Collapse in={allocationMode === "group"}>
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Provisional split (optional). You can finalize later.
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {groupMembers.map((s) => (
                  <Stack key={s.id} direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ flex: 1 }}>{s.name}</Typography>
                    <TextField
                      size="small"
                      type="number"
                      placeholder="%"
                      value={provisionalSplit[s.id] ?? ""}
                      onChange={(e) =>
                        setProvisionalSplit((prev) => ({
                          ...prev,
                          [s.id]: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value),
                        }))
                      }
                      InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                      sx={{ width: 100 }}
                    />
                  </Stack>
                ))}
                {Object.keys(provisionalSplit).length > 0 && (
                  <Typography
                    variant="caption"
                    color={Math.abs(splitSum - 100) < 0.01 ? "success.main" : "warning.main"}
                  >
                    {splitSum.toFixed(1)}% {Math.abs(splitSum - 100) < 0.01 ? "✓" : `— needs to sum to 100`}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Collapse>
        </Card>
      )}

      {/* Items */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Items</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setItems((p) => [...p, newRow()])}>
            Add item
          </Button>
        </Stack>
        <Stack spacing={1.5} divider={<Divider />}>
          {items.map((item, idx) => (
            <Stack key={item.uid} direction="row" spacing={1} alignItems="flex-start">
              <Box sx={{ flex: 1 }}>
                <Autocomplete
                  freeSolo
                  options={materials}
                  getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
                  value={item.material_id ? materials.find((m) => m.id === item.material_id) ?? null : item.new_material?.name ?? null}
                  onChange={(_e, val) => {
                    setItems((prev) => prev.map((p, i) => {
                      if (i !== idx) return p;
                      if (!val) return { ...p, material_id: undefined, new_material: undefined, catalogRate: undefined };
                      if (typeof val === "string") return { ...p, material_id: undefined, new_material: { name: val, unit: "pc" } };
                      return { ...p, material_id: val.id, new_material: undefined, catalogRate: val.last_purchase_rate ?? undefined };
                    }));
                  }}
                  renderInput={(params) => <TextField {...params} placeholder="Material" size="small" />}
                />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    label="Qty"
                    type="number"
                    size="small"
                    value={item.qty}
                    onChange={(e) =>
                      setItems((p) => p.map((it, i) => (i === idx ? { ...it, qty: Number(e.target.value) } : it)))
                    }
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="Rate"
                    type="number"
                    size="small"
                    value={item.rate}
                    onChange={(e) =>
                      setItems((p) => p.map((it, i) => (i === idx ? { ...it, rate: Number(e.target.value) } : it)))
                    }
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    sx={{ width: 130 }}
                  />
                  <Box sx={{ flex: 1, textAlign: "right" }}>
                    <Typography variant="body2">
                      ₹{((Number(item.qty) || 0) * (Number(item.rate) || 0)).toFixed(2)}
                    </Typography>
                  </Box>
                </Stack>
                {item.catalogRate !== undefined && Math.abs(item.rate - item.catalogRate) >= 0.01 && (
                  <Typography variant="caption" color="warning.main">
                    last paid ₹{item.catalogRate.toFixed(2)} · {item.rate > item.catalogRate ? "↑" : "↓"}₹
                    {Math.abs(item.rate - item.catalogRate).toFixed(2)}
                  </Typography>
                )}
              </Box>
              <IconButton
                size="small"
                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                disabled={items.length === 1}
              >
                <RemoveIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      </Card>

      {/* Receipts */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <ReceiptCapture
            label="Bill image (optional)"
            value={bill}
            onChange={setBill}
            folder={`bills/${siteId}`}
          />
          <ReceiptCapture
            label="Payment screenshot (optional)"
            value={screenshot}
            onChange={setScreenshot}
            folder={`screenshots/${siteId}`}
          />
        </Stack>
      </Card>

      {/* Payment */}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="baseline">
            <Typography variant="subtitle2" sx={{ flex: 1 }}>Total</Typography>
            <Typography variant="h6">₹{total.toFixed(2)}</Typography>
          </Stack>
          <Stack direction="row" alignItems="baseline">
            <Typography variant="caption" sx={{ flex: 1 }}>Engineer wallet</Typography>
            <Typography
              variant="caption"
              color={walletBalance - total < 0 ? "warning.main" : "text.secondary"}
            >
              ₹{walletBalance.toFixed(2)} → ₹{(walletBalance - total).toFixed(2)}
              {walletBalance - total < 0 && " (overdraft)"}
            </Typography>
          </Stack>
          <FormControl>
            <RadioGroup
              row
              value={paymentMode}
              onChange={(_e, val) => setPaymentMode(val as "cash" | "upi")}
            >
              <FormControlLabel value="cash" control={<Radio size="small" />} label="Cash" />
              <FormControlLabel value="upi" control={<Radio size="small" />} label="UPI" />
            </RadioGroup>
          </FormControl>
        </Stack>
      </Card>

      {create.error && (
        <Alert severity="error">{(create.error as Error).message}</Alert>
      )}

      <Button
        variant="contained"
        size="large"
        disabled={!canSubmit || create.isPending}
        onClick={submit}
      >
        {create.isPending ? "Recording…" : "Record purchase"}
      </Button>

      {postSubmitRatePrompt && (
        <RateUpdatePromptDialog
          batchId={postSubmitRatePrompt.batchId}
          items={postSubmitRatePrompt.items}
          onClose={() => {
            setPostSubmitRatePrompt(null);
            router.push("/site/today");
          }}
        />
      )}
    </Stack>
  );
}
```

Verify during impl: `useEngineerWallet`, `useGroupSiteMembers` exact signatures; `Material.last_purchase_rate` field name (may be `current_price` or via `vendor_inventory`). Adjust the `catalogRate` lookup to the actual source.

- [ ] **Step 2: Typecheck**

```bash
npm run build
```

Fix any type errors inline. Most likely fixes are around the hook return types — adjust the destructuring to match.

- [ ] **Step 3: Commit**

```bash
git add src/components/materials/SpotPurchaseForm.tsx
git commit -m "feat(spot-purchase): supervisor form (vendor + items + receipts)"
```

---

## Task F: RateUpdatePromptDialog

**Files:**
- Create: `src/components/materials/RateUpdatePromptDialog.tsx`

- [ ] **Step 1: Implement**

Create `src/components/materials/RateUpdatePromptDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItem,
  Stack,
  Typography,
} from "@mui/material";
import { supabase } from "@/lib/supabase/client";

interface PromptItem {
  material_id: string;
  name: string;
  paid: number;
  catalog: number;
}

export function RateUpdatePromptDialog({
  batchId,
  items,
  onClose,
}: {
  batchId: string;
  items: PromptItem[];
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = async () => {
    if (checked.size === 0) return onClose();
    setSaving(true);
    try {
      const updates = items
        .filter((it) => checked.has(it.material_id))
        .map((it) => ({ id: it.material_id, current_price: it.paid }));
      // vendor_inventory.current_price update path: this codebase routes through
      // the vendor catalog. If a single-row update API exists, use it; otherwise
      // upsert into vendor_inventory keyed on (vendor_id, material_id).
      for (const u of updates) {
        await supabase
          .from("vendor_inventory")
          .update({ current_price: u.current_price })
          .eq("material_id", u.id);
      }
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Update standard rate?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1 }}>
          You paid different prices than the catalog rate. Tick lines whose new rate should become the standard.
        </Typography>
        <List dense>
          {items.map((it) => (
            <ListItem key={it.material_id} disableGutters>
              <FormControlLabel
                control={
                  <Checkbox checked={checked.has(it.material_id)} onChange={() => toggle(it.material_id)} />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{it.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Catalog ₹{it.catalog.toFixed(2)} → Paid ₹{it.paid.toFixed(2)}
                    </Typography>
                  </Stack>
                }
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Skip</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? "Saving…" : `Update ${checked.size} rate${checked.size === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

If `vendor_inventory` is keyed on `(vendor_id, material_id)` (composite) rather than `material_id` alone, the executing subagent passes both fields. Read `useVendorCatalog` or similar to confirm the exact upsert call site.

- [ ] **Step 2: Commit**

```bash
git add src/components/materials/RateUpdatePromptDialog.tsx
git commit -m "feat(spot-purchase): post-submit rate update prompt"
```

---

## Task G: Page route

**Files:**
- Create: `src/app/(main)/site/spot-purchase/page.tsx`

- [ ] **Step 1: Add the page shell**

Create `src/app/(main)/site/spot-purchase/page.tsx`:

```tsx
"use client";

import { Box, IconButton, Stack, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { SpotPurchaseForm } from "@/components/materials/SpotPurchaseForm";

export default function SpotPurchasePage() {
  const router = useRouter();
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Stack direction="row" alignItems="center" sx={{ p: 2 }} spacing={1}>
        <IconButton onClick={() => router.back()} size="small">
          <ArrowBack />
        </IconButton>
        <Typography variant="h6">Bought at shop</Typography>
      </Stack>
      <SpotPurchaseForm />
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(main)/site/spot-purchase/page.tsx
git commit -m "feat(spot-purchase): /site/spot-purchase route"
```

---

## Task H: /site/today integration — 4th tile + allocation chip

**Files:**
- Modify: `src/app/(main)/site/today/page.tsx`

- [ ] **Step 1: Add new imports + tile + chip**

Open `src/app/(main)/site/today/page.tsx`. Apply these edits:

After the existing `LowStockIcon` import, add:

```tsx
import {
  ShoppingCart as BoughtIcon,
  Splitscreen as SplitIcon,
} from "@mui/icons-material";
import { useUnallocatedSpotBatches } from "@/hooks/queries/useSpotPurchases";
```

After `const { data: stockItems = [] } = useSiteStock(siteId);` add:

```tsx
const siteGroupId = selectedSite?.site_group_id ?? null;
const { data: unallocated = [] } = useUnallocatedSpotBatches(siteGroupId);
```

In the `tiles: TileSpec[]` array, add a new entry before the closing `]`:

```tsx
    {
      label: "Bought at shop",
      description: "Recorded purchase you already paid for",
      href: "/site/spot-purchase",
      icon: <BoughtIcon sx={{ fontSize: 36 }} />,
      accent: "primary",
    },
```

Inside the chip Stack (after the low-stock chip), add:

```tsx
{siteGroupId && unallocated.length > 0 && (
  <Chip
    icon={<SplitIcon />}
    label={`${unallocated.length} batch${unallocated.length === 1 ? "" : "es"} need allocation`}
    color="warning"
    variant="filled"
    onClick={() => router.push("/site/spot-purchase?tab=allocations")}
    clickable
  />
)}
```

(The `?tab=allocations` query is consumed by Task I; alternative: navigate to `/site/inventory?tab=group`. Pick whichever is in place when this task executes.)

- [ ] **Step 2: Visual smoke**

`npm run dev:cloud`, log in via `/dev-login`, navigate to `/site/today`. Verify 4 tiles appear and the new chip renders if there are any unallocated spot batches in the demo data.

- [ ] **Step 3: Commit**

```bash
git add src/app/(main)/site/today/page.tsx
git commit -m "feat(site-today): bought-at-shop tile + allocation chip"
```

---

## Task I: SpotPurchaseAllocatorDialog

**Files:**
- Create: `src/components/materials/SpotPurchaseAllocatorDialog.tsx`

- [ ] **Step 1: Implement**

Create `src/components/materials/SpotPurchaseAllocatorDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useGroupSiteMembers } from "@/hooks/queries/useGroupSiteMembers";
import {
  useBatchAllocations,
  useFinalizeSpotPurchaseAllocation,
} from "@/hooks/queries/useSpotPurchases";

export function SpotPurchaseAllocatorDialog({
  batchId,
  refCode,
  totalAmount,
  siteGroupId,
  onClose,
}: {
  batchId: string;
  refCode: string;
  totalAmount: number;
  siteGroupId: string;
  onClose: () => void;
}) {
  const { data: members = [] } = useGroupSiteMembers(siteGroupId);
  const { data: existing = [] } = useBatchAllocations(batchId);
  const [split, setSplit] = useState<Record<string, number>>({});
  const finalize = useFinalizeSpotPurchaseAllocation();

  useEffect(() => {
    if (existing.length > 0) {
      const next: Record<string, number> = {};
      existing.forEach((a) => { next[a.site_id] = Number(a.percentage); });
      setSplit(next);
    } else if (members.length > 0) {
      const even = Number((100 / members.length).toFixed(2));
      const next: Record<string, number> = {};
      members.forEach((m, i) => {
        next[m.id] = i === members.length - 1
          ? Number((100 - even * (members.length - 1)).toFixed(2))
          : even;
      });
      setSplit(next);
    }
  }, [members, existing]);

  const sum = Object.values(split).reduce((a, b) => a + (Number(b) || 0), 0);
  const ok = Math.abs(sum - 100) < 0.01;

  const save = async () => {
    await finalize.mutateAsync({
      batchId,
      allocations: Object.entries(split).map(([site_id, percentage]) => ({
        site_id,
        percentage: Number(percentage),
      })),
    });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Finalize allocation — {refCode}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Total ₹{totalAmount.toFixed(2)} · once finalized, this split locks and reconciliation rows are created.
        </Typography>
        <Stack spacing={1.5}>
          {members.map((m) => (
            <Stack key={m.id} direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" sx={{ flex: 1 }}>{m.name}</Typography>
              <TextField
                size="small"
                type="number"
                value={split[m.id] ?? ""}
                onChange={(e) =>
                  setSplit((p) => ({ ...p, [m.id]: Number(e.target.value) }))
                }
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                sx={{ width: 110 }}
              />
              <Typography variant="caption" sx={{ width: 90, textAlign: "right" }}>
                ₹{((totalAmount * (split[m.id] ?? 0)) / 100).toFixed(2)}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Typography variant="caption" color={ok ? "success.main" : "warning.main"} sx={{ display: "block", mt: 2 }}>
          {sum.toFixed(2)}% {ok ? "✓" : " — must sum to 100"}
        </Typography>
        {finalize.error && <Alert severity="error" sx={{ mt: 2 }}>{(finalize.error as Error).message}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!ok || finalize.isPending}>
          {finalize.isPending ? "Saving…" : "Finalize"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the dialog into the spot-purchase page via a tab**

Modify `src/app/(main)/site/spot-purchase/page.tsx` to read `?tab=allocations` and render an `UnallocatedBatchesList` that opens the allocator per row:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Card, IconButton, Stack, Tab, Tabs, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { SpotPurchaseForm } from "@/components/materials/SpotPurchaseForm";
import { SpotPurchaseAllocatorDialog } from "@/components/materials/SpotPurchaseAllocatorDialog";
import { useUnallocatedSpotBatches } from "@/hooks/queries/useSpotPurchases";

export default function SpotPurchasePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { selectedSite } = useSelectedSite();
  const siteGroupId = selectedSite?.site_group_id ?? null;
  const initialTab = params.get("tab") === "allocations" ? "allocations" : "new";
  const [tab, setTab] = useState<"new" | "allocations">(initialTab);
  const { data: unallocated = [] } = useUnallocatedSpotBatches(siteGroupId);
  const [openBatch, setOpenBatch] = useState<{
    batchId: string;
    refCode: string;
    totalAmount: number;
  } | null>(null);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Stack direction="row" alignItems="center" sx={{ p: 2 }} spacing={1}>
        <IconButton onClick={() => router.back()} size="small">
          <ArrowBack />
        </IconButton>
        <Typography variant="h6">Bought at shop</Typography>
      </Stack>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="fullWidth">
        <Tab value="new" label="New purchase" />
        <Tab value="allocations" label={`Allocations (${unallocated.length})`} />
      </Tabs>
      {tab === "new" && <SpotPurchaseForm />}
      {tab === "allocations" && (
        <Stack spacing={1.5} sx={{ p: 2 }}>
          {unallocated.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              All group purchases have been finalized.
            </Typography>
          ) : (
            unallocated.map((b) => (
              <Card key={b.batch_id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{b.ref_code}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      ₹{b.total_amount.toFixed(2)} · {b.age_days}d old
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() =>
                      setOpenBatch({
                        batchId: b.batch_id,
                        refCode: b.ref_code,
                        totalAmount: b.total_amount,
                      })
                    }
                  >
                    Allocate
                  </Button>
                </Stack>
              </Card>
            ))
          )}
        </Stack>
      )}
      {openBatch && siteGroupId && (
        <SpotPurchaseAllocatorDialog
          batchId={openBatch.batchId}
          refCode={openBatch.refCode}
          totalAmount={openBatch.totalAmount}
          siteGroupId={siteGroupId}
          onClose={() => setOpenBatch(null)}
        />
      )}
    </Box>
  );
}
```

This supersedes the simpler version added in Task G — overwrite that file.

- [ ] **Step 3: Commit**

```bash
git add src/components/materials/SpotPurchaseAllocatorDialog.tsx src/app/\(main\)/site/spot-purchase/page.tsx
git commit -m "feat(spot-purchase): allocator dialog + Allocations tab on /site/spot-purchase"
```

---

## Task J: Retrofit ReceiptCapture into SettleViaWalletDialog

**Files:**
- Modify: `src/components/payments/SettleViaWalletDialog.tsx`

- [ ] **Step 1: Read the current file**

```bash
# Run Read on src/components/payments/SettleViaWalletDialog.tsx
# (about 200-400 lines typically)
```

Note its existing prop shape — specifically: does it currently take a `proofUrl`/`onProofChange` pair, or are the bill/screenshot URLs maintained inside the dialog as local state and pushed to the parent only on confirm?

- [ ] **Step 2: Add two ReceiptCapture slots**

Inside the dialog body (between the existing fields and the submit button), add:

```tsx
import { ReceiptCapture, type ReceiptCaptureValue } from "@/components/common/ReceiptCapture";
// at the top, alongside existing imports

// inside the component body, near existing useState calls:
const [bill, setBill] = useState<ReceiptCaptureValue | null>(null);
const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);

// in the JSX, before the action buttons:
<Stack spacing={1.5} sx={{ mt: 2 }}>
  <ReceiptCapture
    label="Bill image (optional)"
    value={bill}
    onChange={setBill}
    folder={`bills/${siteId}`}
  />
  <ReceiptCapture
    label="Payment screenshot (optional)"
    value={screenshot}
    onChange={setScreenshot}
    folder={`screenshots/${siteId}`}
  />
</Stack>
```

In the dialog's submit handler, include `bill_url: bill?.url ?? null` and `payment_screenshot_url: screenshot?.url ?? null` in the payload passed to the consumer. If the dialog exposes an `onConfirm` callback today, extend its TypeScript signature to accept these two optional fields. Every existing caller already has matching DB columns (`bill_url`, `payment_screenshot_url` exist on `material_purchase_expenses`; for `misc_expenses` we add `bill_url` in Task B and keep `proof_url` for the screenshot — adjust per-caller mapping).

- [ ] **Step 3: Visual smoke + commit**

`npm run dev:cloud`, trigger one of the SettleViaWalletDialog callers (e.g., MestriSettleDialog), verify the two slots render and paste-from-clipboard works.

```bash
git add src/components/payments/SettleViaWalletDialog.tsx
git commit -m "feat(payments): bill + screenshot capture inside SettleViaWalletDialog"
```

---

## Task K: Retrofit ReceiptCapture into Material settle dialog

**Files:**
- Modify: the file that imports `useSettleMaterialPurchase`

- [ ] **Step 1: Locate the file**

```bash
# Grep for the consumer of useSettleMaterialPurchase
```

Use Grep:

```
pattern: useSettleMaterialPurchase
glob: src/components/**/*.tsx
output_mode: files_with_matches
```

Read the file. It typically lives somewhere like `src/components/materials/MaterialPaymentDialog.tsx` or `…/PurchasePaymentDialog.tsx`.

- [ ] **Step 2: Add ReceiptCapture slots**

Apply the same pattern as Task J:

```tsx
import { ReceiptCapture, type ReceiptCaptureValue } from "@/components/common/ReceiptCapture";

const [bill, setBill] = useState<ReceiptCaptureValue | null>(null);
const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);

// in JSX before action buttons:
<Stack spacing={1.5} sx={{ mt: 2 }}>
  <ReceiptCapture
    label="Bill image (optional)"
    value={bill}
    onChange={setBill}
    folder={`bills/${siteId}`}
  />
  <ReceiptCapture
    label="Payment screenshot (optional)"
    value={screenshot}
    onChange={setScreenshot}
    folder={`screenshots/${siteId}`}
  />
</Stack>
```

In the submit handler, pass `bill_url` and `payment_screenshot_url` into the `useSettleMaterialPurchase` mutation params. These columns already exist on `material_purchase_expenses`.

- [ ] **Step 3: Visual smoke + commit**

```bash
git add <the file you modified>
git commit -m "feat(materials): bill + screenshot capture in material settlement"
```

---

## Task L: Retrofit ReceiptCapture into Misc-expense settle dialog

**Files:**
- Modify: the misc-expense settle dialog (path resolved at task start)
- Note: Task B's migration adds `bill_url` to `misc_expenses`; this task wires it up

- [ ] **Step 1: Locate the file**

```
pattern: useSettleMiscExpense|misc_expenses.*settle|MiscExpenseSettle
glob: src/components/**/*.tsx
output_mode: files_with_matches
```

If not found, check `src/components/expenses/` for files referencing `misc_expenses` table writes.

- [ ] **Step 2: Add slots, wiring bill_url and proof_url**

```tsx
import { ReceiptCapture, type ReceiptCaptureValue } from "@/components/common/ReceiptCapture";

const [bill, setBill] = useState<ReceiptCaptureValue | null>(null);
const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);

// in JSX before action buttons:
<Stack spacing={1.5} sx={{ mt: 2 }}>
  <ReceiptCapture
    label="Bill image (optional)"
    value={bill}
    onChange={setBill}
    folder={`bills/${siteId}`}
  />
  <ReceiptCapture
    label="Payment screenshot (optional)"
    value={screenshot}
    onChange={setScreenshot}
    folder={`screenshots/${siteId}`}
  />
</Stack>
```

In the submit handler, pass `bill_url: bill?.url ?? null` AND `proof_url: screenshot?.url ?? null` (note: misc_expenses uses `proof_url` for the screenshot — keep the existing column for backward compat).

- [ ] **Step 3: Update the TS type for MiscExpense input**

In whichever file defines the misc-expense input shape (likely `src/hooks/queries/useMiscExpenses.ts`), add `bill_url?: string | null` to the mutation input type and the insert column list.

- [ ] **Step 4: Visual smoke + commit**

```bash
git add <files modified>
git commit -m "feat(expenses): bill + screenshot capture for misc expenses"
```

---

## Task M: Office surfaces (chip, drafts filter, dashboard row)

**Files:**
- Modify: `src/app/(main)/company/expenses/page.tsx`
- Modify: `src/app/(main)/company/materials/page.tsx`
- Modify: `src/app/(main)/company/vendors/page.tsx`
- Modify (or create): SQL that extends `get_company_daily_peek`

- [ ] **Step 1: SPOT chip on /company/expenses**

Open `src/app/(main)/company/expenses/page.tsx`. Locate where individual expense rows are rendered (search for the row component or the data table). For rows whose `module === 'material'` AND whose `material_purchase_expenses.purchase_type === 'spot'`, render a small chip next to the reference number:

```tsx
{row.purchase_type === "spot" && (
  <Chip label="SPOT" size="small" color="info" variant="outlined" sx={{ ml: 1 }} />
)}
```

If `v_all_expenses` doesn't currently expose `purchase_type` to the page, add it: the executing subagent reads the view definition (the snippet around line 411 of `20260108200000_misc_expenses.sql` shows the misc UNION; the material section is elsewhere — extend its SELECT to also pull `mpe.purchase_type`).

Add a filter dropdown option:

```tsx
{/* In the existing filter dropdown */}
<MenuItem value="spot">Spot purchases only</MenuItem>
```

Wire it to filter the data by `purchase_type === "spot"`.

- [ ] **Step 2: Drafts filter chip on /company/materials**

Open `src/app/(main)/company/materials/page.tsx`. Add a count chip and filter toggle:

```tsx
const draftCount = useMemo(() => materials.filter((m) => m.is_draft).length, [materials]);
const [showDraftsOnly, setShowDraftsOnly] = useState(false);

// In the toolbar:
<Chip
  label={`Drafts (${draftCount})`}
  color={showDraftsOnly ? "primary" : "default"}
  variant={showDraftsOnly ? "filled" : "outlined"}
  onClick={() => setShowDraftsOnly((v) => !v)}
  clickable
/>

// In the displayed materials list:
const visible = showDraftsOnly ? materials.filter((m) => m.is_draft) : materials;
```

Add an inline "Approve" or "Un-draft" action: edit a draft row's `is_draft` field to `false`. Use the existing material-edit mutation if it accepts arbitrary field updates.

- [ ] **Step 3: Same pattern on /company/vendors**

Apply the same chip + filter + un-draft action on `src/app/(main)/company/vendors/page.tsx`.

- [ ] **Step 4: Extend get_company_daily_peek**

Locate the RPC:

```
Grep pattern: CREATE OR REPLACE FUNCTION.*get_company_daily_peek
```

Open the file. Add to the SELECT (or the JSON result it returns):

```sql
-- inside the existing function body, add to the result aggregation:
'spot_purchase_count_today', (
  SELECT COUNT(*) FROM material_purchase_expenses
   WHERE purchase_type = 'spot' AND purchase_date = CURRENT_DATE
),
'spot_purchase_total_today', (
  SELECT COALESCE(SUM(total_amount), 0) FROM material_purchase_expenses
   WHERE purchase_type = 'spot' AND purchase_date = CURRENT_DATE
),
```

Write a new migration `supabase/migrations/20260524110000_daily_peek_spot_purchases.sql` containing the `CREATE OR REPLACE FUNCTION` with the extension applied; do NOT edit the original migration file.

Then surface the new fields on `/company/dashboard`:

```tsx
// In the daily peek card:
{peek.spot_purchase_count_today > 0 && (
  <Stack direction="row" justifyContent="space-between">
    <Typography variant="body2" color="text.secondary">Spot purchases</Typography>
    <Typography variant="body2">
      {peek.spot_purchase_count_today} · ₹{peek.spot_purchase_total_today.toLocaleString("en-IN")}
    </Typography>
  </Stack>
)}
```

- [ ] **Step 5: Run db:reset + visual smoke + commit**

```bash
npm run db:reset
npm run dev:cloud  # then visit /company/dashboard, /company/expenses, /company/materials, /company/vendors
```

```bash
git add src/app/\(main\)/company/expenses/page.tsx src/app/\(main\)/company/materials/page.tsx src/app/\(main\)/company/vendors/page.tsx supabase/migrations/20260524110000_daily_peek_spot_purchases.sql
git commit -m "feat(office): SPOT chip + drafts queue + dashboard row for spot purchases"
```

---

## Task N: End-to-end verification via Playwright

**Files:**
- None new — manual driving with Playwright MCP

- [ ] **Step 1: Catalog-only own_site spot buy**

`npm run dev:cloud`. Via Playwright MCP:
1. Navigate to `http://localhost:3000/dev-login` → auto-login.
2. Pick a site that has stock-managed materials.
3. Navigate `/site/today`. Verify 4 tiles present.
4. Tap "Bought at shop". Pick existing vendor (e.g. ARM Build Mart), pick existing material (e.g. Tata Binding Wire), qty 5, rate matching catalog. Paste a sample bill image from clipboard.
5. Tap "Record purchase". Expect redirect to `/site/today` with success toast.
6. Verify via Supabase MCP `mcp__supabase__execute_sql`:
   ```sql
   SELECT ref_code, purchase_type, payment_channel, is_paid, total_amount, bill_url
     FROM material_purchase_expenses
    WHERE purchase_type = 'spot'
    ORDER BY created_at DESC LIMIT 1;
   ```
7. Verify stock incremented:
   ```sql
   SELECT material_id, current_qty FROM stock_inventory
    WHERE site_id = '<site-id>' AND material_id = '<binding-wire-id>';
   ```
8. Verify wallet debit:
   ```sql
   SELECT id, amount, transaction_type FROM site_engineer_transactions
    WHERE engineer_id = '<user-id>' ORDER BY created_at DESC LIMIT 1;
   ```
9. Verify allocation rows in `engineer_wallet_spend_allocations`:
   ```sql
   SELECT * FROM engineer_wallet_spend_allocations
    WHERE spend_id = '<the-tx-id>';
   ```

- [ ] **Step 2: Rate mismatch prompt**

Repeat (1) but use a rate higher than the material's catalog/last-purchase rate. After tapping "Record purchase", expect `RateUpdatePromptDialog` to open. Tick a line, tap "Update". Verify `vendor_inventory.current_price` changed and `price_history` has the new entry.

- [ ] **Step 3: Quick-add vendor + material**

Type a brand-new vendor name (e.g. "Test Shop X") and a brand-new material name (e.g. "Test Wire X") in the pickers; both via the freeSolo path. Submit. Verify:
```sql
SELECT name, is_draft FROM vendors WHERE name = 'Test Shop X';
SELECT name, is_draft FROM materials WHERE name = 'Test Wire X';
```
Both should return `is_draft = true`. Visit `/company/materials` and `/company/vendors`; toggle the Drafts filter and verify both rows appear.

- [ ] **Step 4: Group purchase + finalize**

Use a site that has `site_group_id` set. Toggle "Group", enter 60/30/10 across 3 sites. Submit. Verify:
```sql
SELECT site_id, percentage, is_final FROM spot_purchase_allocations
 WHERE batch_id = '<the-batch>';
```
All rows `is_final = false` with the entered percentages.

Force-age the batch:
```sql
UPDATE material_purchase_expenses SET purchase_date = CURRENT_DATE - INTERVAL '8 days'
 WHERE id = '<the-batch>';
```

Reload `/site/today`. Verify "1 batch needs allocation" chip appears.

Tap chip → open allocator → adjust to 70/20/10 → Finalize. Verify rows now `is_final = true` and `inter_site_material_settlements` has 3 mirror rows.

- [ ] **Step 5: Overdraft path**

Drain wallet via existing wallet-debit flow until balance is around ₹50. Submit a spot purchase whose total is ₹490. Verify it goes through (no block) and wallet balance is now negative.

- [ ] **Step 6: Retrofit smoke**

Open any caller of `SettleViaWalletDialog` (mestri settlement is easiest). Verify two ReceiptCapture slots render. Paste an image into each. Submit the settlement. Verify the parent row's `bill_url` and `payment_screenshot_url` (or `proof_url`) columns are populated.

Repeat for the material settle dialog (settle a spot purchase with bill+screenshot upload during the settlement, even though spot purchases are already settled — pick a non-spot expense if needed).

Repeat for the misc-expense settle dialog. Verify both `bill_url` and `proof_url` are populated.

- [ ] **Step 7: RLS spot-check as site_engineer**

Open Supabase Studio (or `psql` with the anon key impersonating a site_engineer). Attempt:

```sql
-- as site_engineer
INSERT INTO material_purchase_expenses (site_id, ref_code, purchase_type, vendor_id, purchase_date, total_amount, payment_channel)
VALUES ('<assigned-site>', 'TEST-1', 'own_site', NULL, CURRENT_DATE, 100, 'direct');
-- expect: violates RLS

INSERT INTO material_purchase_expenses (..., purchase_type, payment_channel) VALUES (..., 'spot', 'direct');
-- expect: violates RLS

INSERT INTO material_purchase_expenses (..., purchase_type, payment_channel) VALUES (..., 'spot', 'engineer_wallet');
-- expect: success

INSERT INTO materials (name, unit, is_draft) VALUES ('Test', 'pc', false);
-- expect: violates RLS

INSERT INTO materials (name, unit, is_draft) VALUES ('Test', 'pc', true);
-- expect: success
```

- [ ] **Step 8: Console + screenshots per CLAUDE.md**

Playwright screenshot, in this order:
1. `/site/today` showing 4 tiles + chips (with at least one unallocated chip if possible)
2. `/site/spot-purchase` form on mobile viewport (375px wide)
3. The rate-prompt dialog
4. The allocator dialog
5. A retrofitted `SettleViaWalletDialog` with both slots filled

After each navigation, call `playwright_console_logs` and resolve any warnings before commit.

- [ ] **Step 9: Final commit (if any cleanup was needed)**

If verification revealed bugs that needed fixes, commit them separately:

```bash
git add <files>
git commit -m "fix(spot-purchase): <specific issue from verification>"
```

---

## Self-Review Checklist (run before handoff)

- [ ] Spec coverage: every locked decision in the spec maps to at least one task above.
- [ ] No placeholder text remains. Every code block is complete.
- [ ] Type names are consistent across tasks (`SpotPurchasePayload`, `SpotPurchaseResult`, `ReceiptCaptureValue`).
- [ ] Migration file is one self-contained transaction (`BEGIN; … COMMIT;`).
- [ ] All retrofit tasks point at concrete file locations (resolved via Grep at task start).
- [ ] All tasks end with a commit step.

## Move-to-prod note

When the user eventually says "move to prod", this feature requires migrations `20260524100000_spot_purchase_schema.sql` AND `20260524110000_daily_peek_spot_purchases.sql` applied via `mcp__supabase__apply_migration` BEFORE pushing the Next.js code (per CLAUDE.md Step 3 ordering). The Cloudflare Worker is unaffected — no `cloudflare-proxy/` changes in this feature.
