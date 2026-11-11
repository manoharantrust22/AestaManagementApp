# Procurement Gap Analysis: Bill-First Materials, Vendors and Assistant

Date: 2026-11-08. Scope: analysis only, no code changed. All paths are relative to the repo root.
Line numbers refer to the state of `main` at commit `e147d6ca`.

---

## 1. Executive summary

1. The backend is 100% Supabase Postgres and stays that way (decided: no Firebase). All schema proposals here are Postgres.
2. "Material-v2" is the Material Hub (`/site/materials/hub` and 3 sibling pages). It is a thread view over the v1 tables and reuses v1 dialogs, so v1 and v2 share one data model.
3. About 40% of the bill-first vision already exists in pieces: a bill-ingest pipeline (Zod schema, fuzzy material/vendor matching, atomic save RPC, price context), a real `price_history` table, an `amount_paid` "after bargaining" column, bill and payment-proof uploads, and a chat assistant with 34 read-only tools.
4. The big missing pieces are: in-app reading of the bill image (today the user copies a prompt into ChatGPT and pastes JSON back), a stored "document" record with duplicate detection, line-level units/GST/discount, material aliases, unit normalization, and any assistant tool that writes.
5. Your 12 sample bills show the hard parts: 5 document types, headers that lie ("Quotation" that is a sale), rates priced per sqft while quantity is in sheets, totals forced to round numbers, missing vendor names, and the same bill saved as different files (file-hash dedupe caught only 1 of 4 duplicate pairs).
6. There is no `company_id` on any procurement table and admin checks are stubbed to `true`. Multi-tenancy and a future online material marketplace (order online, delivered to site) come later, so every new table is designed company-ready now (see 5.3).
7. Recommendation: Option B, a "Bill Inbox" built on the existing AI-ingestion pipeline, writing into the existing purchase and price tables. It is additive, low risk to live data and does not block the Hub redesign.
8. Live prod check: 111 purchase bills, only 10 with a bill photo, 0 from the spot purchase form, 628 price rows, and 24 bills where more was paid than billed (₹33,206), so "paid" is hiding uncaptured charges.
9. Engineers skip the app because any glitch blocks them while the site keeps buying; entries are later redone as historical work. So capture must never block: snap the bill first, finish details later. First shippable phase: photo in, Gemini-parsed draft out, user confirms, original file kept and hashed. Then units/GST/aliases, payments, assistant reads, assistant writes, voice, bulk import, market events.

---

## 2. Inventory

### 2.1 Backend reality check

| Question | Finding | Evidence |
|---|---|---|
| Firebase / Firestore code | Not found | Case-insensitive search for `firebase` / `firestore` over the repo (excluding node_modules) returns 0 matches; `package.json` has no firebase dependency; `.env.local.example` has no Firebase keys |
| Supabase | Sole backend | `@supabase/supabase-js`, `@supabase/ssr` in `package.json`; 495 files in `supabase/migrations/` |
| Live DB vs migrations drift | Some, confirmed live on 2026-11-08 | `companies`, `company_members`, `company_invites`, `company_vendor_prices` exist in prod but are created by no migration; `local_purchases` is in the initial migration but absent in prod; `vendor_inventory` UNIQUE (vendor_id, material_id, brand_id) is enforced. See 2.12 |

Hari confirmed on 2026-11-08 that there is no Firebase migration; Supabase Postgres remains the backend. Every schema statement below is about Postgres.

### 2.2 Routes and pages

Navigation config: `src/components/layout/MainLayout.tsx` (v1 site group L214-269, Material-v2 group L270-300, company group L379-429). None of the material/vendor nav items carry `adminOnly` / `adminOrOffice` flags (filter at L653-660), so all roles see all of them.

| Route (under `src/app/(main)/`) | Purpose | Class | Evidence |
|---|---|---|---|
| `site/materials/page.tsx` | Materials overview tiles | v1 | nav L221 |
| `site/inventory/page.tsx` | Stock and usage tabs | v1 | nav L226 |
| `site/material-requests/page.tsx` | Request list, approve, convert to PO | v1 | nav L231 |
| `site/material-requests/[requestId]/page.tsx` | Request journey | v1 detail | linked from `src/components/materials/journey/JourneyHeader.tsx:101` |
| `site/purchase-orders/page.tsx` | PO list; "Create PO" redirects to material-requests | v1 | nav L237; redirect L166-184, L985-988 |
| `site/delivery-verification/page.tsx` | Record and verify deliveries | v1, also used by Hub | nav L243; `src/components/material-hub/NewEntryMenu.tsx:195` |
| `site/inter-site-settlement/page.tsx` | Inter-site ledger | v1 | nav L249 |
| `site/material-settlements/page.tsx` | Vendor settlements, bill verify, AI bill | v1 | nav L255 |
| `site/material-expenses/page.tsx` | Expense list, "Quick Bill (AI)" | v1 | nav L261 |
| `site/materials/hub/page.tsx` | Material Hub thread list | Material-v2 | nav L277; file header L3-9 says it replaces MR, PO, delivery, expenses and spot pages "eventually" |
| `site/materials/inventory/page.tsx` | Batch card grid | Material-v2 | nav L282; table view is a "coming soon" stub (L472) |
| `site/materials/inter-site/page.tsx` | Inter-site netting | Material-v2 | nav L287 |
| `site/materials/usage-ledger/page.tsx` | Usage ledger | Material-v2 | nav L292 |
| `site/spot-purchase/page.tsx` | "Bought at shop" form | Material-v2 entry (not in sidebar) | `NewEntryMenu.tsx:176`, `site/today/page.tsx:98,200` |
| `site/quick-request/page.tsx` | Mobile request builder | Material-v2 entry (not in sidebar) | `NewEntryMenu.tsx:165`, `site/today/page.tsx:77` |
| `site/stock/page.tsx` | Redirect only | Dead | `router.replace("/site/inventory")` L14 |
| `site/material-usage/page.tsx` | Redirect only | Dead | `router.replace("/site/inventory?tab=usage")` L14 |
| `company/materials/page.tsx` | Material catalog | Shared | nav L386 |
| `company/materials/[id]/page.tsx` | Material detail (brands and pricing, price intelligence, vendors) | Shared | linked from catalog and vendors |
| `company/materials/usage/page.tsx` | Company usage | Shared | nav L391 |
| `company/material-search/page.tsx` | "Price Comparison" (one material, many vendors) | Shared | nav L406 |
| `company/vendors/page.tsx`, `[id]/page.tsx`, `[id]/store/page.tsx` | Vendor directory, detail, store catalog | Shared | nav L411 |
| `company/mass-upload/page.tsx`, `history/page.tsx` | CSV/XLSX import (labour, expenses, not materials) | Shared | company nav |
| `site/today/page.tsx` | Site engineer landing (request, delivery, spot purchase tiles) | Material-v2 entry | engineers redirected from `site/dashboard/dashboard-content.tsx:80` |

API routes: `src/app/api/chat/route.ts` (assistant), `src/app/api/mass-upload/{parse,validate,import,template}`, `src/app/api/material-image/{search,rehost}`.

### 2.3 Components and hooks

**Material-v2 (Hub only):** `src/components/material-hub/*` (KpiStrip, StageStepper, MaterialHubTable, MaterialThread*, NewEntryMenu, HubDialogRouter, AllocationsQueue, ThreadActionButton, ThreadCorrectionMenu, ThreadDeleteMenu, Record{Delivery,Settlement}Button, OwnSiteUsageDialog), `src/components/material-hub/backfill/*`, `src/components/material-hub/reconcile/ReconcileUsageDialog`, `src/components/inter-site/*`, `src/components/inventory/InventoryCard*`.

**Shared v1 dialogs reused by the Hub** (via `src/components/material-hub/HubDialogRouter.tsx`): `UnifiedPurchaseOrderDialog`, `RecordAndVerifyDeliveryDialog`, `MaterialSettlementDialog`, `WaterfallUsageDialog`, `SpotPurchaseAllocatorDialog`, plus `SpotPurchaseForm`, `SpotPurchaseItemRow`, `RateUpdatePromptDialog`, `MaterialRequestDialog` (all in `src/components/materials/`).

**v1 only:** `MaterialWorkflowBar`, `PODetailsDrawer`, `CreatePORedirectDialog`, `RequestApprovalDialog`, `RequestDetailsDrawer`, `materials/journey/*`, `materials/settlements/*`, `BillVerificationDialog`, `EditMaterialPurchaseDialog`, `StockBatchesTab`, `SettlementLedger`, `GroupStock*`, `InventoryCardGrid`, `QuickUsageSheet`, `BulkUsageEntryDialog`.

