# Material Hub — Material/Date Filters + Row-level Delete

**Date:** 2026-06-06
**Page:** `/site/materials/hub` ([page.tsx](../../../src/app/(main)/site/materials/hub/page.tsx))
**Type:** Frontend-only. No migration, no new RPC, no backend change.

## Background

A previous session built a "filter by material + filter by date" control on the
Material Hub, but the work was never committed and is unrecoverable from git
(checked working tree, reflog, all branches, every named + lint-staged stash,
and all ~40 dangling commits — none touch the hub with a date/material filter).
The hub today only has **kind chips** (All / Needs action / Own / Group / Advance
/ Spot / Historical) via [MaterialHubFilterChips.tsx](../../../src/components/material-hub/MaterialHubFilterChips.tsx).

This spec rebuilds those filters and adds a third, related improvement: a
row-level delete affordance so a mistaken entry can be removed without digging
into the expanded "Correct" menu.

## Goals

1. **Filter by material** — autocomplete dropdown, single-select, clearable.
2. **Filter by date** — by **request date**, using the existing `DateRangePicker`.
3. **Row-level delete** — kebab menu per row → "Delete this entry & chain",
   reusing the proven cascade-delete path.

All three are additive and stack with the existing kind chips.

## Out of scope

- Changing the existing per-section "Correct" menu (`ThreadCorrectionMenu`).
- Touching the top-bar / global `DateRangeContext` date control.
- Deleting spot threads (no clean spot-cascade exists) or mirror threads.
- Recomputing kind-chip / KPI-strip counts off the filtered subset (they stay
  global — see Decision D4).

---

## Feature 1 — Filter by material (autocomplete dropdown)

A new **toolbar row directly under the existing filter chips** holds an MUI
`Autocomplete` (~240px, clearable, placeholder "Filter by material…").

- **Options** = the distinct materials present in the *current* threads, derived
  in-memory: collect each thread's primary `(material_id, material_name)` plus
  every entry in `thread.variants[]` (`material_id`, `material_name`), dedupe by
  `material_id`, sort by name. Deriving from loaded threads (not the full
  catalog) guarantees options always correspond to real rows — no empty matches.
- **Match rule** — a thread matches the selected material when its primary
  `material_id` equals the selection **OR** any of its `variants[].material_id`
  equals it. So a "TMT Rods · 3 sizes" thread surfaces under any one of its sizes.
- **State** — local `selectedMaterialId: string | null` in `page.tsx`.
- Selecting one narrows the list; clearing it (the `×`) restores all.

Inside a Dialog the codebase requires `slotProps={{ popper: { disablePortal:
false } }}` on Autocomplete — **not applicable here** because this Autocomplete
lives on the page, not inside a Dialog/Drawer.

## Feature 2 — Date-range filter (by request date)

Next to the material dropdown: `<DateRangePicker standalone compact />` — the
same component all-site expenses uses, in its **icon-trigger + presets/calendar**
mode ([DateRangePicker.tsx](../../../src/components/common/DateRangePicker.tsx)).

- **Local state**, independent of the top bar: `dateStart: Date | null`,
  `dateEnd: Date | null`. Wired as
  `startDate={dateStart} endDate={dateEnd} onChange={(s, e) => { setDateStart(s); setDateEnd(e); }}`.
  The picker emits `onChange(null, null)` when "All Time" is chosen → both null →
  no date filter.
- **Date basis** = `thread.requested_at` (the "requested 08 Dec 25" already shown
  on each card). Chosen deliberately: it is present on **every** thread, and for
  spot threads `requested_at === purchase_date`, so "by request date" coincides
  with "by purchase date" there. (Standard PO threads expose no separate
  purchase/order date — see Decision D2.)
- **Match rule** — with a range set, a thread matches when
  `requested_at` (start-of-day) falls within `[dateStart, dateEnd]` inclusive
  (compare via `dayjs`, day granularity). No range (either bound null) = all
  threads pass.

## Feature 3 — Row-level delete (kebab → "Delete this entry & chain")

A small kebab (`⋮`) menu on each thread row:

- **Desktop:** just left of the action button (5th grid column).
- **Mobile:** top-right of the card.

