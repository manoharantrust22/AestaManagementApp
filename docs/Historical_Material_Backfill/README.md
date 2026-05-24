# Handoff Addendum: Historical Backfill — Materials Hub

> **Additive to the previous `design_handoff_materials_redesign/` package.** This is a new entry path inside the existing Materials Hub — not a redesign. Implement on top of the v2 you've already started.

## What this adds

A **bulk-import surface for past purchases** that bypasses the full MR→PO→Delivery→Settle chain because the work already happened. Two paths:

1. **Manual entry** — one flat form, ~30 sec per record. Best for 1–20 items.
2. **AI-assisted bulk ingest** — copy our auto-generated schema as a prompt, paste it into ChatGPT or Gemini along with bill photos, get JSON back, preview/confirm rows. Best for batches of 20+.

Both create threads at `stage='in-use'` (or `'exhausted'`) with `isHistorical: true` and **all lifecycle records pre-populated atomically**: synthetic PO, delivery record, settlement record, inventory batch. For group purchases, `interSiteUsage` is computed from the captured % split so inter-site debt updates immediately.

## Why this matters

Your team has 6 months of pre-app purchases (Nov 9 → May 9) to land in the system across own-site, group-site, bulk batch, and spot purchases. Running each through the full forward flow would take weeks. This collapses the entry to seconds-per-record manually or LLM-assisted for batches.

The AI path is especially good because:
- No backend cost or OCR infrastructure on your side
- Uses the user's own ChatGPT / Gemini account (most users already have access)
- The prompt embeds your live vendor + material catalog → AI tries to match existing IDs first, only flags genuinely new ones as drafts
- All AI output is reviewed in a preview table before commit — nothing's blindly trusted

## Files

| File | Purpose |
|---|---|
| `proto-backfill.jsx` | All backfill UI — method picker, manual form, 3-step AI wizard with prompt builder + row normalizer + preview |

The other changes are **small additions** to your existing v2 files. They're all listed in the "Integration Points" section below as exact snippets to insert.

## UX flow

```
Hub "+ New entry" launcher
 └── Backfill historical record    ← new entry (3rd of 4 cards)
      └── Method picker
           ├── Manual entry
           │   └── Single flat form → BACKFILL_THREAD reducer action
           └── AI-assisted ingest
               └── Step 1: Copy prompt
                   Step 2: Paste JSON
                   Step 3: Preview rows → BACKFILL_BATCH reducer action
```

---

## Screen 1 — Method picker (BackfillMethodModal)

580px modal. Header: "Backfill historical record · The work already happened. Skip the request → approval → PO → delivery chain — record it as a single completed transaction."

Two cards stacked vertically:

| Card | Tone | Tag |
|---|---|---|
| **Manual entry** | primary | "~30 sec per record · best for 1–20 items" |
| **AI-assisted ingest** | pink (highlighted, pink-bordered, with "AI" pill) | "Best for batches of 20+ · uses external AI" |

Footer info panel: "**New vendor or material?** Type the name as-is — we'll create it as a draft. Office reviews drafts later from Company → Vendors / Materials."

---

## Screen 2 — Manual entry (BackfillManualModal)

680px modal. Yellow warning banner at top: *"Backfill mode · Tagged as historical · skips approvals · settlement posts as the date you record."*

Form fields, in order:

1. **Vendor** — `VendorAutocomplete` (reuse the one already in `proto-spot.jsx` for spot purchases). When user types a name not matching any catalog vendor, the dropdown shows a yellow "Will create new shop 'X'" option. Drafts flagged via `onNewFlag`.
2. **Material** — new `MaterialAutocompleteBackfill` component (in `proto-backfill.jsx`). Same pattern: type-ahead matching against `M_MATERIALS`, yellow "Create as new material (draft)" footer when no exact match.
3. **Quantity** — number input + unit dropdown (if no material selected) or auto-locked to the selected material's unit
4. **Total paid (₹)** — number input, ₹ prefix
5. **Purchase date** — date input
6. **Section** — optional text input ("Foundation, plaster, slab…")
7. **Buying for** — `ProtoRadioCards`: This site (own) / Group cluster
8. **Group % split** (visible only when Group selected) — same panel pattern as the Spot Purchase modal: per-site % inputs that must total 100, live ₹ value per site computed from `amount * pct / 100`, success-tinted total when valid
9. **Already used? (optional)** — number input + unit suffix, defaults to 0. Critical for the realistic case where you're recording a 6-month-old batch that's already partially consumed.
10. **Payment** — `ProtoRadioCards`: Paid · settled / Outstanding
11. **Paid by** (visible only when Paid selected) — `ProtoRadioCards`: Office / Wallet / Site funds
12. **Notes** — optional textarea