**Catalog and vendors (shared):** `AddMaterialWizard` (forks to `BrandedMaterialWizard` or `GenericMaterialForm`), `MaterialDialog`, `MaterialInspectPane`, `BrandsPricingTab`, `MaterialPriceIntelligenceTab`, `MaterialVendorsTab`, `PriceHistoryDialog`, `PriceHistoryChart`, `PriceAlertsDialog`, `RecordPriceDialog`, `VendorInventoryDialog`, `VendorDialog`, `QuickAddVendorDialog`, `src/components/vendors/*`, `src/components/store-catalog/*`.

**AI ingestion (shared):** `src/components/ai-ingestion/AIIngestionDialog.tsx` and siblings; logic in `src/lib/ai-ingestion/`. Mounted at `site/material-expenses/page.tsx:934`, `site/material-settlements/page.tsx:598`, `company/materials/page.tsx:727`.

**Dead (zero importers in `src/`):** `src/components/materials/AddHistoricalPurchaseDialog.tsx`, `BrandSubTable.tsx`, `ConvertToPODialog.tsx`, `DeliveryDetailsDialog.tsx`, `PriceComparisonModal.tsx`, `PurchaseOrderDialog.tsx`, `VariantSubTable.tsx`, `WeeklyUsageReportDialog.tsx`, `src/components/inventory/BatchUsageDialog.tsx`. Dead because only the files above import them: `VendorDrawer`, `AddVendorToMaterialDialog`, `BrandCard`, `VendorVariantPrices`, `WeightCalculationDisplay`, `BrandChecklistSection`, `VariantChecklistSection`. Also `useCheckPriceAlerts` in `src/hooks/queries/usePriceAlerts.ts:431` has no callers, so price alerts never fire.

**Hooks (`src/hooks/queries/`):** `useMaterials`, `useVendorInventory` (price history, latest price), `useVendors`, `usePurchaseOrders` (incl. `usePurchaseOrdersForHub`), `useMaterialRequests`, `useMaterialPurchases`, `useInterSiteSettlements`, `useStockInventory`, `useSpotPurchases`, `useMaterialUsageLedger`, `useMaterialPacks`, `useMaterialWorkflowSummary`, `useRequestJourney`, `useDeliveryVerification`, `useBillVerification`, `useStoreCatalog` (incl. `useMaterialPriceComparison`), `usePriceAlerts`, `useMaterialOrderStats`, `useRecordHistoricalBatch`, Hub-only `useMaterialThreads`, `usePurchasedBatches`, `useOwnMaterialStock`. No hook file is unused.

### 2.4 Data model

All migrations are under `supabase/migrations/`. "initial" = `00000000000000_initial_schema.sql`.

**Catalog**

| Table | Key columns | Source |
|---|---|---|
| `materials` | name, code, local_name, category_id, parent_id (variants are child rows), unit (enum), secondary_unit, conversion_factor, weight_per_unit, hsn_code, gst_rate, image_url | initial L5336; later `is_draft` (`20260524100000`), `default_grade_variant_id` (`20260606140000`), `sold_in_packs` (`20260625154050`), `price_varies_by_brand/variant` (`20260716100100`) |
| `material_unit` enum | kg, g, ton, liter, ml, piece, bag, bundle, sqft, sqm, cft, cum, nos, rmt, box, set | initial L173; mirrored in `src/lib/ai-ingestion/schemas.ts` L28 |
| `material_categories` | name, code, parent_id | initial L5258 |
| `material_brands` | material_id, brand_name, variant_name, is_preferred, quality_rating, image_url | initial L5242; `20260117100000`, `20260224100000` |
| `material_brand_variant_links` | brand_id, variant_id | `20260513100000` |
| `material_packs` | material_id, label, contents_qty (in base unit), price, gst_rate | `20260625154050`; `coverage` in `20260720100000`. Only structured pack-to-base conversion in the schema |
| Aliases | Not found | Closest: `materials.local_name` and pg_trgm RPCs `match_material_by_name`, `match_vendor_by_name` (`20260509100100_ai_ingest_match_rpcs.sql` L25, L73) |
| Unit conversion table | Not found | `conversion_factor` / `secondary_unit` exist but are not used in app logic |

**Vendors and prices**

| Table | Key columns | Source / notes |
|---|---|---|
| `vendors` | name, shop_name, phone, whatsapp, gst_number, bank fields, upi_id, qr_code_url, bill_policy, is_draft | initial L7103; `20260103150000`, `20260512170000` L25, `20260524100000` |
| `vendor_inventory` | vendor_id, material_id, brand_id, current_price, price_includes_gst, gst_rate, transport/loading/unloading, unit (free text), pricing_mode, last_price_update, price_source | initial L7373 (UNIQUE vendor/material/brand at L8781). `20260509100210` L199 comments "There's no enforced UNIQUE", but prod has `vendor_inventory_vendor_id_material_id_brand_id_key` enforced (checked live) |
| `price_history` | vendor_id, material_id, brand_id, price, gst, transport costs, total_landed_cost, recorded_date, source, quantity, unit, bill_url, bill_number, bill_date | initial L5518. Real time series. **No site_id, no company_id, no purchase link** |
| `material_vendors`, `vendor_price_history`, `price_change_reasons` | Older price list and its history | initial L5316, L8165, L5504; `vendor_price_history` and `price_change_reasons` unused in `src/` |
| `company_vendor_prices` | company_id, negotiated_price | Only in generated types (`src/types/supabase.generated.ts` L842); no CREATE in migrations; unused |
| `price_alerts`, `price_alerts_triggered` | material/brand thresholds | `20260118100000_price_alerts.sql` |
| Views / RPCs | `v_price_history_details`, `v_price_trends`, `v_material_vendor_prices`, `v_material_latest_purchase` (`20260523120100`), `get_purchase_price_context` (`20260510100110`), `get_material_vendor_summary` (`20260512170000` and later), `record_price_entry`, trigger `trg_record_price_from_po` (initial L10206) | |

**Purchases, deliveries, payments**

| Table | Key columns | Source / notes |
|---|---|---|
| `material_requests` / `_items` | site_id, status, purchase_type, payment_source_site_id; items: requested/approved qty, suggested_vendor_id, suggested_unit_price, pack_id | initial L5292, L5275 and later migrations |
| `purchase_orders` | site_id, vendor_id, status, subtotal, tax_amount, discount_amount, transport_cost, total_amount, vendor_bill_url, bill_verified*, quotation_url | initial L5574; `20260127100000_add_bill_verification.sql` |
| `purchase_order_items` | quantity, unit_price, tax_rate, tax_amount, discount_percent, discount_amount, pricing_mode (per_piece/per_kg), calculated/actual weight, pack_id | initial L5551; `20260125141037`, `20260126210000` |
| `deliveries` / `delivery_items` | invoice_number, invoice_date, invoice_amount, invoice_url, challan_url, bill_total, bill_includes_gst; items: ordered/received/accepted qty, unit_price, line_amount | initial L4583, L4625; `20260618140000` |
| `material_purchase_expenses` | The de facto bill header. site_id, ref_code, purchase_type (own_site/group_stock/spot), vendor_id, vendor_name, purchase_date, total_amount, **amount_paid**, transport_cost, payment_mode, payment_reference, **bill_url**, **payment_screenshot_url**, is_paid, settlement_*, source, is_historical | `20260118200000` L61; `amount_paid` in `20260121170000` ("Actual amount paid after bargaining", L9); many later columns |
| `material_purchase_expense_items` | purchase_expense_id, material_id, brand_id, quantity, unit_price, total_price (generated), quantity_in_unit | `20260118200000` L136; `20260619170000`. **No unit, GST, HSN or discount column** |
| `purchase_payments` / `_allocations` | vendor_id, amount, payment_mode, reference_number, receipt_url; allocations to po/delivery | initial L5623, L5610. **Unused in `src/`** |
| `local_purchases` / `_items` | legacy, receipt_url | initial L5128; unused |
| `inter_site_material_settlements`, `_items`, `_payments` | group netting | initial L4856, L4889, L4909 |
| Bills / invoices table | Not found | Bill data is spread across URL columns on 8+ tables (see above) |
| File hash | Only `import_batches.file_hash` | `20260616130000_import_batches.sql` L22 (mass upload CSVs only) |