Single item: **"Delete this entry & chain"** (red). Clicking opens a confirmation
dialog that spells out the cascade — request → POs → deliveries → stock → batch
usage → settlements → expenses — then calls
`useDeleteMaterialRequestCascade().mutateAsync({ id: thread.source_row_id, siteId: thread.site_id })`
(the `cascade_delete_material_request` RPC). This is the **exact** path the buried
`ThreadCorrectionMenu` "Delete request & entire chain" already uses
([ThreadCorrectionMenu.tsx:182-202](../../../src/components/material-hub/ThreadCorrectionMenu.tsx#L182-L202)),
so cache invalidation and behavior are identical and proven.

- **Gating** — render only when
  `canEdit = !thread.is_mirror && hasEditPermission(userProfile?.role)`
  (mirroring [MaterialThreadExpanded.tsx:284](../../../src/components/material-hub/MaterialThreadExpanded.tsx#L284),
  `userProfile` from `useAuth()`) **AND** `thread.source === "material_request"`.
  Spot threads and read-only mirror threads do **not** get the kebab.
- Implemented as a self-contained `ThreadDeleteMenu` component so
  `MaterialThreadRow` stays clean. It owns its own menu anchor, confirm dialog,
  running/error state, and the cascade hook — same shape as the dialog block
  inside `ThreadCorrectionMenu`.
- The kebab `onClick` must `stopPropagation()` so it doesn't toggle the row's
  inline expand.

---

## Combine semantics

`filteredThreads` applies **all three** filters with AND:

```
kind chip  AND  material (if selected)  AND  date range (if set)
```

Concretely, extend the existing `filteredThreads` useMemo in `page.tsx`:
keep the current kind-chip branch, then `.filter(byMaterial).filter(byDate)`
where each predicate is a no-op pass-through when its control is inactive.

- Empty result reuses the existing **"No threads match this filter."** panel.
- A small **"Clear filters"** link appears in the toolbar row only when material
  or date is active; it resets both new controls (kind chip is left as-is).

## Decisions

- **D1 — Material = autocomplete dropdown** (user choice), single-select.
- **D2 — Date basis = request date for all threads** (user choice). Standard
  threads have no exposed PO/purchase date; `requested_at` is always present and
  equals the purchase date for spot, so this is the one consistent, complete
  field.
- **D3 — Filters stack (AND) with kind chips** (user choice), not replace.
- **D4 — Counts stay global.** Kind-chip counts and the KPI strip continue to
  reflect the full thread set (`threadCounts(threads)`); the two new controls
  only narrow what's displayed. Avoids churning the KPI numbers and keeps the
  chips a stable map of the whole site.
- **D5 — Row delete reuses the existing cascade path**, gated to standard
  (non-mirror, editable) request threads only.

## Files touched

| File | Change |
| --- | --- |
| [page.tsx](../../../src/app/(main)/site/materials/hub/page.tsx) | `selectedMaterialId` + `dateStart`/`dateEnd` local state; derive material options; extend `filteredThreads`; render the new toolbar row. |
| `MaterialHubToolbar.tsx` (new) | Material `Autocomplete` + `<DateRangePicker standalone compact>` + "Clear filters" link. |
| [MaterialThreadRow.tsx](../../../src/components/material-hub/MaterialThreadRow.tsx) | Mount `<ThreadDeleteMenu>` (desktop: 5th column near action button; mobile: card top-right). |
| `ThreadDeleteMenu.tsx` (new) | Kebab + confirm dialog, reusing `useDeleteMaterialRequestCascade`. |

Reuses existing `DateRangePicker`, `useDeleteMaterialRequestCascade`,
`hasEditPermission`, `useAuth`.

## Testing / verification

- Unit: a small pure helper for the combined predicate (material + date match)
  with cases — material primary match, variant match, date in/out of range,
  null-control pass-through — following the repo's Vitest pattern.
- Manual (per CLAUDE.md "After UI Changes"): `dev:cloud` + `/dev-login`,
  navigate to `/site/materials/hub`, exercise material select, date presets,
  stacked chip+material+date, "Clear filters", and the kebab delete (confirm
  dialog copy + that it only shows on editable standard threads). Screenshot +
  console-clean on desktop and mobile widths.

## Risks / notes

- Threads with a null/invalid `requested_at` would drop out of any date range —
  acceptable; the field is non-null in practice (`mr.request_date || mr.created_at`).
- The kebab must not trigger row expand (handled via `stopPropagation`).
- Deleting is irreversible; the confirm dialog and red styling are the guardrail,
  matching the existing "Correct → Delete" UX.
