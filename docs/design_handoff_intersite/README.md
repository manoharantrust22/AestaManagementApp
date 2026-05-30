# Handoff Addendum: Inter-Site Settlement — Materials Hub

> **Additive to the `design_handoff_materials_redesign/` package you already implemented.** This documents just the **Inter-Site Settlement** surface so you can build it in the real codebase. No redesign of what's working — this is the one screen + the debt math behind it.

## What this is

When two (or more) sites in a **cluster** share a group purchase, only one site pays the vendor. As each site consumes the shared batch, it accrues a debt to the paying site. **Inter-Site Settlement** is the ledger that tracks those cross-site debts and nets them into a single transfer.

### The core example (your words)

> Batch A is paid by **Padmavathy**. Srinivasan uses some → Srinivasan owes Padmavathy **₹500**.
> Batch B is paid by **Srinivasan**. Padmavathy uses some → Padmavathy owes Srinivasan **₹1,250**.
> **Net:** ₹1,250 − ₹500 = **₹750**, and **Padmavathy pays Srinivasan ₹750**.

That netting — collapsing two directional debts into one transfer for the difference — is the whole point of the screen. Two transfers become one; the smaller debt cancels into the larger.

## How the data flows in

You don't enter inter-site debt manually. It's **derived** from group purchases that have per-site usage recorded:

1. A group PO is created with a `payer` site.
2. As the batch is consumed, each site's usage is logged → produces `interSiteUsage: [{ site, used, value }]` rows on the thread.
3. The settlement screen reads every group thread's `interSiteUsage`, and for each usage row where `site !== payer`, that site **owes** the payer `value`.

So the screen is a **pure projection** over your existing thread/order data — no separate inter-site table is strictly required to *compute* it (though you'll want one to record actual settlements; see "Production data model" below).

---

## The debt computation (authoritative logic)

This is the single function that powers everything on the screen. Port it as a server-side view / RPC or a client selector — but keep the logic identical.

```js
// Given all threads + which site "I" am, returns my debt position.
function interSiteDebt(threads, mySite) {
  let othersOwe = 0;   // others owe me (for using batches I paid for)
  let iOwe = 0;        // I owe others (for using batches they paid for)
  const detail = [];   // { from, to, thread, used, value }

  threads.forEach(t => {
    if (t.kind !== 'group' || !t.interSiteUsage) return;
    // Standard threads carry payer on t.po.payer; spot/backfill on t.site.
    const payerId = t.po ? t.po.payer : t.site;

    t.interSiteUsage.forEach(u => {
      if (u.site === payerId) return;          // the payer doesn't owe itself
      if (u.site === mySite) {
        iOwe += u.value;
        detail.push({ from: mySite, to: payerId, thread: t, used: u.used, value: u.value });
      }
      if (payerId === mySite) {
        othersOwe += u.value;
        detail.push({ from: u.site, to: mySite, thread: t, used: u.used, value: u.value });
      }
    });
  });

  return { othersOwe, iOwe, net: othersOwe - iOwe, detail };
}
```

**Net interpretation:**
- `net > 0` → others owe you on balance → **they pay you** `net`
- `net < 0` → you owe others on balance → **you pay them** `|net|`
- `net === 0` → all square

For the **netting math panel** (the worked example), split `detail` by direction:

```js
const debt = interSiteDebt(threads, 'srinivasan');
const owedToMe   = debt.detail.filter(d => d.to === 'srinivasan');     // other → me
const owedByMe   = debt.detail.filter(d => d.from === 'srinivasan');   // me → other
const totalOwedToMe = sum(owedToMe.map(d => d.value));
const totalOwedByMe = sum(owedByMe.map(d => d.value));
const netAmount = Math.abs(totalOwedToMe - totalOwedByMe);
const netPayer    = totalOwedByMe > totalOwedToMe ? me    : other;     // who transfers
const netReceiver = totalOwedByMe > totalOwedToMe ? other : me;        // who receives
```

> **Multi-site clusters (>2 sites):** the two-pane "you vs them" framing assumes a 2-site cluster. For 3+, compute a per-pair matrix `debt[a][b]` and net each pair independently, OR run a min-cash-flow settlement (greedy: largest creditor ↔ largest debtor) to minimize the number of transfers. The prototype ships the 2-site case; the data model below supports N.

---

## Screen layout

Route: `/site/materials/inter-site` (sibling of Hub & Inventory under Materials).

Top to bottom:

### 1. Header
- Back-to-Hub chevron
- Title "Inter-Site Settlement" + a **cluster** pink-dot badge ("Pudukkottai Cluster")
- Sub: "How material costs reconcile between sites that share group purchases."
- Right: **"Net settle ₹X"** primary button (only when `netAmount > 0`) → dispatches the settle action

### 2. Balance card (dark gradient hero)

`linear-gradient(135deg, #1e293b 0%, #0f172a 100%)`, white text, 3-column grid (`1fr · auto · 1fr`; stacks to 1 column on mobile):

| Left | Center | Right |
|---|---|---|
| **You owe** label | 36px circle with link icon | **Others owe you** label |
| `iOwe` in red `#f87171`, 30px mono 800 | "NET" uppercase | `othersOwe` in green `#34d399`, 30px mono 800 |
| "N records · for using their batches" | `±net` in red/green | "N records · for using your batches" |

### 3. Netting math — the worked example (the key teaching panel)

White card, header "How this nets · worked example" + "Auto-computed" primary badge + sub "Smaller debt cancels into the larger. Settle once for the difference instead of two separate transfers."

Inside:

**a) Two DirectionPanels side-by-side** (`1fr 1fr`, stacks on mobile):
- **Panel A** (others → me): green accent, header `[PA] → [SHS] used your batches`, big `totalOwedToMe`, "N records" count, then up to 4 contributing batch rows (`batch id · material · ₹value`)
- **Panel B** (me → others): red accent, header `[SHS] → [PA] used their batches`, big `totalOwedByMe`, same row treatment
- Empty state per panel when a direction has no debt