**Types and validation**
- `src/types/database.types.ts` is stale against migrations. It is missing `material_packs`, `material_designs`, `material_brand_variant_links`, `spot_purchase_allocations`, `batch_usage_delivery_allocations`, `import_batches`, `equipment_vendor_prices`, and several recent columns on `materials` and `material_purchase_expenses`.
- Hand-written `src/types/material.types.ts` is mostly current. `MaterialPurchaseExpense` (L2143) lacks `source`, `is_historical`, `settled_*`. `PriceHistory` (L416) lacks the change-reason columns.
- Zod is used only in `src/lib/ai-ingestion/schemas.ts`, `src/lib/aiPromptSchemas.ts`, `src/lib/spaces/importSpaces.ts`. The AI purchase schema captures per-line `gst_rate` and `hsn_code` (L108-109) but there is no column to store them on expense items.
- **Backends disagree?** Not applicable: only one backend exists. The disagreement that does exist is between migrations and generated types (`companies`, `company_members`, `company_vendor_prices`, `vendor_inventory.source_company_id` appear in types with no CREATE in any migration).

### 2.5 Relations today

- A price row (`price_history`) links to **material, brand, vendor and date**. It links to a bill only by `bill_url` / `bill_number` text, not by FK to a purchase. It has **no site and no company**.
- Current price per vendor lives separately in `vendor_inventory`.
- Price history rows are written by: PO item insert trigger, `record_price_entry`, the AI ingest RPCs (`20260509100210`, `20260510*_ingest_purchase_atomic_*`), and app code in `src/hooks/queries/usePurchaseOrders.ts:415-438`, `useVendorInventory.ts`, `useMaterials.ts`, `src/lib/ai-ingestion/modes/purchase.ts`.
- Spot purchases write `material_purchase_expenses` plus items through an RPC; brand is written as NULL (`20260710130000_spot_purchase_direct_payment.sql:210`).

### 2.6 File storage

Reusable uploaders: `src/components/common/FileUploader.tsx` (PDF/images/HEIC, 15 MB default at L376, compresses images to about 200 KB, camera capture at L1146), `src/components/common/ReceiptCapture.tsx` (10 MB cap at L53, default bucket `work-updates`), `src/lib/storage/uploadHelpers.ts` (`hardenedUpload`, retries, `x-upsert: true`).

| Bucket | What goes there for procurement |
|---|---|
| `purchase-documents` | AI-ingest bills, `EditMaterialPurchaseDialog` bills |
| `work-updates` | Spot purchase bill photos and payment screenshots (via ReceiptCapture default), material and brand images |
| `documents` | PO vendor bills and quotations (`UnifiedPurchaseOrderDialog.tsx:1987`) |
| `settlements` | Material settlement bills/proofs |
| `payment-proofs` | Payment screenshots in payment dialogs (bucket not created in any migration) |
| `delivery-verifications` | Delivery photos |
| `vendor-qr`, `vendor-photos` | Vendor QR and shop photos |
| `imports` | Mass-upload source files |

Observations: procurement files land in at least 4 buckets; no file hash or duplicate check exists for any bill, receipt or photo; the stored copy is the compressed image, not the original.

### 2.7 AI chat assistant

| Aspect | Finding | Evidence |
|---|---|---|
| UI | Right-side drawer opened from sidebar | `src/components/layout/MainLayout.tsx` L740-754, L969-974, L1534; `src/components/chat-assistant/ChatAssistant.tsx` |
| Client hook | Sends question, siteId, date range, last 18 messages; 30 s abort | `src/hooks/useChatAssistant.ts` L83-127 |
| Model / provider | Groq `llama-3.3-70b-versatile`, temp 0.2, max_tokens 1024, `tool_choice: "auto"` | `src/app/api/chat/route.ts` L110-117 |
| Fallback | Gemini `gemini-2.0-flash` intent classifier plus keyword parser, client-side queries | `src/lib/chat-assistant/gemini-parser.ts` L94-104, `intent-parser.ts`, `query-builder.ts` |
| System prompt | Inline template: identity, ids, date range, "call tools before numbers", ₹ formatting, reply in Tamil if asked in Tamil | `src/app/api/chat/route.ts` L8-33 (Tamil rule L30) |
| Context fetching | No prefetch. Up to 5 rounds of tool calls | `route.ts` L108-164 |
| Tools | 34 tools, all `get_*` read-only (attendance, salary, expenses, stock, POs, deliveries, rentals, tea shop, laborers, sites) | `src/lib/chat-assistant/chat-tools.ts` L16-555, dispatcher L561-609 |
| Auth | User session client, so RLS applies; company resolved server-side | `route.ts` L46-77 |
| History | React state only, not persisted | `useChatAssistant.ts` L41 |
| Streaming | None | `route.ts` L135-137 |
| Security note | Gemini key is `NEXT_PUBLIC_GEMINI_API_KEY`, so it ships to the browser | `gemini-parser.ts` L81 |

**Why it cannot take actions today:** (1) every tool is a SELECT, and unknown tool names return an error (`chat-tools.ts` L603); (2) the route returns only text, with no structured "proposed action" in the response; (3) the drawer has no confirm or approve UI; (4) the fallback path is read-only. The plumbing (user-scoped RLS client, tool loop) would support writes once write tools and a confirm step exist.

No price-history, vendor-comparison or material-catalog tools exist among the 34.

### 2.8 OCR, vision, voice

| Capability | Finding | Evidence |
|---|---|---|
| OCR / vision in-app | Not found | Only `generateContent` call is text-only (`gemini-parser.ts` L104) |
| Bill parsing | Manual round trip via external LLM: copy prompt, paste JSON | `src/components/ai-ingestion/PromptCopyPanel.tsx` L37, L56-65; prompts `src/lib/ai-ingestion/modes/purchase.prompt.ts` L11-63 (translates Tamil names, keeps `local_name`), `purchase.batch.prompt.ts`; same pattern in `src/components/material-hub/backfill/BackfillAIDialog.tsx` |
| Ingest save | `ingest_purchase_atomic` RPC; fuzzy match RPCs | `src/lib/services/aiIngestionService.ts` L147-153; `src/lib/ai-ingestion/fuzzyMatch.ts` L81, L114 |
| Modes | Only `purchase` and `purchase_batch` live; `quotation`, `warranty` commented out | `src/lib/ai-ingestion/modes/index.ts` L15-24 |
| Voice / speech-to-text | Not found | No `SpeechRecognition`, `webkitSpeechRecognition`, `getUserMedia`, `MediaRecorder` |
| Tamil | Chat reply rule, Tamil keywords in fallback parser, `local_name` field | `route.ts` L30; `src/lib/chat-assistant/constants.ts` L10; `src/components/materials/MaterialDialog.tsx` L719. No `ta-IN` UI locale |
| WhatsApp | `wa.me` deep links and copy-text only, no API | `src/lib/utils/contact.ts` L33-37; vendor enquiry text in dead `VendorDrawer.tsx` L426-431 |
| Market events / news | Not found | Closest: `price_alerts` (never triggered) |

### 2.9 Roles and permissions

- `src/lib/permissions.ts`: `hasEditPermission` is true for all three roles (L11-13). `hasAdminPermission` returns `true` for everyone (L19-21, "Temporarily allowing all authenticated users"). `canPerformMassUpload` returns `true` (L59-61). `canCreatePurchaseOrders` is the only real gate (admin/office, L27-29), mirrored in RLS (`20260509130000_block_site_engineer_po_creation.sql` L41).
- Hub next-action role map: `src/lib/material-hub/nextAction.ts` L24-140 (Create PO = office; log usage = engineer; settle vendor = anyone).
- Spot purchase: engineers pay from wallet only; RLS enforces `purchase_type='spot'` and `payment_channel='engineer_wallet'` (`20260524100000_spot_purchase_schema.sql` L156-166). Engineers can insert only draft vendors (L215-219). Materials insert open to all roles (`20260619133000`).
- RLS on catalog/procurement tables: SELECT `USING (true)` for authenticated users; vendors/vendor_inventory/brands/categories writes require admin or office; purchase_orders, deliveries, material_requests use allow-all policies; `material_purchase_expenses` uses `can_access_site(site_id)` (initial L11950-12394).
- `src/app/api/material-image/rehost/route.ts` writes `materials.image_url` with the service-role client and no role check (L84-112).

### 2.10 Multi-tenancy

