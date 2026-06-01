# Material Hub — Mobile detail bottom sheet

**Date:** 2026-06-01
**Scope:** Frontend-only. No migration.
**Route affected:** `/site/materials/hub`

## Problem

On the Material Hub cards layout, tapping a card on **desktop** expands
[`MaterialThreadExpanded`](../../../src/components/material-hub/MaterialThreadExpanded.tsx)
inline below the row (6 detail blocks: Request, Purchase order, Delivery &
quality, Settlement, Inventory · stock, Inter-site usage / Expenses).

On **mobile**, that inline panel is gated behind `!isMobile`
([`MaterialThreadRow.tsx:449`](../../../src/components/material-hub/MaterialThreadRow.tsx)).
The row's `onSelect` still toggles `expandedId`, but nothing renders — so
**tapping a card on mobile does nothing visible.** The original code comment
says "mobile uses tap-through," but the tap-through view was never built.

## Goal

When an engineer taps a card on mobile, open a polished, native-feeling
**bottom sheet** showing the full thread detail with **full action parity**
(corrections, attachments, usage log, Settle / Push-to-expense buttons) — not
a read-only view.

## Decisions (confirmed with user)

- **Presentation pattern:** Bottom sheet that slides up over the list, with a
  drag handle; swipe-down / backdrop-tap / ✕ to close. (Chosen over a
  full-screen page and over an inline accordion.)
- **Action scope:** Full parity with the desktop expanded view — engineers can
  act from their phone, not just look.

## Approach

Reuse the existing `MaterialThreadExpanded` component verbatim inside the
sheet. It already reflows from a 3-column grid to a single column at the `xs`
breakpoint (`gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }`), and all
of its actions (correction menus, attachment links, usage-log toggle, "Settle
this batch", "Push to material expense") are internal to it — so parity is free
and there is no logic to duplicate.

## Components

### New: `src/components/material-hub/MaterialThreadDetailSheet.tsx`

- `SwipeableDrawer anchor="bottom"`, matching the established pattern in
  [`QuickUsageSheet`](../../../src/components/inventory/QuickUsageSheet.tsx):
  - `PaperProps={{ sx: { borderRadius: "18px 18px 0 0", maxWidth: 520, mx: "auto" } }}`
  - `disableSwipeToOpen`, `onOpen={() => {}}` (opened programmatically, not by
    edge-swipe).
- **Sticky header** (stays pinned while the body scrolls):
  - 36×4 drag handle (decorative + swipe affordance).
  - Title: `{thread.qty} {thread.material_unit} · {material/category name}`.
  - Secondary line: thread id chip + stage badge + the same Group / Spot /
    Advance / Backfilled chips the row shows.
  - ✕ close button (right).
- **Scrollable body:** `maxHeight: ~92vh`, `overflowY: auto`, renders
  `<MaterialThreadExpanded thread={thread} />`.
- **Props:** `{ open: boolean; thread: MaterialThread | null; onClose: () => void }`.
- Body renders only when `thread` is non-null. Because the Drawer unmounts its
  children when closed (default `keepMounted={false}`), the group-batch RPCs
  inside `MaterialThreadExpanded` (`useBatchSettlementSummary`,
  `useBatchVariantSummary`, `useInterSiteBalances`) fire on open and tear down
  on close — no fetching for unopened threads.

### Changed: `src/app/(main)/site/materials/hub/page.tsx`

- Add `const isMobile = useMediaQuery('(max-width:819px)')` — the same
  `HUB_BREAKPOINT_PX - 1` (820 − 1) the row uses, so page and row agree on what
  "mobile" means.
- Derive `expandedThread = filteredThreads.find(t => t.source_row_id === expandedId) ?? null`.
- Render `<MaterialThreadDetailSheet open={isMobile && !!expandedThread} thread={expandedThread} onClose={() => setExpandedId(null)} />`.
- **Desktop unchanged:** `isMobile` is false on desktop, so the sheet never
  opens and the existing inline expansion in the row keeps working exactly as
  today.

### Changed: `src/components/material-hub/MaterialThreadRow.tsx`

- No behavioral change to tap handling: tapping the card body already calls
  `onSelect` (toggles `expandedId` on the page); the mobile action button is a
  separate, non-overlapping tap target outside the clickable `Box`. The inline
  `MaterialThreadExpanded` stays gated to `!isMobile`.
- **Add discoverability affordance:** a subtle right-aligned `Details ›`
  chevron hint on the mobile card (the stage-badge row), so the card visibly
  reads as tappable. (Addresses the "it does nothing" perception, which is
  partly a missing-feedback problem.)

## Data flow

```
tap card body
  → MaterialThreadRow onSelect()
  → page setExpandedId(source_row_id)
  → page: expandedThread resolved, isMobile === true
  → MaterialThreadDetailSheet open
  → renders <MaterialThreadExpanded thread> (RPCs fire)
close (swipe / backdrop / ✕)
  → onClose() → setExpandedId(null) → sheet unmounts body
```

## Edge cases

- **Mirror threads:** `MaterialThreadExpanded` already computes
  `canEdit = !t.is_mirror && hasEditPermission(...)` and shows a read-only
  banner — carries into the sheet unchanged.
- **Spot / no-PO / early-stage threads:** each block already has its own empty
  state ("No PO yet", "Pending delivery", etc.).
- **Re-selecting:** while the sheet is open the backdrop covers the list, so the
  user closes before tapping another card; toggling the same id to `null` also
  closes — both resolve to the same `onClose` path.
- **Table layout:** the cards/table toggle is hidden on mobile
  (`display: { xs: "none", md: "inline-flex" }`), so mobile is always cards —
  the sheet is the only mobile detail surface needed.

## Known limitation

The Android hardware back button closes the page rather than the sheet —
consistent with every other Dialog/Drawer in the app. Not adding browser
history trapping (YAGNI).

## Verification

Per CLAUDE.md "After UI Changes":
1. `/dev-login`, navigate to `/site/materials/hub`.
2. Resize Playwright to a mobile viewport (390×844).
3. Tap a card → screenshot the bottom sheet; confirm the 6 blocks render in a
   single column and the header shows title + chips + ✕.
4. Verify console is clean (no errors/warnings/hydration).
5. Test close via ✕, backdrop, and swipe-down.
6. Spot-check a group thread (inter-site usage block + Settle button) and a
   mirror thread (read-only banner).

## Out of scope

- Desktop layout (no change).
- Table layout (mobile-hidden).
- Any data/schema/RPC change.
