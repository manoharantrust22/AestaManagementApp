# Per-tab Site & Company selection

**Date:** 2026-05-29
**Status:** Approved — ready for implementation plan

## Problem

When the user opens the app in two browser tabs to compare two sites (e.g. "All Time" expenses for Site A vs Site B), switching the site selector in one tab also changes the site in the other tab. This makes side-by-side comparison impossible.

The same applies to the company selector.

## Root cause

The selected site is persisted in three stores by `setSelectedSite` in
`src/contexts/SiteContext/SiteProvider.tsx`:

| Store | Scope | Purpose |
|-------|-------|---------|
| `sessionStorage["selectedSiteId"]` | **Per-tab** | Intended isolation mechanism |
| `localStorage["selectedSiteId"]` | Shared across tabs | Persist last-used across sessions |
| Cookie `selectedSiteId` (1-year) | Shared across tabs | SSR of `/site/dashboard` & `/site/attendance` |

On switch, all three are written. The defect is the **restore order**: on mount
(`SiteProvider.tsx` lines 207-211) and in the `fetchSites` no-`prevSelected`
branch (lines 156-159), the provider reads `cookie || (sessionStorage ||
localStorage)`. Because the **shared cookie wins**, any time a tab re-derives its
selection (page reload, provider remount, fetch with no in-memory selection) it
picks up whatever site the *other* tab last chose. The per-tab `sessionStorage`
value is silently overridden.

It is not a live sync — the active provider has no `storage` event listener — so
the jump happens on reload/remount, not instantly.

`CompanyProvider.tsx` has the same class of problem but is simpler: it persists
to `localStorage` only (no `sessionStorage`, no cookie), so every tab shares one
company.

## Decisions (confirmed with user)

1. **Behavior model:** Always-independent tabs. Every tab keeps its own selected
   site/company. A brand-new tab inherits the last-used value as its *starting
   point*, then diverges freely. Switching in one tab never affects another.
2. **Scope:** Both Site **and** Company are isolated per-tab.
3. **SSR tradeoff:** Accepted (see below).

## Design

### Core idea

Make per-tab `sessionStorage` the source of truth. Treat the shared stores
(`localStorage`, cookie) only as the **seed** for a tab that has no
`sessionStorage` value yet.

**Restore priority becomes:** `sessionStorage` (this tab) → `localStorage`
(last-used, shared) → `cookie` (last-used, shared).

A fresh tab has no `sessionStorage` entry, so it seeds from the shared last-used
value, writes that into its own `sessionStorage`, and from then on owns its
choice. No other tab can override it.

### Change 1 — `src/contexts/SiteContext/SiteProvider.tsx`

`sessionStorage` already exists and `getStoredSiteId()` is already session-first.
The only bug is the cookie being read first on the two restore paths.

- **Mount restore** (lines 207-211): change `savedSiteId = cookieSiteId ||
  localStorageSiteId` → `savedSiteId = getStoredSiteId() ?? cookieSiteId` so the
  per-tab/local value wins and the cookie is the last fallback.
- **`fetchSites` no-prevSelected branch** (lines 156-159): same flip —
  `getStoredSiteId() ?? cookieSiteId` instead of `cookieSiteId ||
  localStorageSiteId`.
- `setSelectedSite` continues to write all three stores (unchanged) so the
  shared seed and SSR cookie stay current.
- After seeding a fresh tab, ensure `storeSiteId(...)` is called (it already
  writes session + local) so the tab owns its selection.

Estimated ~4 lines changed.

### Change 2 — `src/contexts/CompanyContext/CompanyProvider.tsx`

Add `sessionStorage` as the per-tab source of truth (currently `localStorage`
only; no cookie / no SSR consumer):

- `storeCompanyId(id)`: write `sessionStorage` **and** `localStorage` (mirror the
  site helper). On clear, remove from both.
- `getStoredCompanyId()`: read `sessionStorage` first, then `localStorage`.
- Both restore paths (mount effect lines 196-217, `fetchCompanies`
  no-`prevSelected` branch lines 165-181) automatically inherit the new
  priority through `getStoredCompanyId()`; a fresh tab seeds from `localStorage`
  and `storeCompanyId` writes it back into `sessionStorage`.

Estimated ~10 lines changed.

### Accepted tradeoff — SSR pages only

`/site/dashboard` and `/site/attendance` render server-side from the **shared
cookie** (`getSelectedSiteIdFromCookie`), which tracks whichever tab switched
last. If Tab A (Site X) is reloaded after Tab B switched to Site Y, the server
briefly renders Y, then the client corrects to X. This is already handled by the
existing reconciliation `useServerData = serverSiteId === siteId` in
`dashboard-content.tsx` (and the analogous attendance flow): the data is never
wrong — it costs a skeleton flash plus one client-side refetch, only on reload of
those two pages.

Making SSR itself per-tab would require passing the tab's site id to the server,
which a shared cookie cannot express cleanly. Out of scope for v1.

### Alignment with existing intent

The tab coordinator already treats site context as per-tab: the `SITE_CHANGED`
broadcast handler in `src/lib/cache/sync.ts` (lines 499-503) only logs and
comments *"Each tab manages its own site context independently."* This change
makes the storage layer match that stated intent.

## Blast radius

The only readers of `selectedSiteId` / `selectedCompanyId` from web storage are
the two providers themselves (verified by grep). `SiteContext.legacy.tsx` is not
mounted. No page reads these keys from `localStorage` directly, so no other call
sites need changes.

## Out of scope

- Per-tab SSR rendering of dashboard/attendance.
- A separate explicit "pin / compare" UI affordance (rejected in favor of
  always-independent tabs).
- Any change to React Query cache persistence (keys already include site id, so
  no cross-site collision).

## Testing

- **Manual (Playwright, two tabs):**
  1. Open Tab A and Tab B. Set Tab A → Site X, Tab B → Site Y.
  2. Switch Tab B back and forth; confirm Tab A stays on X.
  3. Reload Tab A; confirm it stays on X (sessionStorage wins over the shared
     cookie/localStorage).
  4. Open a fresh Tab C; confirm it inherits the last-used site as its starting
     point, then can diverge independently.
  5. Repeat the equivalent flow for the company selector.
- **Unit (if practical):** assert the storage-helper read priority is
  session → local (→ cookie for site).