- No `company_id` on: materials, material_categories, material_brands, vendors, vendor_inventory, price_history, purchase_orders(+items), deliveries(+items), material_requests(+items), material_purchase_expenses(+items), inter_site_*, purchase_payments.
- `company_id` exists (per generated types) on sites, site_groups, laborers, teams, equipment, and a few others. Only `equipment` and `equipment_vendor_prices` get it via migrations (`20260619130000_equipment_company_id.sql`).
- `companies`, `company_members`, `company_invites` have no CREATE TABLE in any migration (they appear in `src/types/database.types.ts` L664, L772) but exist in prod, with 1 company row. How they were created is Unclear.
- Live check: 15 prod tables have `company_id` (sites, site_groups, laborers, labor_categories, labor_roles, teams, technicians, equipment, equipment_categories, equipment_vendor_prices, checklist_templates, laborer_payout_batches, company_members, company_invites, company_vendor_prices). None is a materials, vendor, price or purchase table.
- No procurement RLS policy references company. Today the vendor and material catalogs are global to the whole database.

### 2.11 Real bill corpus (12 sample images supplied by Hari)

The images are not stored in the repo. Bank account numbers, phone numbers and personal addresses are deliberately omitted here.

| # | Document | Type as printed | Actual type | Notable |
|---|---|---|---|---|
| 1 | Handwritten pad, 27/10/26 | Estimate | Cash purchase | No vendor name. Flat steel line has rate 66, amount 673, qty missing (implied kg). Welding rod 1 x 370 |
| 2 | TBM (Trichy Building Materials), 24-10-2026 | Quotation | Cash purchase | 4 pipe lines, qty in kg with no unit printed; same item "3/4 SQR PIPE" at 92 and 79; "Discount 3.00" to land on 2,930 |
| 3, 7, 8 | Sri Ramesh Enterprises 5198/26-27, 14-Jul-26 | Tax Invoice | GST invoice | 31 lines, HSN per line, units mtr/no/kg, one line 4.26% discount, CGST+SGST 9%, round-off -0.38, total exactly ₹64,000.00 |
| 4, 6 | Sri Ramesh Enterprises 5199/26-27, 14-Jul-26 | Tax Invoice | GST invoice | 2 lines, unit "length", 4% line discount, total exactly ₹10,000.00 |
| 5, 9 | Sri Vijaya Plywood C06615, 14-07-2026 | Credit Bill | GST invoice on credit | Qty 40 SHT but rate ₹74 per sqft on 1,280 sqft; 24% discount plus separate "Cash Dis"; total exactly ₹1,00,000.00; "GST: FOR OWN USE"; "Goods delivered" and "A/c payment received" stamps; due date |
| 10 | Rasi Paints and Hardwares, 3/11/26 | Estimate | Cash purchase | Tamil + English, one handwritten line "8L En:Ryl Ivory 2520", no rate column, GPay number printed |
| 11 | M.S.S Logistics, GC 31-10-2026 | Delivery Slip | Transport charge | Freight 1,663 + unloading 103 = 1,766; another vendor's invoice visible behind it |
| 12 | Handwritten pad, 27/10/26 | Estimate | Cash purchase | Same pad as #1, no vendor name, barely legible item names |

What this proves:
- **Five document kinds, unreliable headers.** "Quotation" and "Estimate" are used for real sales. Extraction must classify the document, and the user must confirm.
- **Duplicates are mostly not byte-identical.** sha256 of the 12 files: only files 7 and 8 match. Pairs 3/7, 4/6 and 5/9 are the same bill with different bytes. File hash catches 1 of 4 duplicate pairs; a semantic key (vendor GSTIN or vendor id + invoice number + date + total) is required.
- **File size.** Files 3, 4 and 9 are 15.3 to 16.3 MB, above the ReceiptCapture 10 MB cap (`ReceiptCapture.tsx` L53) and the FileUploader 15 MB default (`FileUploader.tsx` L376).
- **Bargaining is printed on the bill.** Three of four GST bills are back-calculated to round totals through discount or round-off. Headers need subtotal, discount, round_off, tax and total, not just total.
- **Rate unit differs from quantity unit.** Sheets vs sqft, pipe pieces vs kg, paint litres. Lines need `qty_unit` and `rate_unit` separately.
- **Vendor identity is missing on 2 of 7 distinct documents.** The assistant must ask. Where present, GSTIN is the strongest match key; bank and UPI details can pre-fill vendor records.
- **Item text needs normalization**: "11/2" means 1½, "21/2" means 2½, brand embedded in description ("Parryware", "Avon"), abbreviations ("En:Ryl").
- **Paper workflow already exists on the bill**: delivered stamps with ticked quantities, internal R/B/C sign-off box, payment-received stamp.
- **Linked documents**: a transport slip belongs to another vendor's material bill (landed cost).
- **Date formats**: 27/10/26, 24-10-2026, 14-Jul-26, 14-07-2026 /18:11:25, 3/11/26. Invoice numbers carry financial year ("5198/26-27").

### 2.12 Live production data (read-only queries, 2026-11-08)

| Measure | Value | What it means |
|---|---|---|
| Companies / sites | 1 / 3 | Single tenant today |
| Materials (of which variants) | 185 (74) | 81 have a `local_name`; 0 drafts |
| Brands | 113 | |
| Vendors (with GSTIN) | 57 (3) | GSTIN is almost never stored, so GSTIN matching needs bills to fill it in |
| `vendor_inventory` rows | 297 | Current price per vendor/material/brand |
| `price_history` rows | 628, from 2025-11-18 to 2026-10-13 | By source: purchase 538, bill 83, quotation 6, manual 1. 66 rows have a bill link |
| Materials with price history / vendors in it | 101 / 25 | Only 12 materials have prices from 2 or more vendors, so vendor comparison has thin data today |
| Purchase orders / deliveries | 126 / 114 | The PO path carries most volume |
| `material_purchase_expenses` | 111, from 2025-10-30 to 2026-10-03 | By type: group_stock 61, own_site 50, **spot 0**. By source: purchase_order 60, unset 45, ai_ingest 6 |
| Expenses with bill photo / payment screenshot | 10 / 22 of 111 | 91% of purchases have no bill file attached |
| Expense line items | 162 | All linked to a valid material |
| `amount_paid` lower than total | 12 bills, ₹4,565 saved | Real bargaining |
| `amount_paid` **higher** than total | 24 bills, ₹33,206 extra | e.g. total 16,500, paid 19,000, transport 0. `amount_paid` is absorbing charges the bill row does not record (transport, unloading, or other). Cause Unclear, see Q13 |
| `purchase_payments`, `material_vendors`, `vendor_price_history`, `company_vendor_prices`, `price_alerts` | 0 rows each | Unused in prod; safe to repurpose `purchase_payments` |
| `local_purchases` | Table does not exist in prod | Initial migration and prod disagree |
| Storage objects | work-updates 1,611; payment-proofs 344; delivery-verifications 175; documents 109; purchase-documents 24; settlements 8 | Procurement files are scattered; a document backfill must scan several buckets |

Implications:
- **The spot purchase form has never produced a row in prod**, and AI ingest only 6. Real purchases come through POs and group stock. A Bill Inbox must work for both "bill for an existing PO/delivery" and "walk-in bill with no PO".
- The data set is small (111 bills, 628 price rows), so all backfills in 5.4 are cheap and can be reviewed by hand.
- Bill files are rare today (10 of 111), so "original file next to parsed data" is mostly a forward-looking feature; history cannot be rebuilt from stored images.

---

## 3. Current UX task measurements

Counts are taps/clicks plus typed fields, estimated from code paths, for a user whose vendor and materials already exist unless stated.

### a) Record one purchase bill with 5 line items

| Path | Who | Screens | Taps (approx) | Required fields | Bill photo | Evidence |
|---|---|---|---|---|---|---|
| Spot purchase | All roles | Hub, New entry menu, spot page (1 scrolling page) | about 30 + typing | vendor (pick or type); per line: material, qty > 0, rate >= 0; total > 0 (typed by hand, starts at 0); payer source for admin/office | Yes (`ReceiptCapture`, bill + payment screenshot) | `src/components/materials/SpotPurchaseForm.tsx` L101, L153-168, L358-365, L402-408 |
| Purchase order | Admin/office only, needs approved request | Quick request, approve, PO dialog, then separate delivery and settlement dialogs | about 30-35 in PO dialog alone; 4+ screens end to end | vendor; per line: material, variant (if any), brand or "Unbranded", qty > 0, price > 0 | Yes (`FileUploader`, L1974-1996) | `src/components/materials/UnifiedPurchaseOrderDialog.tsx` L1095-1117, L1629, L2479 |
| Historical backfill | Hub | Dialog | about 25 | vendor, per line material/qty/price, total, date within hardcoded 2025-11-09 to 2026-05-09 | No | `src/components/material-hub/backfill/BackfillManualDialog.tsx` L52-53, L152-163 |
| AI Quick Bill | Material expenses / settlements pages | Multi-step dialog + external chatbot tab | about 12 + app switching | context (site, vendor optional), paste JSON, review | Yes (batch mode) | `src/components/ai-ingestion/AIIngestionDialog.tsx`, `PromptCopyPanel.tsx` |