**Submit** dispatches `BACKFILL_THREAD` with the full payload. Reducer creates the thread, pushes draft vendor/material into catalog if flagged.

---

## Screen 3 — AI-assisted ingest (BackfillAIModal)

Three-step wizard. Modal width: 680px for steps 1–2, **expands to 920px on step 3** to fit the preview table.

### Stepper UI

3 numbered circles at top connected by progress lines. Active step = primary-filled; completed = primary-filled with check; future = hairline.

### Step 1 — Copy prompt

Instructions panel at top:
> 1. Tap **Copy prompt** below — it includes our schema + vendor & material catalog.
> 2. Open ChatGPT (free tier works) or Gemini. Paste the prompt.
> 3. Attach photos of your bills — one or many. The AI will read them.
> 4. It'll return a JSON array. Copy it back here in step 2.

Then a "Copy prompt" primary button (changes to green "Copied!" with check icon for 2s after click) and a dark code block (`bg: #0f172a`, `color: #e2e8f0`, mono font, max-height 340px, scrollable, white-space pre-wrap) showing the auto-generated prompt.

#### Prompt generator (`buildBackfillPrompt()`)

The prompt is generated **at modal open time** from the live catalog. Structure:

```
You are helping me bulk-import historical material purchase records into our construction site app (Aesta).

I'll attach photos of past purchase bills. Read each bill and return a JSON array of records — one object per material line item.

# Output schema

Return ONLY a JSON array. Each object MUST have these fields:

{
  "vendor": "string — vendor name as shown on bill",
  "material": "string — material name as shown on bill",
  "material_spec": "string — spec like '50kg bag · OPC 53 grade' (optional)",
  "qty": number,
  "unit": "string — bag | kg | cft | tonne | nos | piece | m | unit",
  "amount": number — total for this line in INR (just the number, no commas),
  "purchase_date": "YYYY-MM-DD",
  "section": "string — e.g. Foundation, Slab, Plaster (optional)",
  "kind": "own" | "group",
  "group_split": [{ "site": "srinivasan" | "padmavathy", "pct": number }] — only when kind is "group", must sum to 100,
  "payment_status": "settled" | "pending",
  "paid_by": "office" | "wallet" | "site" — only when payment_status is "settled",
  "used_qty": number — how much of this batch has already been consumed (0 if unknown),
  "quality": "good" | "fair" | "poor" (optional, default "good"),
  "notes": "string (optional)"
}

# Vendor catalog — match to existing IDs where possible. New vendor? Use the bill name as-is, we'll save as draft.

  - Pinveedu Manivel (id: pinveedu)
  - Rahman Timbers (id: rahman)
  - Father & Mother Building Materials (id: fmbm)
  ...

# Material catalog — match to existing IDs where possible. New material? Use bill name as-is.

  - PPC Cement · 50kg bag · Chettinad (id: ppc, unit: bag)
  - M Sand · Manufactured (id: msand, unit: cft)
  ...

# Site IDs

  - Srinivasan House & Shop (id: srinivasan)
  - Padmavathy Apartments (id: padmavathy)

# Rules

1. One row per material line item — split bills with multiple materials into multiple rows.
2. ALWAYS use ISO date (YYYY-MM-DD). If only month is shown, use the 15th.
3. If unsure whether a purchase was "own" or "group", default to "own".
4. For group purchases without explicit split shown on the bill, omit group_split (we'll ask the user).
5. For payment status, look for "PAID" stamps, signatures, or "balance" / "due" annotations. Default to "settled" if unclear.
6. used_qty should be 0 unless the bill or my note explicitly says how much was consumed.
7. amounts: just the line total — no GST breakdowns, no truck/loading charges as separate rows.
8. RETURN ONLY THE JSON ARRAY. No markdown, no commentary, no ```json wrapper.
```

**Production note:** Generate this server-side or via a cached client-side helper so the catalog stays fresh. Server-side is better — keeps the prompt versioned + lets you tune it without shipping a release.

### Step 2 — Paste JSON

Yellow info banner: *"Paste the entire JSON response. We'll show every row before saving — nothing's committed yet."*

Large `<textarea>` (14 rows, mono font, syntax-not-highlighted) with placeholder showing a sample row. Below: red error banner if parse fails (e.g. *"Unexpected token..."* + helpful instruction).

Tolerant parser (`normalizeBackfillRow`) handles:
- Field name variations: `qty` | `quantity`, `amount` | `total` | `line_total`, `purchase_date` | `date` | `purchaseDate`, `paid_by` | `paidBy`, `group_split` | `groupSplit`
- LLM responses wrapped in `{"records": [...]}` or `{"items": [...]}` or `{"purchases": [...]}` instead of bare arrays
- Matches vendor/material names case-insensitively against catalog
- Marks unmatched as drafts via `_vendorIsDraft` / `_materialIsDraft`

### Step 3 — Preview rows

Primary-tinted banner at top: *"N records parsed · M to ingest · K need(s) draft approval"*.

Dense table inside a card. Columns:
- Checkbox (untick to skip a row from ingest)
- Date (inline `<input type="date">`)
- Vendor (inline text input) — with **+V** warn-tinted draft tag if new vendor
- Material (inline text input) — with **+M** warn-tinted draft tag if new material
- Qty (inline number) + unit
- Amount (inline number, mono, right-aligned)
- Kind dropdown (Own / Group) — when Group, shows colored split chips below ("SHS 70% · PA 30%")
- Pay dropdown (Paid / Owed)
- Remove row button (×)

Max table height 430px, scrollable. Sticky column headers.

**Drafts warning panel** at bottom (visible when any row has drafts): warn-tinted, *"K records reference vendors or materials not in your catalog. They'll be saved as **drafts** — office reviews them later. Records still ingest now."*

**Submit** dispatches `BACKFILL_BATCH` with all `_include === true` rows.

---

## Reducer actions

Add to your existing reducer in `proto-state.js` (or equivalent production reducer):

### `BACKFILL_THREAD` — manual entry submit

```js
case 'BACKFILL_THREAD': {
  const p = action.payload;
  // Push draft vendor/material into catalog before the thread renders.
  // ProtoThreadRow looks them up by id; without this, the lookup returns
  // undefined and `mat.name` crashes React.
  if (p.materialIsDraft && !M.material(p.material)) {
    M_MATERIALS.push({
      id: p.material, name: p.materialName || p.material,
      spec: '(draft)', unit: p.unit, cat: 'Other', isDraft: true,
    });
  }
  if (p.vendorIsDraft && !M.vendor(p.vendor)) {
    M_VENDORS.push({
      id: p.vendor, name: p.vendorName || p.vendor,
      kind: 'Other', rating: 0, lastPrice: '—', leadTime: '—', isDraft: true,
    });
  }
  const id = 'HR-' + Date.now().toString(36).slice(-8).toUpperCase();
  const poId = 'PO-HR-' + Date.now().toString(36).slice(-6).toUpperCase();
  const exhausted = (p.usedQty || 0) >= p.qty;
  const t = {
    id, site: p.site || 'srinivasan', section: p.section || 'Historical',
    priority: 'normal', kind: p.kind, advance: false,
    stage: exhausted ? 'exhausted' : 'in-use',
    isHistorical: true,
    material: p.material, qty: p.qty, unit: p.unit,
    requestedBy: 'ajith', requestedAt: p.purchaseDate, boughtAt: p.purchaseDate,
    approvedBy: 'admin', approvedAt: p.purchaseDate,
    po: {
      id: poId, vendor: p.vendor, amount: p.amount, qty: p.qty,
      expected: p.purchaseDate, status: 'delivered',
      payer: p.kind === 'group' ? (p.payer || p.site) : p.site,
    },
    delivery: { date: p.purchaseDate, recordedBy: 'ajith', quality: p.quality || 'good', notes: p.notes },
    settlement: p.paymentStatus === 'settled'
      ? { status:'settled', amount: p.amount, paidBy: p.paidBy || 'office', settledAt: p.purchaseDate }
      : { status:'pending', amount: p.amount, paidBy: null },
    inventory: {
      batch: 'BF-' + Date.now().toString(36).slice(-7).toUpperCase(),
      received: p.qty, used: p.usedQty || 0, remaining: p.qty - (p.usedQty || 0),
    },
    interSiteUsage: p.kind === 'group' && p.groupSplit
      ? p.groupSplit.map(s => ({
          site: s.site,
          used: (p.usedQty || p.qty) * (s.pct / 100),
          value: p.amount * (s.pct / 100),
        }))
      : undefined,
    vendorIsDraft: p.vendorIsDraft,
    materialIsDraft: p.materialIsDraft,
  };
  return { ...state, threads: [t, ...state.threads],
    toast: { message:`Historical record ${id} added · ${p.kind === 'group' ? 'inter-site updated' : 'expense posted'}`, tone:'success' } };
}
```

### `BACKFILL_BATCH` — AI-assisted submit

```js
case 'BACKFILL_BATCH': {
  const rows = action.payload;
  // CRITICAL: push all draft vendors and materials into the catalog BEFORE
  // creating threads. Otherwise ProtoThreadRow crashes on M.material(t.material)
  // returning undefined.
  rows.forEach(p => {
    if (p.materialIsDraft && !M.material(p.material)) {
      M_MATERIALS.push({
        id: p.material, name: p.materialName || p.material,
        spec: '(draft)', unit: p.unit, cat: 'Other', isDraft: true,
      });
    }
    if (p.vendorIsDraft && !M.vendor(p.vendor)) {
      M_VENDORS.push({
        id: p.vendor, name: p.vendorName || p.vendor,
        kind: 'Other', rating: 0, lastPrice: '—', leadTime: '—', isDraft: true,
      });
    }
  });
  const newThreads = rows.map((p, i) => {
    const id = 'HR-' + Date.now().toString(36).slice(-6).toUpperCase() + '-' + (i+1).toString().padStart(2,'0');
    const poId = 'PO-HR-' + id.slice(3,9);
    const exhausted = (p.usedQty || 0) >= p.qty;
    return {
      id, site: p.site || 'srinivasan', section: p.section || 'Historical',
      priority:'normal', kind: p.kind, advance:false,
      stage: exhausted ? 'exhausted' : 'in-use', isHistorical: true,
      material: p.material, qty: p.qty, unit: p.unit,
      requestedBy:'ajith', requestedAt: p.purchaseDate, boughtAt: p.purchaseDate,
      approvedBy:'admin', approvedAt: p.purchaseDate,
      po: { id: poId, vendor: p.vendor, amount: p.amount, qty: p.qty,
            expected: p.purchaseDate, status:'delivered',
            payer: p.kind === 'group' ? (p.payer || p.site) : p.site },
      delivery: { date: p.purchaseDate, recordedBy:'ajith', quality: p.quality || 'good', notes: p.notes },
      settlement: p.paymentStatus === 'settled'
        ? { status:'settled', amount: p.amount, paidBy: p.paidBy || 'office', settledAt: p.purchaseDate }
        : { status:'pending', amount: p.amount, paidBy: null },
      inventory: { batch:'BF-' + Math.random().toString(36).slice(2,9).toUpperCase(),
                    received: p.qty, used: p.usedQty || 0, remaining: p.qty - (p.usedQty || 0) },
      interSiteUsage: p.kind === 'group' && p.groupSplit
        ? p.groupSplit.map(s => ({
            site: s.site,
            used: (p.usedQty || p.qty) * (s.pct / 100),
            value: p.amount * (s.pct / 100),
          })) : undefined,
      vendorIsDraft: p.vendorIsDraft,
      materialIsDraft: p.materialIsDraft,
    };
  });
  return { ...state, threads: [...newThreads, ...state.threads],
    toast: { message:`Ingested ${rows.length} historical record${rows.length !== 1 ? 's' : ''}`, tone:'success' } };
}
```

**Production note:** In Supabase, this is a single transaction:
1. Insert draft vendors / materials with `is_draft = true`
2. Insert `material_requests` rows with `is_historical = true`
3. Insert synthetic `purchase_orders`, `delivery_records`, `material_settlements`, `stock_inventory` rows
4. For group rows, insert `inter_site_material_settlements` rows from the % split
5. All wrapped in a single RPC so a row that fails to insert rolls back the whole transaction

---

## Thread schema additions

Add to your existing `Thread` type:

```ts
type Thread = {
  // ... existing fields
  isHistorical?: boolean,         // shows "Backfilled" warn-dot badge
  vendorIsDraft?: boolean,        // surfaces in "Drafts to review" admin queue
  materialIsDraft?: boolean,      // same
};
```

## Vendor / Material catalog schema additions

Both `Vendor` and `Material` get an `isDraft: boolean` field. Office reviews drafts from a dedicated queue at `/company/vendors?drafts=true` and `/company/materials?drafts=true` (not built in this prototype — add as a follow-up).

---

## Integration Points

### 1. Add to `+ New entry` launcher (in your `NewEntryMenu`)

Insert this `EntryChoice` between the existing "Bought at shop" and "Record delivery" cards. Also update the modal title to "Four ways material gets into the system."

```jsx
<EntryChoice
  icon="calendar" tone="warn"
  title="Backfill historical record"
  sub="Bulk-import past purchases that happened before the app. Manual entry or AI-assisted from bill photos."
  tag="One-time · skips full flow"
  onClick={() => choose('backfill')}
