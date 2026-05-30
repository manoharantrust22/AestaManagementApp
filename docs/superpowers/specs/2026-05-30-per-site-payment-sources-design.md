# Per-Site Payment Sources Management — Design

**Date:** 2026-05-30
**Status:** Approved (pending spec review)
**Author:** Brainstormed with user

## Background

The Add Funds dialog (`/company/engineer-wallet`) and other settlement dialogs render
"payment source" chips (Own Money, Amma Money, Client Money, Trust Account, Other Site,
Other, and on Srinivasan an extra "Site Cash"). These chips come from the per-site
`payer_sources` registry, read via `usePayerSources(siteId)`.

The per-site filtering **already works correctly** — each site shows only its own rows,
keyed in React Query by `["payer-sources", siteId]`. The reason Srinivasan uniquely shows
"Site Cash" is that an old migration (`20260506140000_payer_sources_registry.sql`,
self-heal step) materialised legacy `settlement_groups.payer_source` values into registry
rows. Padmavathy and Mathur have only the 6 seeded built-ins.

**The gap:** there is no UI to *manage* a site's sources. `payer_sources` is read in only
4 files and has **zero writes anywhere**. The original design called this deferred work
"Slice 2"; the table comment and the `BroadcastChannel("payer-sources-changed")` listener
in `usePayerSources` were left in place anticipating exactly this build.

This was surfaced when the user expected to configure sources per site (Padmavathy = many,
Srinivasan = only Client Money + Own Money) and went looking under Site Settings. There
they found the **"Payers" tab** (`SitePayersManager`), but that manages a *different,
unrelated* concept (`site_payers` = named people who contribute to expenses; currently
empty and unused — `has_multiple_payers = false` on both active sites). It is not wired to
the dialog chips.

## Goal

Give admin/office users a per-site editor for the payment-source chips: add custom sources,
hide built-ins, rename, reorder, and (optionally) mark a source as needing a free-text name
when picked. Surface it both as a Site Settings tab and as an inline "+ Add" inside the
Add Funds dialog. Keep the "Payers" (named-people) feature untouched and separate.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Model | New "Payment Sources" editor; keep the "Payers" tab separate |
| Permissions | Admin / office only (mirrors `SitePayersManager.canEdit`) |
| Reordering | Up/down buttons (no drag-and-drop in v1) |
| Inline "+ Add" in dialog | Included in v1 |
| Scope of management | Per-site (not per-company) |

## Feasibility (verified)

- **Schema is sufficient.** `payer_sources` already has `key, label, icon, color,
  sort_order, requires_name, is_built_in, is_hidden`, with `UNIQUE (site_id, key)`.
- **Custom keys persist end-to-end.** `toRpcArgs` sends `p_payer_source` as a plain string;
  migration `20260509130200_wallet_v2_drop_payer_source_whitelist.sql` removed the CHECK
  constraint on payer-source values, and Srinivasan's `site_cash` deposits already exist.
- **No accidental name prompt.** `requiresPayerName(source)` returns true only for `custom`
  and `other_site_money`; any custom key returns false.
- **Live refresh already wired.** `usePayerSources` invalidates `["payer-sources"]` on the
  `"payer-sources-changed"` BroadcastChannel; the manager only needs to post it.