Gaps in the spot path, the only one available to every role: brand is not captured (RPC writes NULL), GST is not captured, purchase date is not sent (defaults to `CURRENT_DATE`, `20260710130000_spot_purchase_direct_payment.sql` L134), and the total is not auto-filled. After submit it navigates to `/site/today`, not back to the Hub (L239, L442).

With the real 31-line invoice in the corpus, the spot path is about 4 taps per line, so roughly 125 taps and 93 typed values.

### b) Add a new vendor and a new material during that purchase

| Path | New vendor | New material |
|---|---|---|
| Spot purchase | Free-text "New vendor name", 1 field, saved as draft (`SpotPurchaseForm.tsx` L269-273) | Inline: name, unit (default piece), category; only name required; saved as draft (`SpotPurchaseItemRow.tsx` L130-153) |
| PO dialog | "Add new vendor" in dropdown opens `QuickAddVendorDialog` (name required, about 3 taps); full `VendorDialog` has about 40 fields | **Not possible inline.** User must leave to `/company/materials` and run `AddMaterialWizard` (branded: 5 steps; generic: 1 form) |
| Backfill | freeSolo autocomplete creates drafts (`BackfillLineRow.tsx` L101) | Same |

### c) Find the last price paid for a material, and from whom

| Where | What it shows | Evidence |
|---|---|---|
| PO dialog price helper | "Last ₹X (±%)", last paid date, lowest price and vendor | `UnifiedPurchaseOrderDialog.tsx` L2398-2441 |
| Spot line | "Last paid" for the selected vendor only | `SpotPurchaseItemRow.tsx` L68-71 |
| Catalog row | Best price chip and "Last: ₹X, vendor, date, bill" | `src/components/materials/MaterialListRow.tsx` L60-68, L167 |
| Material inspect pane / detail page | Price history tab, per-vendor last purchase with bill link, Price Intelligence chart | `MaterialInspectPane.tsx` L365, L1245-1261; `MaterialPriceIntelligenceTab.tsx` L108-200 |

Best case on desktop: 2 to 3 clicks (catalog, row). On phone: menu, Company, Materials, search, row, tab: about 6 taps. The assistant cannot answer it (no price tool).

### d) Compare two vendors for the same material

- No side-by-side comparison. `PriceComparisonModal.tsx` exists but is dead.
- Closest: `company/material-search/page.tsx` ("Price Comparison" in nav) lists vendor cards for one material, sortable by price (L307-330, L553-570). About 4 taps. Its "Order" button (L344-357) goes to the PO page, which redirects to material-requests and drops the chosen vendor.
- `MaterialPriceIntelligenceTab.tsx` L558-566 shows a vendor table with base and landed price.
- Prices shown are not unit-normalized, so per-sheet vs per-sqft or per-piece vs per-kg are not comparable.

### Where a site engineer on a phone gets stuck

1. Cannot create a PO at all (by design), so the spot form is the only bill path, and it does not capture brand, GST or bill date.
2. Must type the total by hand; it does not sum lines.
3. Large scanned bills (15+ MB) are rejected by the 10 MB ReceiptCapture cap.
4. About 20 dialogs are not full-screen on mobile, including `MaterialSettlementDialog` (L494), `BackfillManualDialog` (L233), `NewEntryMenu` (L209), `RateUpdatePromptDialog`, `PriceAlertsDialog`, `ThreadCorrectionMenu`.
5. Dense fixed-width tables: PO items table 7 columns with 100 to 180 px minimums (`UnifiedPurchaseOrderDialog.tsx` L1839-1865, L2498-2507); usage ledger 164 to 180 px columns.
6. AI Quick Bill requires switching to ChatGPT/Gemini in another tab and pasting JSON back: hard on a phone.
7. No voice input and no Tamil UI.

---

## 4. Gap table

| # | Capability | Exists today | Where | What is missing | Effort |
|---|---|---|---|---|---|
| 1 | Bill photo/PDF auto-extracts vendor, date, items, qty, unit, rate, GST, total | Partial | `src/components/ai-ingestion/*`, `src/lib/ai-ingestion/schemas.ts`, `modes/purchase.prompt.ts`, `src/lib/services/aiIngestionService.ts` | In-app vision call (server route) replacing copy/paste; document-kind classification; per-field confidence; header fields subtotal/discount/round-off; line rate_unit and discount; corpus shows 5 document kinds and lying headers | M |
| 2 | Original file stored permanently, viewable next to parsed data | Partial | `bill_url` on `material_purchase_expenses`; `purchase-documents`, `work-updates`, `documents` buckets; `FileUploader.tsx` | One document record per file; keep the original (uploads are compressed today); side-by-side viewer; consolidate buckets; raise 10 MB cap | S to M |
| 3 | Catalogs built from bills, fuzzy matching and aliases | Partial | `match_material_by_name`, `match_vendor_by_name` (`20260509100100`); draft vendors/materials from spot and backfill | Alias tables; learn alias when a user maps a line; GSTIN as vendor key; fraction and brand-in-description normalization; merge tool for duplicates | M |
| 4 | Conversational assistant asks only for missing fields, Tamil/English/mixed voice, confirm card before write | Partial | `src/app/api/chat/route.ts` (Tamil reply rule L30), `ChatAssistant.tsx` | Write tools; draft-state slot filling; confirm card UI; voice input; image input in chat; persisted conversation | L |
| 5 | Price history per material and vendor, normalized unit prices | Partial | `price_history` (initial L5518), `PriceHistoryDialog.tsx`, `MaterialPriceIntelligenceTab.tsx`, `get_purchase_price_context` | Base unit per material; rate_unit on lines; normalized price column; site and purchase FK on price_history; spot items have no unit at all | M |
| 6 | Payment receipts attach to purchase; actual paid vs billed | Partial | `amount_paid` (`20260121170000`), `payment_screenshot_url`, `payment-proofs` bucket; unused `purchase_payments` | Multiple payments per bill; receipt document with hash; UTR/reference extraction from GPay screenshots; bill-level discount stored separately from post-bill bargaining | S to M |
| 7 | Assistant tools: price history, compare vendors, last brand, alternate vendor, WhatsApp quote, create purchase, attach payment, merge materials, update vendor | No (reads exist for other domains only) | `src/lib/chat-assistant/chat-tools.ts` (34 read tools, none for prices or catalogs) | All 9 tools; confirm-before-write protocol; WhatsApp draft uses existing `wa.me` helper `src/lib/utils/contact.ts` | M to L |
| 8 | Bulk import of old bills, duplicate detection by file hash, review queue | Partial | `purchase_batch` mode; `BackfillAIDialog.tsx`; `import_batches.file_hash` (mass upload only) | File hash on bill documents; semantic duplicate key (corpus: file hash caught 1 of 4); queue with statuses; backfill date window is hardcoded | M |
| 9 | Market events log to explain price spikes | No | Closest: `price_alerts` (never triggered, `usePriceAlerts.ts:431` has no callers) | Events table, simple entry UI, overlay on price chart, assistant lookup | S |

---

## 5. Data model review and proposed schema diff

### 5.1 Blockers in the current schema

| Need | Blocker |
|---|---|
| Bill-first capture | No document entity; a file is only a URL string on a purchase row, so a bill cannot exist before it is parsed, and one purchase cannot hold several files cleanly |
| Line items | `material_purchase_expense_items.material_id` is NOT NULL (`20260118200000` L139), so an unmatched line cannot be saved for later review |
| GST / HSN / discount on lines | No columns on expense items; header has no subtotal, discount, round-off or tax |
| Price history | No FK from `price_history` to the purchase or line; no site_id |
| Normalized units | No base unit concept; spot items store no unit; rate unit separate from quantity unit does not exist outside PO `pricing_mode` |
| Aliases | No alias table |
| Original file link | Stored copy is compressed; no hash |
| Billed vs paid | Covered for one payment (`amount_paid`); no table for multiple payments against a spot/expense bill (`purchase_payments` allocates to PO/delivery only) |
| Duplicate detection | No hash and no unique key on invoice number |
| Multi-tenancy | No company_id on any procurement table |

