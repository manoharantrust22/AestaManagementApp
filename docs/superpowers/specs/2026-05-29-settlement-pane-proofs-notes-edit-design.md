# Settlement Inspect Pane — Proofs, Notes & Edit

**Date:** 2026-05-29
**Status:** Approved (pending spec review)
**Page:** `/site/payments` → Salary Settlements → right-side Inspect Pane → **Settlement** tab

## Problem

When a user clicks a settlement in the Salary Settlements view, the Inspect Pane's
**Settlement** tab shows Reference / Amount / Settled on / Payer / Payment mode /
Channel / Recorded by / Linked subcontract — but **never** shows the payment
screenshot or the notes, and offers **no way to edit** the settlement.

UPI/online payments are normally backed by a screenshot proof. The user needs to:

1. **See the screenshot** attached to a settlement, and open it full-size in-page to verify it.
2. **Be warned** when no screenshot is attached (it may not have been uploaded).
3. **Read any notes** attached to the settlement.
4. **Edit** the settlement from the pane, using the same edit dialog already used elsewhere.

## Root cause

The Settlement tab's data hook, `useSettlementDetails`
(`src/hooks/queries/useSettlementDetails.ts`), is a deliberately lightweight
projection of `settlement_groups`. Its `SELECT` omits `proof_url`, `proof_urls`,
and `notes`, so the pane has nothing to render for proofs/notes. Edit was never
wired into the pane at all.

Everything needed already exists in the codebase:

- **Full fetch:** `getSettlementDetailsByReference(supabase, ref, contractOnly?)` in
  `src/components/payments/SettlementRefDetailDialog.tsx:161` returns the full
  `SettlementDetails` including normalized + sanitized `proofUrls` and `notes`,
  `isCancelled`, and `isContract`. Currently **module-private**.
- **In-page lightbox:** `src/components/common/ScreenshotViewer.tsx` — `images: string[]`,
  zoom, next/prev, download. Already used by `DailySettlementEditDialog`.
- **Edit dialogs (hosted on the page):** `payments-content.tsx` holds `editTarget`
  state and renders `DailySettlementEditDialog` (daily/market) or
  `ContractSettlementEditDialog` (contract), branched on `details.isContract`,
  gated by `canEditSettlements = hasEditPermission(userProfile?.role)`. The same
  state also drives `deleteTarget` → `DeleteDailySettlementDialog` /
  `DeleteContractSettlementDialog`.
- **Detail dialog reused by roll-ups:** Both `WeeklyAggregateSettlement` and
  `DailyMarketWeeklySettlement` (sub-components in `SettlementTab.tsx`) already
  mount their own `SettlementRefDetailDialog` on ref-chip click — but pass no
  `canEdit`/`onEdit`/`onDelete`, so it is read-only there.

## Chosen approach — Reuse

Export the existing full-detail fetch, wrap it in a pane-specific hook, render
proofs/notes inline with the existing `ScreenshotViewer`, and wire Edit straight
to the page's existing edit dialogs via the existing `editTarget` state. No new
edit/delete dialogs, no schema changes, no duplicated proof-URL normalization.

Approaches rejected:

- **Delegate to the detail dialog** (pane just opens `SettlementRefDetailDialog`
  for everything): fails the requirement to show screenshot/notes *inline in the
  pane* and to send Edit *straight* to the edit dialog.
- **Bespoke pane UI**: most code; duplicates the doubled-bucket-prefix
  `sanitizeStorageUrl` normalization and the edit-dispatch logic — divergence risk.

## Design

### Decisions (confirmed with user)

- **Missing-screenshot warning:** always warn when no screenshot is attached,
  regardless of payment mode (cash included). Suppressed only when the settlement
  is cancelled.
- **Screenshot presentation:** thumbnail preview(s) inline; click opens the
  full-screen `ScreenshotViewer`.
- **Edit flow:** the pane's Edit button opens the edit dialog **directly**
  (skips the read-only detail dialog).
- **Scope:** all settlement views in the pane. The single-settlement view gets the
  rich inline treatment; the roll-up (list) views get a compact per-ref proof/notes
  indicator plus an editable detail dialog (full inline galleries per ref would
  clutter a list).
- **Cancelled settlements:** Edit is hidden; a muted "Cancelled" chip is shown
  instead, and the missing-screenshot warning is suppressed.

