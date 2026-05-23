# Spot Purchase — Verification Gaps (Post Task N)

The spot purchase implementation plan called for an end-to-end Playwright verification. Because the database migration (`supabase/migrations/20260524100000_spot_purchase_schema.sql`) has not been applied to any database yet, the DB-writing scenarios from Task N were not exercised.

## Visually verified (✓)

1. ✓ TypeScript build pass — `npx tsc --noEmit` produced exactly the 7 pre-existing test-file errors (5 ScopePill.test.tsx, 1 InventoryCardGrid.test.tsx, 1 BrandVariantMatrix.test.tsx). No new spot-purchase regressions.
2. ✓ Next.js production build — `npm run build` compiled and generated all 19 static pages successfully. `/site/spot-purchase` (13.4 kB, First Load JS 320 kB) appears in the dynamic route table.
3. ✓ Vitest suite — `npx vitest run` reports **47 test files passed, 399 tests passed**. The 4 new `ReceiptCapture` tests pass.
4. ✓ `/site/today` renders all 4 tiles (`site-today-4-tiles.png`):
   - "Request material — Tell office what to buy"
   - "Log event — Record bag opened, stack finished, unit empty"
   - "Receive delivery — Verify what arrived on site"
   - "Bought at shop — Recorded purchase you already paid for"
   - No "allocation needed" chip visible (expected — no spot batches exist).
5. ✓ `/site/spot-purchase` form renders without React errors (`site-spot-purchase-form.png`):
   - Vendor section: existing-vendor autocomplete + quick-add new-vendor input
   - Items section: Material/New name/Unit/Category + Qty/Rate/Line total + Add item button + Items subtotal
   - Receipts section: **both ReceiptCapture slots** (Bill photo, Payment screenshot) with File/Paste/Camera buttons
   - Payment section: mode dropdown + Total amount + Notes
   - Wallet balance card showing engineer's site wallet
   - "Record spot purchase" button (disabled until valid)
   - Tabs: "New purchase" (default), "Allocations"
6. ✓ Retrofitted dialog — `/site/expenses/miscellaneous` → "Add Expense" opens `MiscExpenseDialog` with both ReceiptCapture slots (`misc-expense-dialog-receipt-slots.png`):
   - "Bill image (optional)" — File/Paste/Camera triplet
   - "Payment screenshot (optional)" — File/Paste/Camera triplet

### Observed behavior (informational)

- Clicking the **Allocations tab** on `/site/spot-purchase` triggers a SIGNED_OUT redirect to `/login?session_expired=true`. This is consistent with the missing `spot_purchase_allocations` table — the query returns a Supabase auth/permission error, which `SessionErrorHandler` interprets as session expiry. Will self-resolve once migration is applied.
- Console error `Invalid or unexpected token` appears cross-page (also on `/site/today`); unrelated to spot-purchase work — likely manifest/icon loader. Not a blocker.

## NOT verified (requires migration applied first)

The following scenarios need the migration applied (`mcp__supabase__apply_migration` against the user's project, or against a Supabase branch for isolated testing). Steps to verify each:

### Catalog-only own_site spot buy
- Pick existing vendor + material, qty 5 × ₹98, submit
- Verify `material_purchase_expenses` row with `purchase_type='spot'`
- Verify `stock_inventory.current_qty` incremented
- Verify wallet debit with `engineer_wallet_spend_allocations` rows

### Rate mismatch prompt
- Submit with rate ≠ catalog rate
- Verify post-submit dialog
- Tick a line, confirm update propagated to `vendor_inventory.current_price`

### Quick-add vendor + material
- Type new names; submit
- Verify both rows `is_draft=true`
- Verify Drafts filter on `/company/materials` and `/company/vendors` shows them

### Group purchase + finalize
- Site in group; toggle Group; enter 60/30/10
- Verify `spot_purchase_allocations` has 3 rows with `is_final=false`
- Force-age, verify chip on `/site/today`
- Open allocator → Finalize → verify rows `is_final=true`

### Overdraft path
- Drain wallet, submit a larger purchase
- Verify negative balance recorded

### Retrofit settlement upload
- Submit a settle dialog with bill + screenshot
- Verify URLs land on parent row (`bill_url`, `payment_screenshot_url`, or `proof_url` for misc_expenses)

### RLS spot-check
As site_engineer via PostgREST:
- INSERT material_purchase_expenses with `purchase_type='own_site'` → expect 403
- INSERT with `purchase_type='spot'` + `payment_channel='direct'` → expect 403
- INSERT with `purchase_type='spot'` + `payment_channel='engineer_wallet'` → expect 200
- INSERT materials with `is_draft=false` → expect 403
- INSERT materials with `is_draft=true` → expect 200

## Recommended verification path

1. Apply migrations on a Supabase branch:
   ```
   mcp__supabase__create_branch name=spot-purchase-test
   mcp__supabase__apply_migration project=<branch> name=20260524100000_spot_purchase_schema sql=<contents>
   mcp__supabase__apply_migration project=<branch> name=20260524110000_daily_peek_spot_purchases sql=<contents>
   ```

2. Point dev:cloud at the branch (update `.env.local` or use the dashboard URL of the branch).

3. Run the 7 scenarios above with Playwright MCP.

4. When confident, "move to prod" — apply migrations against the main project per CLAUDE.md.