### 5.2 Proposed minimal diff (Postgres, additive only)

Every new table below gets `company_id uuid fk companies null` from day one (filled with the single existing company), per 5.3.

```diff
# 1. New: one row per uploaded file (bill, receipt, slip, quote)
+ TABLE purchase_documents
+   id uuid pk
+   company_id uuid fk companies null
+   site_id uuid fk sites null
+   doc_kind text check in ('tax_invoice','cash_bill','estimate','quotation','transport_slip','payment_receipt','other')
+   storage_bucket text, storage_path text        -- original, uncompressed
+   preview_path text null                        -- compressed copy for UI
+   file_sha256 text not null, mime_type text, size_bytes int
+   status text check in ('uploaded','extracting','needs_review','confirmed','duplicate','rejected')
+   extraction jsonb null, extraction_model text null, field_confidence jsonb null
+   vendor_id uuid fk vendors null, vendor_gstin text null
+   vendor_name_pending boolean default false   -- unknown shop: purchaser must fill the name later
+   invoice_no text null, invoice_date date null, total_amount numeric(14,2) null
+   duplicate_of_id uuid fk purchase_documents null
+   related_document_id uuid fk purchase_documents null   -- transport slip -> material bill
+   purchase_expense_id uuid fk material_purchase_expenses null
+   uploaded_by uuid fk users, created_at timestamptz
+   UNIQUE (file_sha256)
+   INDEX (vendor_id, invoice_no, invoice_date)          -- semantic duplicate lookup, not unique

# 2. Extend the bill header
  TABLE material_purchase_expenses
+   invoice_no text null
+   bill_date date null                     -- printed date; purchase_date stays the business date
+   subtotal numeric(14,2) null
+   discount_amount numeric(14,2) null      -- printed on bill
+   round_off numeric(8,2) null
+   tax_amount numeric(14,2) null
+   cgst_amount, sgst_amount, igst_amount numeric(14,2) null   -- AESTA does not claim ITC; stored for future tenants who do
+   primary_document_id uuid fk purchase_documents null
+   CHECK (amount_paid IS NULL OR amount_paid <= total_amount)  -- add NOT VALID first, VALIDATE after the 24 bills are rectified
    -- keep total_amount (billed) and amount_paid (actually paid); total_amount includes charge lines below

# 2b. New: extra charges on a bill (transport, loading, unloading, labour handling)
+ TABLE purchase_charges
+   id uuid pk, company_id uuid fk companies null
+   purchase_expense_id uuid fk material_purchase_expenses
+   charge_type text check in ('transport','loading','unloading','handling','other')
+   amount numeric(12,2), payee_vendor_id uuid fk vendors null   -- a transporter can be a different vendor
+   document_id uuid fk purchase_documents null                  -- e.g. the logistics delivery slip
+   allocation text check in ('by_value','by_qty','by_weight','manual') default 'by_value'
  -- landed cost per line = line value + its allocated share of charges; feeds price_history.total_landed_cost

# 3. Extend line items
  TABLE material_purchase_expense_items
~   material_id  NOT NULL -> NULL           -- allow unmatched lines while status = needs_review
+   raw_description text null               -- text exactly as printed
+   qty_unit material_unit null
+   rate_unit material_unit null            -- e.g. sqft while qty_unit = piece (sheet)
+   rate_basis_qty numeric(14,3) null       -- e.g. 1280 sqft for 40 sheets
+   line_discount_pct numeric(5,2) null
+   hsn_code text null, gst_rate numeric(4,2) null, gst_amount numeric(14,2) null
+   base_qty numeric(14,3) null             -- quantity in the material's base unit
+   normalized_unit_price numeric(14,4) null   -- price per base unit, after line discount, before GST
+   match_confidence numeric(4,3) null

# 4. Normalization
  TABLE materials
+   base_unit material_unit null            -- backfill from materials.unit
  (reuse material_packs.contents_qty for pack -> base conversion; no new conversion table in phase 1)

# 5. Aliases
+ TABLE material_aliases (id, material_id fk, brand_id fk null, alias text, alias_norm text,
+   source text check in ('bill','user','import'), vendor_id fk null, created_by, created_at,
+   UNIQUE (alias_norm, coalesce(vendor_id))) + trigram index on alias_norm
+ TABLE vendor_aliases (id, vendor_id fk, alias text, alias_norm text, gstin text null, upi_id text null,
+   UNIQUE (alias_norm))

# 6. Price history links
  TABLE price_history
+   site_id uuid fk sites null
+   purchase_expense_item_id uuid fk material_purchase_expense_items null
+   normalized_unit_price numeric(14,4) null, base_unit material_unit null

# 7. Payments against a bill (reuse the unused table)
  TABLE purchase_payments
+   purchase_expense_id uuid fk material_purchase_expenses null
+   document_id uuid fk purchase_documents null     -- GPay / bank screenshot
+   utr text null, paid_at timestamptz null
  -- amount_paid on the header becomes a cached sum of these rows

# 8. Market events
+ TABLE market_events (id, event_date date, end_date date null, category_id fk null, material_id fk null,
+   region text null, title text, note text, source_url text null, created_by, created_at)

# 10. New: review flags (one generic queue for anything a person must check)
+ TABLE review_flags
+   id uuid pk, company_id uuid fk companies null, site_id uuid fk sites null
+   entity_type text check in ('purchase_document','purchase_expense','vendor','material','payment')
+   entity_id uuid
+   reason text check in ('vendor_name_added','paid_above_billed','low_confidence_extraction',
+                         'possible_duplicate','unmatched_line','data_correction','other')
+   details jsonb null                     -- e.g. old value, new value, confidence
+   status text check in ('open','approved','rejected','fixed') default 'open'
+   raised_by uuid fk users null           -- null when raised by the system
+   resolved_by uuid fk users null, resolved_at timestamptz null, resolution_note text null
+   created_at timestamptz
+   INDEX (status, entity_type)
  -- anyone may make the change; the flag records who, when and what, and an admin/office user approves or reverts it

# 9. Multi-tenancy columns on existing tables (nullable now, enforced later)
+   company_id uuid fk companies null  on vendors, materials, vendor_inventory, price_history,
+   material_purchase_expenses, purchase_payments
```

### 5.3 Designing for multi-tenancy and a future online marketplace

Decided 2026-11-08: no Firebase; multi-tenancy comes later; the long-term intent is that companies can order materials online from vendors and have them delivered to site. To avoid a second schema rewrite, the new design follows these rules now, at near-zero cost:

| Rule | Why | How |
|---|---|---|
| Every new table carries a nullable `company_id` | Turning on tenancy later becomes a backfill plus RLS change, not a redesign | Default to the single existing company; RLS stays as today until tenancy starts |
| Split "global catalog" from "company data" | A marketplace needs one shared product catalog that many companies buy from; prices paid and aliases are private per company | `materials` / `material_brands` stay global (no company_id, or null = global); `price_history`, `vendor_inventory` negotiated prices, aliases, purchases, documents are company-scoped |
| Vendors have two layers | A marketplace seller is shared; a local hardware shop is private to one company | `vendors.company_id` null = shared/marketplace vendor, set = private vendor. Later a `vendor_accounts` table can let a vendor log in and manage its own listing |
| Tax fields are generic | AESTA does not claim GST input credit, but other tenants will | Store CGST/SGST/IGST and HSN on every bill; add `companies.claims_gst_itc boolean` so reports only show ITC for companies that claim it |
| Online order reuses the PO tables | A marketplace order is a PO with an online vendor and delivery tracking | Keep `purchase_orders` / `deliveries` as the order path; the Bill Inbox is the walk-in path; both write `price_history` |
| Storage paths include company | Bucket policies can be tightened per tenant later | `purchase-documents/{company_id}/{site_id}/{sha256}.{ext}` |

### 5.4 Migration without data loss