### 1. Single-settlement view — `SingleRefSettlement` (entity kinds `daily-date`, `weekly-week`)

**Data.** New hook `useSettlementFullDetails(ref, siteId)`
(`src/hooks/queries/useSettlementFullDetails.ts`):

- `queryFn` calls the exported `getSettlementDetailsByReference(supabase, ref)`,
  wrapped in `withTimeout(..., TIMEOUTS.QUERY, ...)` (same pattern as the existing
  hook).
- `queryKey: ["inspect-settlement-full", ref, siteId]`, `enabled: Boolean(ref)`,
  `staleTime: 60_000`.
- Returns full `SettlementDetails | null` (PGRST116 not-found → `null`, not throw).

`SingleRefSettlement` switches from `useSettlementDetails` to
`useSettlementFullDetails`. The existing read-only rows are re-derived from the
`SettlementDetails` shape (payment-mode/channel/payer label helpers stay; they may
be imported from a shared spot or kept local — implementation detail). Pending and
loading states are unchanged.

**Payer row with split sources.** `SettlementDetails` carries `payerSourceSplit`
(non-null when `payerSource` is the `'split'` sentinel). The current pane row shows
a single payer label. When `payerSourceSplit` is non-null, the Payer row shows
"Split" (or a compact "A ₹x · B ₹y" summary) instead of the raw sentinel, matching
how `SettlementRefDetailDialog` presents splits. Single-source rows are unchanged.

**Render additions** (below the existing rows, inside the same `Box`):

- **Notes block** — shown when `details.notes` is non-empty. Caption label "Notes"
  + body text with `whiteSpace: "pre-wrap"`. When empty, a muted "No notes" line.