**b) The equation block** (dashed-border, bg-tinted, mono font):

```
THE MATH
  + ₹1,250   (PA owes SHS)         ← green if > 0
  − ₹500     (SHS owes PA)         ← red if > 0
  ─────────
  = ₹750     → PA pays SHS          ← bold, 16px
```

**c) Settle action row** (primary-soft tinted, only when `netAmount > 0`):
> info icon · "**Padmavathy** will transfer **₹750** to **Srinivasan**. Both sites' material-expense ledgers update automatically." · **Settle now** button

### 4. Site chips strip
A small row showing the cluster members with bidirectional arrows + a one-line summary: "Net: Padmavathy pays Srinivasan ₹750." (or "All even.")

### 5. Shared batches grid (the running record)

2-column grid (1 on mobile) of cards, one per active group batch **that has logged usage** (`kind === 'group' && inventory.remaining > 0 && interSiteUsage?.length > 0`). Each card:
- Batch id (mono) + ADVANCE tag if applicable
- Material name + received qty
- Vendor + "paid by **{payer short}**" (payer in their site color)
- ₹ amount + % used
- **Stacked usage bar** — one segment per site in that site's accent color, plus a gray "unused" remainder
- Legend: per-site `short · qty` chips + unused chip

Filter note: only include batches with `interSiteUsage`. Provisional spot batches (split not finalized) and zero-usage batches are excluded — they appear here once usage/allocation is recorded.

---

## The settle action

`NET_SETTLE_INTERSITE { fromSite, toSite, amount }`

In the prototype this just fires a success toast. **In production it should:**

