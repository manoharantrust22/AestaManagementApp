# Spot Purchase — Design Context

A self-contained briefing for designers and engineers thinking about the broader "we enter material" redesign. Describes what the `/site/spot-purchase` flow does, why it exists, who uses it, and how it composes with the rest of the materials system.

## The problem

The construction company's standard material flow is **Material Request → Approval → Purchase Order → Delivery Verification → Vendor Settlement**. It assumes:

- A site needs material ahead of time (request)
- An office reviewer approves quantity + spend
- A PO goes to a vendor who delivers by truck
- A receiver verifies what arrived
- A settlement clears the vendor's invoice later

This pipeline is correctly heavy for the dominant case — truckloads of cement, steel, jalli, sand. It is **completely wrong** for the small-quantity urgent walk-in case:

> A site supervisor at the Srinivasan House & Shop site realizes the masons need binding wire **now** to keep working. He walks 200m to ARM Build Mart, picks up 5 rolls off the shelf for ₹490, pays cash from his wallet, and is back at site in 15 minutes.

Forcing that supervisor through the 5-step pipeline is either:
- A bureaucratic blockade (he can't do it because office approval would take hours), or
- A lie (he pretends to request → approve → PO → deliver after the fact, polluting every audit trail with fake timestamps).

Spot Purchase is the **honest, low-ceremony path for material that's already in his hand by the time he opens the app.**

## The user

A site engineer ("supervisor") on `/site/today`. The journey:

1. (Off-screen) Walks to a nearby shop. Picks small material off the shelf — binding wire, hand tools, fasteners, small repair parts. Pays at the counter, cash or UPI, from money the company has already credited to his engineer wallet.
2. (Off-screen) Returns to site with the goods and a paper bill (and maybe a UPI screenshot on WhatsApp).
3. Opens the app, taps the 4th tile on `/site/today` — "Bought at shop".
4. Fills in vendor, line items (material + qty + paid rate), attaches the bill image, attaches the UPI screenshot if applicable, taps Record.
5. Total entry time target: **under 30 seconds for the happy path**.

Notably, **everything happens after the purchase**. There is no "I want to buy" mode. The form is post-facto.

## What's intentionally different from the standard flow

| Standard MR/PO flow | Spot Purchase |
|--|--|
| Office must approve before purchase | No approval step at all |
| Vendor invoices the company; settled later | Supervisor pays at the counter from his wallet |
| Inventory increments when delivery is verified | Inventory increments at submit time |
| Material + vendor must already be in catalog | Either can be quick-added inline as a draft |
| Multi-day cycle from request to inventory | Single screen, one submit |
| Audit lives in MR + PO + delivery + settlement chain | Audit lives in one `material_purchase_expenses` row tagged `purchase_type='spot'` |

## Key design decisions (locked, with rationale)

1. **Wallet-only spend.** Supervisor pays via his engineer wallet. There is no "direct site cash" escape hatch on this form. Reason: the company-wide rule says site engineers must spend only via wallet so payer-source attribution stays clean (see Engineer Wallet Source Attribution Phases 1–4 already in production). Cash vs UPI is recorded as `payment_mode`, but the money path is always wallet.

2. **Overdraft allowed.** Wallet may go negative. Consistent with other wallet-channel settlement flows that allow overdraft. Office sees the negative balance via existing oversight surfaces; no special block.

3. **Quick-add catalog entries, flagged for review.** A supervisor at a new shop with an unfamiliar item should not be blocked. The vendor picker and material picker both accept free-text entries → on submit they're inserted with `is_draft=true`. Office reviews drafts in a separate queue on `/company/materials` and `/company/vendors`.

4. **Receipts are always optional.** Bill image and UPI screenshot can be attached, never required. This avoids penalizing supervisors at shops with no printed bills (the codebase already models `vendors.bill_policy = 'no_bills'` for such shops).

5. **Paid rate ≠ catalog rate is normal and recorded honestly.** Whatever the supervisor paid (e.g., ₹98) is the rate stored on the line and added to `price_history`. The vendor's standard catalog rate (`vendor_inventory.current_price`, e.g., ₹95) is NOT auto-updated. After submit, a small dialog asks the supervisor if any of the differing rates should become the new standard — per-line, opt-in.

6. **Group-stock allocation is deferred and provisional-then-final.** When a supervisor at a site that belongs to a group buys for the group, he MAY enter a provisional % split immediately (his best guess of how much each member site will consume). The split can be edited any time before being finalized. A chip on `/site/today` ("N batches need allocation") nudges him to finalize once the material has been consumed or 7 days have passed. Finalization writes a `is_final=true` row in `spot_purchase_allocations` and is the authoritative split for inter-site cost reconciliation.

7. **No daily consumption tracking for small items.** Asking a supervisor to log "0.4 kg of binding wire used today on the foundation" is unrealistic. The form does not collect or imply per-day consumption. Group purchases reconcile at the batch level via the provisional → final lifecycle above.

8. **One atomic RPC.** All side effects (draft creation, expense row, items, price history, stock upsert, stock transaction, wallet debit, provisional allocations) happen inside a single `record_spot_purchase(payload jsonb)` SECURITY DEFINER function. Either all succeed or all roll back — no orphaned inventory, no half-applied wallet debits.

## Place in the information architecture

- **Entry point:** 4th tile on `/site/today`, labeled "Bought at shop". The supervisor's daily landing page already showed three tiles (Request material, Log event, Receive delivery); this becomes the post-facto counterpart to "Request material".

- **Page:** `/site/spot-purchase` with two tabs:
  - `?tab=new` — the entry form (default)
  - `?tab=allocations` — list of unfinalized group-stock spot batches needing % confirmation. Each row opens an allocator dialog.

- **Companion chip:** on `/site/today`, when the site is in a group AND there are unfinalized batches that are >= 7 days old OR have 0 remaining quantity, a yellow chip appears: "N batches need allocation". Tapping it deep-links to `/site/spot-purchase?tab=allocations`.

- **Office surfaces** (`/company/*` pages):
  - `/company/materials` and `/company/vendors` — a "Drafts (N)" filter chip; office can review and "Approve" (un-draft) inline.
  - `/company/dashboard` daily peek — shows today's spot purchase count and ₹ total.

## Form anatomy (single page, mobile-first)

Sections, in order:

1. **Vendor** — autocomplete from existing vendors. Free-text triggers "Will create new shop 'X' on submit" hint.

2. **Buying for** (visible only when site is in a group, i.e. `sites.site_group_id` is not null) — radio: "This site only" (default) or "Group (N sites)". Selecting Group reveals a collapsible "Provisional split (optional)" panel listing each group-member site with a % field; the panel shows live sum and warns if ≠ 100. Leaving every field blank is allowed — the supervisor can allocate later.

3. **Items** (repeater, default 1 row, "+ Add item" appends) — per row:
   - Material picker (autocomplete; free-text triggers new-material mini-dialog: name, category, unit)
   - Quantity (numeric)
   - Paid rate (numeric, ₹ prefix)
   - Live line subtotal
   - Optional hint when paid rate differs from last-known catalog rate (e.g., "last paid ₹95 · ↑₹3")

4. **Receipts** — two slots:
   - "Bill image (optional)" — bill photo
   - "Payment screenshot (optional)" — UPI / cash receipt screenshot
   
   Each slot is a `<ReceiptCapture/>` instance offering three input methods: file picker, paste-from-clipboard, take photo via camera. (Paste is important — supervisors typically have the UPI screenshot in their phone's clipboard after sending it on WhatsApp.)

5. **Totals + Payment** — running total, current wallet balance, projected post-spend balance (warns if negative — but does not block). Radio for `cash` vs `upi` (metadata only; both still wallet-debit). Disabled "Record purchase" button until vendor + at least one valid item + total > 0.

6. **Post-submit, conditional:** if any paid rate diverged from the vendor's catalog rate, a `RateUpdatePromptDialog` opens listing the lines, with a per-line "Update standard rate to ₹X?" checkbox and a "Skip / Update N rates" footer. Confirming updates `vendor_inventory.current_price` for each ticked line. Either way, the new `price_history` row was already written by the RPC; this dialog only affects the "standard" rate.

## Composition with the rest of the system

- **Inventory.** Spot purchases write a `stock_transactions` row of type `'purchase'` and upsert `stock_inventory.current_qty` (recomputing `avg_unit_cost` weighted by quantity). Group purchases write to `group_stock_inventory` instead.

- **Wallet attribution (existing Phase 2 work).** The RPC calls `atomic_record_wallet_spend(...)` which writes a `site_engineer_transactions` row AND proportionally splits the spend across active payer-source pools in `engineer_wallet_spend_allocations`. No new wallet-side code was needed — spot purchases inherit the existing attribution mechanic for free.

- **Inter-site cost reconciliation.** Finalized spot-purchase group allocations live in `spot_purchase_allocations` (new table). The mirror INSERT into the legacy `inter_site_material_settlements` table was intentionally NOT wired — that table has a different shape (settlement_code, from/to_site_id, weekly periods) suitable for weekly batched reconciliation, not per-batch percentage splits. If cross-site weekly reports want spot data, they can query `spot_purchase_allocations` directly. Documented in the migration header.

- **`v_all_expenses` view.** The new `purchase_type='spot'` rows show up in this unified expense view via the existing `material_purchase_expenses` UNION branch. They render in `/company/expenses` (if such a page is later built) and the per-site Expenses page alongside MR/PO-based purchases.

- **`<ReceiptCapture/>` primitive.** Built for spot purchase, but also retrofitted into three existing settlement dialogs: `SettleViaWalletDialog`, `MaterialSettlementDialog`, `MiscExpenseDialog`. Lives in `src/components/common/ReceiptCapture.tsx`. Three input modes (file, paste, camera) + 10MB soft limit + always optional. Uses the existing `hardenedUpload` helper and the `work-updates` storage bucket with folder convention `bills/{siteId}` and `screenshots/{siteId}`.

## RLS / security gates

- **`material_purchase_expenses` INSERT** — site_engineer allowed ONLY when `purchase_type='spot'` AND `payment_channel='engineer_wallet'` AND the row's `site_id` is one they can access. Admin/office can insert any `purchase_type`. The `'own_site'` and `'group_stock'` paths remain admin/office-only.
- **`materials` INSERT** and **`vendors` INSERT** — site_engineer allowed ONLY when `is_draft=true`. Office can insert non-drafts (or un-draft existing rows).
- **`finalize_spot_purchase_allocation` RPC** — SECURITY DEFINER, but has an explicit `can_access_site` check on the batch's site_id before allowing finalization.

## What's out of scope (intentional, with reasoning)

- **AI ingestion of bills.** The codebase has `ContextPicker` and AI ingestion modes for quotations and invoices. Spot purchase deliberately ships the manual happy path first; AI bill parsing can be wired in later as a "Snap to fill" button.
- **Orphan storage cleanup.** When a supervisor attaches a receipt then removes it before submit, the uploaded blob in `work-updates` stays. Operational concern, not correctness; deferred.
- **Daily per-task consumption tracking.** Documented in design decisions #7 above.
- **Migrating existing manual catch-up purchases (already recorded as own_site).** Out of scope; only new entries go through this flow.
- **Equipment + rentals.** Spot purchase is materials-only. Equipment and rental flows have their own primitives.

## Known limitations and follow-ups (already documented in `docs/superpowers/specs/2026-05-23-spot-purchase-verification-gaps.md`)

- `SettleViaWalletDialog` shows two receipt slots after the retrofit, but the dialog's 3+ callers (processContractPayment, rentalSettle, contractSettle, mestriSettle) do NOT yet persist the URLs. The dialog has a yellow Alert disclosing this. Real wire-up is a follow-up.
- `MaterialSettlementDialog` advance-payment path drops `bill_url`.
- `SpotPurchaseAllocatorDialog` should defensively guard when opened with `siteGroupId=null`.
- All 7 DB-side scenarios (catalog spot buy, rate mismatch prompt, quick-add drafts, group finalize, overdraft, retrofit URL persistence, RLS spot-check) need a Supabase branch run before move-to-prod.

## Why this matters for the broader "we enter material" redesign

If you're rethinking how material gets entered into the system, this flow represents **the small / urgent / supervisor-driven slice of that surface**. The contrasts with the standard MR/PO flow (no approval, no delivery verification, post-facto entry, wallet-only payment, deferred allocation) are the design choices that make the small case feel honest.

Key questions the broader redesign should probably answer:

- Should "Bought at shop" become more discoverable than a tile? (e.g., a single unified "Enter material" page with three modes: Request, Receive, Bought)
- Should bill OCR/AI ingestion be the default entry mechanism, with manual fallback?
- Should the quick-add catalog drafts go through a more visible review queue (e.g., a unified "drafts" inbox at the company level)?
- How should group-stock allocation feel when stretched across many sites — does the chip nudge scale, or do supervisors need a calendar view of allocations due?
- Should the wallet-only constraint relax in cases where the supervisor truly paid from personal funds (e.g., emergency at midnight before wallet was topped up)? Today the rule is strict.

These are open questions; the spot-purchase flow as built is the baseline you're iterating from.

---

**For reference:**

- Implementation plan: `docs/superpowers/plans/2026-05-23-spot-purchase-and-receipt-capture.md`
- Verification gaps and migration-deploy notes: `docs/superpowers/specs/2026-05-23-spot-purchase-verification-gaps.md`
- Schema migration: `supabase/migrations/20260524100000_spot_purchase_schema.sql`
- Daily peek extension: `supabase/migrations/20260524110000_daily_peek_spot_purchases.sql`
- ReceiptCapture primitive: `src/components/common/ReceiptCapture.tsx`
- Supervisor form: `src/components/materials/SpotPurchaseForm.tsx`
- Page + allocator: `src/app/(main)/site/spot-purchase/page.tsx`, `src/components/materials/SpotPurchaseAllocatorDialog.tsx`
- Hooks: `src/hooks/queries/useSpotPurchases.ts`
- The `'spot'` purchase_type lives on `material_purchase_expenses` alongside the existing `'own_site'` and `'group_stock'` values.