- **Screenshot block:**
  - `details.proofUrls.length > 0` → a horizontal strip of 64×64 rounded
    thumbnails (mirrors `DailySettlementEditDialog`'s thumbnail style). Clicking a
    thumbnail sets `{ viewerOpen: true, viewerIndex: i }`.
  - `details.proofUrls.length === 0` **and not cancelled** → an amber
    "No screenshot uploaded" banner (`alpha(warning.main, 0.12)` bg, warning
    border — same banner idiom already used in this file).
  - Cancelled → no screenshot warning.
- **`ScreenshotViewer`** mounted locally: `open={viewerOpen}`,
  `images={details.proofUrls}`, `initialIndex={viewerIndex}`,
  `title="Payment Proof"`, `onClose`.
- **Footer Edit button:**
  - `canEditSettlement && !details.isCancelled` → `<Button>Edit settlement</Button>`
    calling `onEditSettlement(details)`.
  - `details.isCancelled` → muted "Cancelled" chip, no Edit button.
  - `!canEditSettlement` → no Edit button.

### 2. Roll-up views — `WeeklyAggregateSettlement`, `DailyMarketWeeklySettlement`

**Per-ref proof/notes indicator.** New hook `useSettlementProofFlags(refs, siteId)`
(`src/hooks/queries/useSettlementProofFlags.ts`):

- One query: `settlement_groups.select("settlement_reference, proof_url, proof_urls, notes").in("settlement_reference", refs)`.
- Returns `Map<ref, { hasProof: boolean; hasNotes: boolean }>`.
  `hasProof` = `proof_urls` non-empty array OR legacy `proof_url` present.
  `hasNotes` = `notes` non-empty.
- `enabled: refs.length > 0`, timeout-wrapped, `staleTime: 60_000`,
  `queryKey: ["settlement-proof-flags", siteId, [...refs].sort().join(",")]`.

Each renderer collects the refs it displays (`week.filledBy[].ref` /
`Array.from(d.refs)`), passes them to the hook, and renders a small icon next to
each ref chip:

- `hasProof` → a small 📷 / `ImageIcon` (action color).
- `!hasProof` → a small amber `ImageNotSupported`/⚠ icon (warning color).
- `hasNotes` → a small note dot/`NotesIcon` (muted).

Icons are decorative-but-labeled (`aria-label`), do not change the existing
chip click behavior.

**Make the embedded detail dialog editable.** Thread `canEdit`, `onEdit`,
`onDelete` into the `SettlementRefDetailDialog` instances these renderers already
mount:

```tsx
<SettlementRefDetailDialog
  open={refDetail !== null}
  settlementReference={refDetail}
  onClose={() => setRefDetail(null)}
  canEdit={canEditSettlement}
  onEdit={(d) => { setRefDetail(null); onEditSettlement?.(d); }}
  onDelete={(d) => { setRefDetail(null); onDeleteSettlement?.(d); }}
/>
```

`onEdit`/`onDelete` receive the already-fetched `SettlementDetails` from the
dialog — no re-fetch. They bubble up to the page handlers (below), which set
`editTarget`/`deleteTarget`, opening the same edit/delete dialogs used everywhere.

### 3. Plumbing

**`SettlementTab.tsx` props** gain three optional fields, forwarded to all three
sub-components as needed:

```ts
canEditSettlement?: boolean;
onEditSettlement?: (details: SettlementDetails) => void;
onDeleteSettlement?: (details: SettlementDetails) => void;
paneZIndex?: number; // forwarded to ScreenshotViewer for the fullscreen case
```

`SettlementDetails` is imported from `SettlementRefDetailDialog.tsx`
(already exported as a type).

**`InspectPane.tsx` + `types.ts`** — `InspectPaneProps` gains the same three edit
props; `InspectPane` forwards them to `<SettlementTab>` (alongside the existing
`onSettleClick`). `InspectPane` already receives `zIndex`; it forwards that to
`SettlementTab` as `paneZIndex`.

**`payments-content.tsx`** — the existing `<InspectPane>` mount gains:

```tsx
canEditSettlement={canEditSettlements}
onEditSettlement={(d) => setEditTarget(d)}
onDeleteSettlement={(d) => setDeleteTarget(d)}
```

`setEditTarget`/`setDeleteTarget` already exist and already drive the
contract-vs-daily edit/delete dialog branches and `invalidateSettlementsCaches`
on success. No new state, no new dialogs.

**`SettlementRefDetailDialog.tsx`** — change `getSettlementDetailsByReference`
from module-private to `export`.

### 4. Fullscreen z-index edge case

`ScreenshotViewer` is a default MUI modal (z-index 1300). When the pane is in
fullscreen mode the pane Drawer is bumped to z-index 1400, so the lightbox could
render underneath it.

Fix: add an optional `zIndex?: number` prop to `ScreenshotViewer` (applied to the
`Dialog` `sx` and its backdrop). Thread the pane's existing `zIndex`
(`isFullscreen ? 1400 : undefined`, already passed to `InspectPane`) down to
`SettlementTab` as `paneZIndex`, and `SingleRefSettlement` passes
`paneZIndex ? paneZIndex + 100 : undefined` to `ScreenshotViewer`. When not
fullscreen, `paneZIndex` is undefined and the lightbox keeps MUI's default.

## Out of scope

- No DB/schema migrations — `proof_url`, `proof_urls`, `notes` already exist on
  `settlement_groups`.
- No changes to settlement calculation, the edit dialogs' internals, the delete
  cascade, or `useSettlementsList`.
- Full inline proof galleries for every ref inside roll-up lists (rejected as
  cluttered; per-ref indicator + editable detail dialog chosen instead).

## Testing

- **Single settlement, UPI with proof:** thumbnail shows; click → `ScreenshotViewer`
  opens the image; zoom/next/prev/download work.
- **Single settlement, no proof:** amber "No screenshot uploaded" banner shows
  (any mode, including cash).
- **Single settlement with notes:** notes render with line breaks preserved.
- **Edit (daily/market):** Edit button → `DailySettlementEditDialog` opens
  pre-filled; save → caches invalidate, pane reflects changes on reopen.
- **Edit (contract):** `isContract` settlement → `ContractSettlementEditDialog`
  opens.
- **Cancelled settlement:** no Edit button, "Cancelled" chip shown, no missing-proof warning.
- **Permission:** with a non-edit role (`canEditSettlements === false`), no Edit
  button anywhere; detail dialog read-only in roll-ups.
- **Roll-up indicators:** refs with/without proofs show the correct icon; refs
  with notes show the notes marker; clicking a ref opens an editable detail dialog.
- **Fullscreen:** open the pane fullscreen, open a screenshot → lightbox renders
  above the pane.
- **Verify via Playwright** on `localhost:3000` per CLAUDE.md (auto-login at
  `/dev-login`), screenshot + console check.