1. Record a settlement transaction row (`inter_site_settlements`) with from/to/amount/date/mode/by.
2. Post the settled amounts into each site's **Material Expenses** ledger:
   - The non-payer's consumed `value` becomes a material expense **on the non-payer's books** (it's their material cost).
   - The payer, who fronted the vendor payment, gets that amount **credited back** (they were carrying it).
3. Mark the contributing `interSiteUsage` rows as settled (so they drop out of the live `net` next time — you settle the delta, then the ledger resets to zero for those batches).
4. Optionally move the cash via the same rails you use for vendor settlement (office bank / site funds / engineer wallet).

**Important nuance from your flow:** the per-site material expense only finalizes when the batch is **fully consumed** (or at settle time). While a batch is mid-consumption, the debt is *accruing* and shown live; the expense ledger posting happens on settle / batch-completion so you don't post partial costs that later change.

---

## Production data model (Supabase)

You likely already have most of this. The inter-site piece needs:

```sql
-- One row per cross-site consumption event (or aggregated per batch+site).
-- This is what interSiteUsage represents.
inter_site_material_usage (
  id, group_batch_id (fk), consuming_site_id (fk),
  qty_used numeric, value numeric,           -- value = qty_used * unit_cost
  paying_site_id (fk),                       -- denormalized from the batch's PO
  recorded_at, recorded_by,
  settled boolean default false,             -- flips true on net-settle
  settlement_id (fk nullable)
)

-- One row per actual net transfer between two sites.
inter_site_settlements (
  id, cluster_id, from_site_id, to_site_id,
  amount numeric, settled_at, settled_by,
  mode text,                                 -- 'bank' | 'cash' | 'wallet'
  notes text
)
```

**The live `net` is a view/RPC** over `inter_site_material_usage WHERE settled = false`, grouped by site-pair. The settle action inserts an `inter_site_settlements` row, flips the contributing usage rows to `settled = true`, and posts the expense ledger entries — all in one transaction.

RLS: a site engineer sees only their own site's debts; an admin/office role sees the whole cluster.

---

## Reference files (in this bundle)

These are the prototype implementations to read for exact visual + interaction detail. **Don't copy the inline styles** — match what they render using your component primitives.

| File | What to read |
|---|---|
| `proto-screens.jsx` | `ProtoInterSite` (the screen), `NettingMath` (worked-example panel), `DirectionPanel` (one direction's card) |
| `mat-intersite.jsx` | `SharedBatchCard` (batch card with stacked usage bar), `SiteChip` |
| `proto-state.js` | `protoInterSiteDebt` (the debt math — lines ~524-547), `NET_SETTLE_INTERSITE` reducer case (~303) |
| `utils.jsx` | `T` tokens, `Icon`, `Badge`, `inr`/`inrK` formatters, `fmtDate` |

The screen is wired in `proto-app.jsx` via `state.view === 'intersite'` and reachable from the sidebar (Materials → Inter-site) and the Hub's "Inter-site net" KPI tile (clickable → navigates to this view).

---

## Design tokens (unchanged)

```js
T.primary     '#2563eb'   primarySoft '#eff6ff'   // own-site accent
T.pink        '#ec4899'   pinkSoft    '#fdf2f8'    // group / cluster accent
T.success     '#10b981'   successSoft '#ecfdf5'    // "others owe you" / credit
T.danger      '#ef4444'   dangerSoft  '#fef2f2'    // "you owe" / debit
T.text '#0f172a'  muted '#64748b'  subtle '#94a3b8'  border '#e2e8f0'  bg '#f5f7fa'
font: Inter   mono: JetBrains Mono
```

Site accent colors: Srinivasan = `#2563eb` (blue), Padmavathy = `#ec4899` (pink). Use these consistently for the stacked usage bars + site chips so a glance tells you whose consumption is whose.

---

## Build checklist

1. **Debt selector / RPC** — port `interSiteDebt()` exactly. Unit-test the netting with the ₹500/₹1,250→₹750 example.
2. **Balance card** — dark hero, you-owe / net / others-owe.
3. **Netting math panel** — two direction panels + equation block + settle row. This is the teaching surface; don't skip the worked example, it's what makes the concept legible.
4. **Shared batches grid** — stacked per-site usage bars.
5. **Net-settle action** — record settlement, post expense ledger entries, flip usage rows settled, move cash. Wrap in one transaction.
6. **Sidebar + KPI entry points** — Materials → Inter-site nav item; Hub "Inter-site net" KPI tile deep-links here.
7. **RLS** — engineer sees own-site debts; office sees the cluster.

## Open questions

1. **Settle timing** — net-settle the whole cluster balance anytime, or only once contributing batches are fully consumed? Prototype lets you settle the live delta anytime. Confirm with finance whether mid-consumption settlement is allowed.
2. **3+ site clusters** — confirm whether clusters ever exceed 2 sites. If yes, implement the min-cash-flow netting (the data model already supports N; only the UI's 2-pane framing needs to become an N-row matrix or per-pair list).
3. **Partial settlement** — allow settling part of the net, or all-or-nothing? Prototype is all-or-nothing per settle.
4. **Expense ledger posting point** — confirm the exact moment a non-payer site's consumption becomes a posted material expense (on settle vs on batch-completion). This affects month-end reporting.