- **Writes are blocked today.** Only SELECT RLS policies exist — a migration must add
  permissive INSERT/UPDATE/DELETE policies (this build's only backend change).

## Architecture

### Backend — one migration

`supabase/migrations/<ts>_payer_sources_write_policies.sql`:

- Add permissive `INSERT`, `UPDATE`, `DELETE` policies on `payer_sources` for
  `authenticated` (and `anon`, mirroring the existing SELECT policies and the
  app/proxy-layer auth model). Form: `USING (true) WITH CHECK (true)`.
- No schema change. (Optional, low-priority: an `updated_at` BEFORE UPDATE trigger; the app
  will also set `updated_at = now()` on updates, so the trigger is not required.)

Authorization is enforced in the UI (admin/office gate), consistent with how
`SitePayersManager` and the rest of the app already operate.

### Data layer — extend `src/hooks/queries/usePayerSources.ts`

- **`usePayerSourcesAdmin(siteId)`** — a manager-only read that returns **all** rows
  including hidden ones (the existing `usePayerSources` filters `is_hidden = false` for
  pickers, so the manager needs its own unfiltered fetch), ordered by `sort_order`.
- **`usePayerSourceMutations(siteId)`** — returns:
  - `addCustomSource({ label, requiresName })` → slugify `label` → `key`, dedupe per site,
    insert `{ is_built_in: false, is_hidden: false, sort_order: max+10, requires_name }`.
    Returns the new row (so the inline-add caller can auto-select it).
  - `updateSource(id, { label?, requiresName? })` → label editable for all; `requires_name`
    editable for custom only; `key` never changes.
  - `setHidden(id, hidden)` → toggle `is_hidden`.
  - `moveSource(id, direction)` → swap `sort_order` with the adjacent visible row.
  - `deleteSource(id)` → custom rows only.
  - Every mutation, on success: `queryClient.invalidateQueries(["payer-sources"])` **and**
    `new BroadcastChannel("payer-sources-changed").postMessage(...)`.

Slug rule: lowercase, non-alphanumeric → `_`, collapse repeats, trim `_`; on `(site_id,key)`
collision append `_2`, `_3`, …

### UI — `src/components/site-settings/SitePaymentSourcesManager.tsx`

Mirrors `SitePayersManager` structure and styling.

- Lists all sources for the site (incl. hidden, shown dimmed) with: icon, label,
  `Built-in`/`Custom` chip, a "needs name" indicator, and per-row controls:
  - visibility toggle (show/hide)
  - up / down (reorder)
  - edit (rename; for custom also toggle "ask for a name")
  - delete (custom only; confirm dialog warns that already-recorded entries keep a plain
    label)
- "Add source" button → dialog with **Label** (required) and **"Ask for a name when
  picked"** toggle (default off).
- `canEdit = role === "admin" || role === "office"`. Non-editors see the list **read-only**
  (all add/edit/hide/reorder/delete controls hidden), mirroring `SitePayersManager`.
- **Guard:** block hiding/deleting the **last visible** source (an all-hidden site would
  fall back to the hardcoded 6 in the picker, which is confusing).

### UI — wire the tab into `src/app/(main)/site/settings/page.tsx`

Add a 3rd tab after "Payers": **"Payment Sources"** (icon e.g. `AccountBalanceWallet`),
rendering `<SitePaymentSourcesManager siteId={siteId} />` in a `TabPanel`.

### UI — inline "+ Add" in `src/components/settlement/PayerSourceSelector.tsx`

- After the option chips, render a small "+ Add" chip **only when** `siteId` is present
  **and** the current user is admin/office (read role via `useAuth()` inside the selector).
- Click → lightweight inline input (popover or inline `TextField`) for the label →
  `addCustomSource({ label, requiresName: false })` → on success the new chip appears
  (via invalidation) and is auto-selected by calling `onChange(newRow.key)`.
- Because this lives in the shared selector, every `siteId`-aware caller (Add Funds today,
  plus any future wired callers) gets the shortcut consistently.

## Data flow

```
Settings tab / inline +Add
        │ write
        ▼
   payer_sources  ──(invalidate + BroadcastChannel "payer-sources-changed")──┐
        │ read (is_hidden=false, by sort_order)                              │
        ▼                                                                    │
 usePayerSources(siteId) ──► PayerSourceSelector chips ◄──── live refresh ───┘
```

## Edge cases & handling

- **Hidden built-in still in history:** `useResolvePayerSource` reads the filtered hook, so
  a hidden row won't be found and the label falls back to `humanizeKey(key)`. For built-ins
  this yields the same text; for renamed customs it degrades to a humanized label. Acceptable
  for v1 (display only; amounts unaffected). Noted as a possible later refinement (resolve
  including hidden rows).
- **Delete vs hide:** `payer_source` is a free-text column (no FK), so delete is
  referentially safe but loses the registry label for past entries → prefer hide; delete is
  allowed for custom rows with a clear warning.
- **All-hidden footgun:** prevented by the last-visible-source guard.
- **Built-in immutability:** `key` and `is_built_in` never change; `requires_name` for
  built-ins stays as seeded.

## Out of scope (flagged, not built)

- Merging the "Payers" (named-people) tab with payment sources.
- Migrating the ~4 dialogs that still render the hardcoded 6 and don't pass `siteId`
  (some settlement dialogs). They won't show custom sources until wired to pass `siteId`.
  The Add Funds dialog is already registry-aware and benefits immediately. Tracked as a
  follow-up.
- Per-source `color`/`icon` editing (icons default; not user-editable in v1).

## Testing

- **Unit:** slug generation + dedupe; `usePayerSourceMutations` invalidation/broadcast (mock
  Supabase + BroadcastChannel), mirroring `usePayerSources.test.tsx`.
- **Component:** `SitePaymentSourcesManager` — add/hide/rename/reorder/delete render and
  gating by role; last-visible-source guard.
- **Manual (Playwright, per CLAUDE.md):** on local, open `/site/settings` → Payment Sources,
  hide all but Client Money + Own Money on a site, confirm the Add Funds dialog reflects it
  live; add a custom "Site Cash" and confirm it appears and can be selected and saved.

## Rollout

Backend migration first (write policies), then code — per the project's "schema before
code" rule. No destructive operations; additive only.