1. All changes in 5.2 are additive columns, new tables, or relaxing a NOT NULL. Nothing is dropped or narrowed.
2. Backfill `purchase_documents` from every non-null `bill_url`, `payment_screenshot_url`, `vendor_bill_url`, `invoice_url` (status `confirmed`, `file_sha256` computed by a one-off script that downloads each object). Link back via `primary_document_id`.
3. Backfill `materials.base_unit = unit`. Backfill `qty_unit` on existing items from the material's unit, and `normalized_unit_price = unit_price` where qty_unit equals base_unit; leave null otherwise for review.
4. Backfill `price_history.purchase_expense_item_id` by matching (vendor, material, date, price) to expense items; leave null when ambiguous.
5. Create one `purchase_payments` row per expense where `is_paid` is true, amount = `coalesce(amount_paid, total_amount)`, document = `payment_screenshot_url`.
6. Seed `material_aliases` from `materials.local_name` and from AI ingest history where the raw name differs from the matched material.
7. Leave `material_vendors`, `vendor_price_history` untouched (0 rows in prod); remove only after a later audit. `local_purchases` does not exist in prod.
8. **Rectify the 24 bills where `amount_paid` exceeds `total_amount`** before validating the new CHECK: raise one `review_flags` row (reason `paid_above_billed`) per bill so they appear in the in-app review queue. Anyone who knows the purchase can correct it by moving the extra into `purchase_charges` (transport, unloading, handling) or a missing line; the correction is then approved by admin/office. No automatic rewrite.
9. Backfill `company_id` on new and extended tables with the single existing company.
10. Run every backfill on local Supabase with a production dump first (per CLAUDE.md), then on prod after confirmation (approved in principle by Hari, 2026-11-08).

---

## 6. Architecture options and recommendation

| | A) Extend Material-v2 (Hub) to be bill-first | B) Separate "Bill Inbox" feeding existing catalogs | C) Redesign materials, vendors, purchases as one procurement module |
|---|---|---|---|
| Reused | Hub shell, thread model, HubDialogRouter, v1 dialogs | AI-ingestion pipeline (schemas, fuzzy match, preview table, `ingest_purchase_atomic`), `FileUploader`, `purchase-documents` bucket, `price_history`, Hub "New entry" menu as entry point | Tables and RPCs only |
| Thrown away | Little, but Hub threads are organised around request, PO, delivery, settle stages; a walk-in bill does not fit that pipeline | Copy-prompt/paste-JSON step only | Most of 52 material components, Hub work in progress, v1 pages |
| Risk to live data | Medium: changes to thread derivation touch every live purchase view | Low: writes go through the same RPC/tables already used by AI Quick Bill; new tables are additive | High: parallel rewrite against live project data |
| Effort | M to L | M | L to XL |
| Backend impact (Firebase ruled out) | None beyond Postgres changes | None beyond Postgres changes | None beyond Postgres changes |
| Multi-tenancy / marketplace readiness | Hub threads are site-centric; marketplace orders would need new thread kinds | New company-ready tables from day one (5.3); PO path left free to become the online-order path | Best long-term fit, but delays everything |
| Design-system redesign impact | Competes with ongoing Hub redesign (`docs/MaterialHub_Redesign/`) | Built as a fresh screen in the AESTA Material v2 design system (Claude Design) | Absorbs the redesign but delays everything |

**Recommendation: B.** The pipeline that matters most for a bill-first flow already exists in `src/lib/ai-ingestion/` and already writes into the tables the Hub reads. Replacing the clipboard step with a server vision call, adding a document record and a review queue gives the bill-first experience without rewriting the Hub or v1 screens. It keeps live data safe because confirmed bills land through the same `ingest_purchase_atomic` RPC used today. The Inbox appears as the first item in the Hub "New entry" menu and on `/site/today`, so for users it feels like part of Material-v2.

**Non-blocking capture is a hard requirement.** Hari confirmed site engineers do not use the app for purchases today because any glitch stops them while the site keeps buying, and the entries are later redone as historical work (prod shows 0 spot purchases). The Inbox therefore must: accept a photo with zero required fields; queue uploads offline and retry (reuse `hardenedUpload` in `src/lib/storage/uploadHelpers.ts`); extract in the background; let the purchaser or office finish missing fields later (including an unknown vendor name); and treat a late, historical entry as the normal path, not a separate backfill tool. Once stable, the spot purchase form can become "edit a bill draft" and the Hub can show documents inside threads (convergence toward C without a big-bang rewrite).

---

## 7. Assistant review and tool list

### 7.1 Against vision item 4

| Requirement | Today |
|---|---|
| Asks only for missing fields | No: no draft state and no write intent |
| Tamil, English, mixed | Partial: replies in Tamil if asked in Tamil (`route.ts` L30); Llama 3.3 handles romanized Tamil weakly (Unclear, untested) |
| Voice | No |
| Confirm card before write | No: response is plain text |
| Image input (bill in chat) | No |

### 7.2 Against vision item 7

None of the 9 tools exist. Price data is reachable only through UI hooks (`useVendorInventory`, `useMaterialOrderStats`) and RPCs (`get_purchase_price_context`, `get_material_vendor_summary`).

### 7.3 Tool list

| Tool | Inputs | Output | R/W | Reuse |
|---|---|---|---|---|
| `get_price_history` | material (id or text), vendor? , from?, to?, site? | rows: date, vendor, brand, qty, unit, price, normalized price, bill link | Read | `price_history`, `v_price_history_details` |
| `compare_vendors` | material, brand?, vendor_ids? (default top 5) | per vendor: last price, normalized price, last date, landed cost, count | Read | `get_material_vendor_summary`, `get_purchase_price_context` |
| `get_last_brand` | material, site? | brand, vendor, date, price | Read | `v_material_latest_purchase` |
| `suggest_alternate_vendor` | material, current_vendor_id | ranked vendors with price delta and last purchase date | Read | `vendor_inventory`, `price_history` |
| `resolve_material` / `resolve_vendor` | free text, gstin? | candidates with score | Read | `match_material_by_name`, `match_vendor_by_name`, alias tables |
| `draft_whatsapp_quote` | vendor_ids, items [{material, qty, unit}], language (ta/en) | message text + `wa.me` links per vendor | Read (no send) | `src/lib/utils/contact.ts` `whatsappHref` |
| `create_purchase` | site, vendor, date, invoice_no?, lines [{material or raw text, qty, qty_unit, rate, rate_unit, gst?}], totals, document_id? , payer | proposed action (preview) then purchase id after confirm | Write | `ingest_purchase_atomic` or spot purchase RPC |
| `attach_payment` | purchase_id, amount, paid_at, mode, utr?, document_id? | proposed action then payment id | Write | `purchase_payments` (extended) |
| `merge_materials` | keep_id, merge_ids[] | proposed action listing affected rows then result | Write (admin only) | new RPC; repoints items, price_history, vendor_inventory, adds aliases |
| `update_vendor` | vendor_id, fields (phone, gstin, upi, bank) | proposed diff then updated vendor | Write (admin/office) | `vendors` update under RLS |
| `log_market_event` | date, title, material/category?, note | proposed action then id | Write | new `market_events` |

### 7.4 How to add tool calling with confirm-before-write

1. Keep the existing loop in `src/app/api/chat/route.ts`. Add write tools to `chat-tools.ts`, but make their executor return `{ kind: "proposed_action", tool, args, preview }` without writing.
2. When any tool returns a proposed action, end the loop and return `{ answer, proposedAction }` to the client.
3. `ChatAssistant.tsx` renders a confirm card (fields, totals, bill thumbnail, Edit / Confirm / Cancel). Missing required fields are shown empty and the model is told which slots are missing so it asks for exactly those.
4. On Confirm, the client calls a new `/api/chat/execute` route that re-validates args with Zod (extend `src/lib/ai-ingestion/schemas.ts`), checks role (`canCreatePurchaseOrders` style helpers, made real), and calls the existing RPC under the user's RLS client. Use an idempotency key so a double tap does not create two purchases.
5. Log every executed action (user, tool, args, result) to an audit table.
6. Model choice (decided): use Gemini, already a dependency (`@google/generative-ai`), for bill vision and for the assistant's tool calling, called server-side only. Keep the provider behind one small adapter so it can be swapped later. Groq can remain for plain read-only chat until the Gemini path is proven.
7. Voice: start with the browser Web Speech API (`ta-IN`, `en-IN`) in `ChatInput.tsx`, which is free and fast but inconsistent across Android browsers; fall back to server speech-to-text if accuracy is poor. Code-mixed Tamil and English is the hard case; test on real site recordings.
8. Move the Gemini key server-side (`NEXT_PUBLIC_GEMINI_API_KEY` today).

### 7.5 Uncommitted assistant work in the working tree (seen 2026-11-08)