/>
```

### 2. Add modal routes (in your app root modal router)

```jsx
{modal?.kind === 'backfill' && (
  <BackfillMethodModal onClose={...} dispatch={dispatch}/>
)}
{modal?.kind === 'backfill-manual' && (
  <BackfillManualModal onClose={...} dispatch={dispatch}/>
)}
{modal?.kind === 'backfill-ai' && (
  <BackfillAIModal onClose={...} dispatch={dispatch}/>
)}
```

### 3. Add "Historical" filter chip (on the Hub)

In the filter chip row, after the "Spot" chip:

```jsx
<FilterChip
  active={filter === 'historical'}
  onClick={() => setFilter('historical')}
  count={state.threads.filter(t => t.isHistorical).length}
  accent="warn"
>
  <Icon name="calendar" size={11} color="currentColor"/> Historical
</FilterChip>
```

And in the threads memo:

```jsx
if (filter === 'historical') return state.threads.filter(t => t.isHistorical);
```

### 4. Add "Backfilled" badge on thread rows

In your `ProtoThreadRow`'s tags row (top of the material block), before the spot/group badges:

```jsx
{t.isHistorical && <Badge tone="warn" dot>Backfilled</Badge>}
```

### 5. (Optional) Add "Backfill" entry on Inventory + admin Drafts queue

- **Inventory page** — historical batches already render correctly because they have `inventory` records. Optionally add a "Backfilled" filter on the inventory tabs.
- **Drafts queue** — new admin page at `/company/vendors?drafts=true` and `/company/materials?drafts=true` showing all `isDraft: true` entries with a "Approve" / "Reject" / "Merge with existing" action per row. Out of scope for this prototype but worth tracking as a follow-up.

---

## Design tokens

Reuses everything from the existing Materials handoff. No new colors, fonts, or spacing tokens.

The only new visual primitive is the **`+V` / `+M` draft tag** in the preview table:

```js
const draftTag = {
  padding: '1px 5px',
  borderRadius: 3,
  background: T.warnSoft,        // #fffbeb
  color: T.warn,                 // #f59e0b
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0.3,
};
```

---

## Open questions / future work

1. **Per-row receipt attachments** — should the manual form allow attaching the original bill photo per record? Useful for audit. Not in this version.
2. **Bulk edit in preview** — multi-select rows in step 3 to bulk-set kind/payer/site? Useful for "all these are own-site" cases. Not in this version.
3. **Saved bill ingest sessions** — let users save a partially-completed AI ingest and resume later. Not in this version — paste must be re-done.
4. **Confidence scores from AI** — the LLM could include a `confidence: 0-1` per field; show flagged-low cells in red. Easy add later via a prompt update.
5. **Same flow for Rentals** — the prototype's pattern transfers 1:1. Add `BACKFILL_RENTAL` reducer, rental-specific prompt (rental period, daily/hourly rate, return date), and a method picker on the Rentals Hub's "+ New rental" launcher. Could be implemented in parallel.

---

## Verification flow

Before shipping, walk through:

1. **Manual entry happy path** — submit one own-site + one group purchase. Verify both appear on Hub with "Backfilled" badge. For group, verify inter-site debt updated.
2. **Manual entry with drafts** — type a new vendor "Some Random Shop" + new material "Aluminium sheet 2mm". Submit. Verify the new draft entries land in your vendor/material catalogs with `isDraft: true`.
3. **AI flow happy path** — copy prompt, paste this JSON, verify 2 rows ingest:
   ```json
   [{"vendor": "Sathish · Chettinad Cement", "material": "PPC Cement", "qty": 200, "amount": 58000, "purchase_date": "2025-12-15", "kind": "group", "group_split": [{"site":"srinivasan","pct":60},{"site":"padmavathy","pct":40}], "payment_status":"settled","paid_by":"office"}, {"vendor": "New Shop XYZ", "material": "Aluminium sheet", "qty": 50, "amount": 25000, "purchase_date": "2025-11-20", "kind": "own", "payment_status":"pending"}]
   ```
4. **AI flow with malformed JSON** — paste something invalid. Verify error message is shown and step doesn't advance.
5. **AI flow row editing** — change qty, amount, kind in preview. Untick a row. Verify counts update at top.
6. **Hub filter** — click Historical chip. Verify count matches threads with `isHistorical: true`.
7. **Inter-site contribution** — go to Inter-site page after group backfills. Verify worked-example math includes the historical rows.