Sections 2.7 and 7.1 to 7.4 describe committed `main` (`e147d6ca`). The working tree also contains uncommitted, parallel work that already builds much of 7.4:
- `supabase/migrations/20261108100200_assistant_actions.sql`: an `assistant_actions` table where the assistant stores each proposed write; on confirm, `/api/assistant/confirm` runs it with the user's session (RLS) and the row doubles as the audit log.
- `src/app/api/assistant/route.ts`, `src/lib/assistant/{actionTools,toolAdapter,types}.ts`, `src/components/chat-assistant/ConfirmActionCard.tsx`: confirm-card protocol. Current write tools cover tasks, bug reports and staff pay (`create_task`, `update_task_status`, `add_task_comment`, `create_bug_report`, `record_staff_payment`), not procurement.
- `src/lib/ai/gemini.ts` (model `gemini-3.8-flash`), `src/lib/ai/transcribe.ts`, `src/app/api/transcribe/route.ts`, `src/components/common/VoiceRecorder.tsx`, `src/hooks/useVoiceCapture.ts`: server-side Gemini and voice transcription.

Effect on this plan: once that work is committed, P5 shrinks to adding the procurement tools from 7.3 to `actionTools.ts`, and P6 shrinks to Tamil and mixed-language testing of the existing voice capture. The `review_flags` queue (5.2 item 10) should link to `assistant_actions` when a flagged change came from the assistant, rather than duplicating its audit log.

---

## 8. Recommended build order (each phase ships on its own)

| Phase | Scope | Ships value | Depends on |
|---|---|---|---|
| P0 Hygiene | Make `hasAdminPermission` and `canPerformMassUpload` real (approved); move Gemini key server-side; add auth/role check to `/api/material-image/rehost`; regenerate `database.types.ts`; `review_flags` table and a simple review queue screen (admin/office approve, reject or fix); flag the 24 paid-above-billed bills, correct them through the queue, then validate the `amount_paid <= total_amount` CHECK | Safer base for write tools; clean billed vs paid data; one audit trail for all later phases | None |
| P1 Bill Inbox: capture | `purchase_documents` (with `company_id`); photo-first upload with zero required fields, offline queue and retry; original + preview, sha256, semantic duplicate warning; Gemini server-side extraction into the existing AI-ingestion preview table; "vendor name pending" follow-up that anyone can complete, raising a `vendor_name_added` review flag; low-confidence extractions and possible duplicates also raise flags; save via `ingest_purchase_atomic`; raise upload cap; entry from Hub "New entry" and `/site/today`; screens in the AESTA Material v2 design system. Eval first: run the extractor on the 12 sample bills locally and measure field accuracy | Engineers can capture a bill in seconds even when nothing else works | P0 |
| P2 Lines done right | Header subtotal/discount/round-off/tax incl. CGST/SGST/IGST; line units, rate_unit, discount, GST, HSN; `purchase_charges` for transport, loading, unloading, handling with landed-cost allocation; base_unit and normalized price; aliases learned from user corrections; GSTIN vendor matching | Comparable landed prices; catalog grows from bills | P1 |
| P3 Payments | Extend `purchase_payments`; attach GPay/bank screenshot to a bill; extract amount and UTR; billed vs paid view | Real paid amounts per bill | P1 |
| P4 Assistant reads | `get_price_history`, `compare_vendors`, `get_last_brand`, `suggest_alternate_vendor`, `draft_whatsapp_quote`; side-by-side compare screen; fix material-search "Order" dropping vendor | Answers tasks c and d in one question | P2 for normalized prices |
| P5 Assistant writes | Confirm-card protocol; `create_purchase`, `attach_payment`, `update_vendor`, `merge_materials`; audit log; bill image in chat | Conversational capture | P0, P1, P3 |
| P6 Voice and Tamil | Mic in chat, ta-IN/en-IN, mixed-language tests | Hands-free on site | P5 |
| P7 Bulk import | Multi-file upload to the Inbox, queue with statuses, duplicate review; remove the hardcoded backfill window (approved) so any past date is allowed | Historical bills and price history; clears the backlog of purchases done outside the app | P1, P2 |
| P8 Market events | Table, quick entry, overlay on price chart, assistant lookup | Explains spikes | P2 |
| Later track | Multi-tenancy (backfill `company_id`, RLS by company, global vs private catalog per 5.3), then online marketplace ordering through the PO and delivery path | SaaS and marketplace | New tables are already company-ready from P1 |

---

## 9. Risks and open questions for Hari

### Risks

1. **Adoption.** Engineers already bypass the app when it gets in the way. If the Inbox ever blocks (required fields, failed upload, slow extraction), they will bypass it too. Non-blocking capture is the success criterion, not extraction accuracy.
2. **Extraction accuracy on handwritten estimates.** 3 of 7 distinct sample documents are handwritten, two without a vendor. Expect the user to correct these; the confirm step is mandatory.
3. **Round-number totals.** Bills back-calculated to round figures make line-level prices slightly unreliable as "true" prices. Normalized price should note when a bill-level discount was spread across lines.
4. **Duplicate bills.** The same bill photographed or scanned twice will not match on file hash. Without the semantic key, price history and expenses double count.
5. **Live data backfills** touch every purchase row; must be rehearsed on a local dump.
6. **Open permissions.** Adding write tools while `hasAdminPermission` returns true lets any user merge materials or edit vendors through chat.
7. **Cost and privacy** of sending bill images (with vendor bank details) to an external model.
8. **Types drift.** `database.types.ts` is stale; new code may compile against wrong shapes.
9. **Schema drift.** Prod has tables no migration creates (`companies` and friends) and lacks one the initial migration creates (`local_purchases`). A fresh `db:reset` does not reproduce prod, so local testing of company-scoped changes is unreliable until this is reconciled.
10. **Paid above billed.** 24 of 111 bills have `amount_paid` above `total_amount`. Hari confirmed this should not be possible; they must be rectified, and until then landed-cost prices are understated.
11. **Marketplace scope creep.** The online ordering intent should shape the schema (5.3) but not the first phases; building marketplace features before bill capture works would repeat the adoption problem.

### Decisions (answered by Hari, 2026-11-08)

| # | Question | Decision | Effect on this plan |
|---|---|---|---|
| Q1 | Firebase migration? | No Firebase. Use the existing Supabase backend | Firestore mapping removed; all schema is Postgres |
| Q2 | Is Material-v2 the Material Hub? | Yes. There is an AESTA Material v2 design system in Claude Design | New Inbox screens use that design system |
| Q3 | Multi-tenancy timing | Later, but design future-focused. Long-term intent: an online material marketplace where companies order and get delivery to site | Section 5.3: nullable `company_id` on new tables, global vs private catalog, vendor layers, PO path reserved for online orders |
| Q4 | Model provider | Gemini, already in the project | Server-side Gemini for vision and tool calling (7.4) |
| Q6 | GST input credit | AESTA does not claim; future tenants may | Store CGST/SGST/IGST and HSN; `companies.claims_gst_itc` flag |
| Q7 | Real role checks | Go with recommendation | In P0 |
| Q8 | Hardcoded backfill window | Go with recommendation: remove it | In P7 |
| Q9 | Backfills on prod after local rehearsal | Go with recommendation | 5.4 step 10 |
| Q10 | Sample bills and their bank details | Bills are part of the process and must be stored; real bills will be added once the feature exists | Store originals as-is; use the 12 samples as a local eval set |
| Q11 | Bills with no vendor name | Normal. The supervisor must fill in the vendor name later if bought locally | `vendor_name_pending` flag plus a follow-up for the purchaser |
| Q12 | Transport and handling charges | Vary by material, vendor and distance; transport, loading/unloading and labour handling apply to some purchases only | `purchase_charges` table with landed-cost allocation (5.2 item 2b) |
| Q13 | Paid more than billed | Should not be possible: paid must be less than or equal to billed. The 24 bills must be rectified | P0 data fix plus CHECK constraint |
| Q5 | Canonical way to record purchases | Go with recommendation: Bill Inbox for all walk-in purchases; PO path kept for planned orders and the future marketplace; spot purchase form becomes "edit a bill draft" | Sections 6 and 8 |
| Q15 | Who fills a pending vendor name | Anyone may add it; every such change is flagged and reviewed (enterprise-style maker/checker) | `review_flags` table (5.2 item 10), raised in P1 |
| Q16 | Correcting the 24 paid-above-billed bills | Flag them and review them in the app | One `paid_above_billed` flag per bill in P0; corrections approved through the review queue |
| Q14 | Why 0 spot purchases | Engineers do not use the app for purchasing: when an issue blocks them the process stops but the site continues, and entries are done later as historical work | Non-blocking, photo-first capture is the core requirement (section 6); late entry is a normal path |

### Still open

None. All questions were answered on 2026-11-08. The next step is a detailed implementation plan for P0 (hygiene, role checks, review queue, rectifying the 24 bills).
