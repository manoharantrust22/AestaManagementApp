# Aesta Construction Manager

## Project Overview
Next.js construction management application with Supabase backend, MUI components, and React Query for data fetching.

## Tech Stack
- **Framework**: Next.js 15
- **UI**: MUI (Material UI) v7, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **State**: React Query (TanStack Query)
- **Testing**: Vitest, React Testing Library

## Common Commands
```bash
npm run dev          # Start dev server (default port 3000)
npm run build        # Production build
npm run test         # Run tests
npm run db:start     # Start local Supabase
npm run db:reset     # Reset local database
```

## "Move to Prod" Command
When the user says **"move to prod"** or similar (e.g., "push to production", "deploy changes"), I must:

1. **Run `npm run build`** - Ensure production build passes with no errors
2. **Run `git status`** - Check ALL uncommitted changes (staged, unstaged, and untracked)
3. **Commit ALL changes** - Stage and commit everything with appropriate commit message(s)
4. **Push to remote** - Push all commits to the remote repository (triggers the Next.js pipeline)
5. **Deploy the Cloudflare Worker if `cloudflare-proxy/` has changes in this push** - The Next.js pipeline does NOT deploy the Worker. Run:
   ```
   cd cloudflare-proxy && npx wrangler deploy
   ```
   The Worker (`aesta-supabase-proxy.aestabuilders.workers.dev`) sits in front of all Supabase traffic — REST, Auth, Storage, and Realtime WebSocket — to bypass ISP-level blocks of `*.supabase.co` in India. A bug in the Worker silently breaks the production app even when the Next.js code is fine. To check if a deploy is needed: `git log -1 --name-only | grep '^cloudflare-proxy/'` — if any files match, deploy. Verify after with `npx wrangler tail` (or check the printed Version ID).

**Important:** Do NOT selectively commit only some files. ALL pending changes must be included when "move to prod" is requested.

## Test Credentials (for Playwright testing)
- **Email**: Haribabu@nerasmclasses.onmicrosoft.com
- **Password**: Padma@123

## After UI Changes - REQUIRED
After making any frontend/UI changes, I must verify and fix issues automatically:

### Visual Verification
1. **Auto-login** using Playwright MCP: navigate to `http://localhost:3000/dev-login` (or 3001). This page auto-authenticates with test credentials and redirects to the dashboard — no manual form filling needed.
2. **Navigate to the target page** to verify the changes
3. **Take a screenshot** to verify the changes rendered correctly
4. **Check for visual issues** - look for broken layouts, missing elements, or styling problems

### Console Error Checking
5. **Read console logs** using `playwright_console_logs` to retrieve ALL messages (logs, warnings, errors, exceptions)
6. **Analyze each issue** and categorize by type

### Automatic Issue Resolution
7. **Fix issues based on type:**

| Issue Type | Action |
|------------|--------|
| **Frontend/UI errors** | Fix React components, styling, or state management in `src/components/` |
| **Database/API errors** | Use Supabase MCP to inspect schema/data (read-only), then fix queries in `src/hooks/queries/` or create migrations |
| **Type errors** | Fix TypeScript types in `src/types/` |
| **Network/fetch errors** | Debug API calls and fix hooks in `src/hooks/queries/` |
| **React warnings** | Fix deprecated patterns, missing keys, or improper hook usage |
| **Hydration errors** | Fix server/client rendering mismatches |

8. **Re-verify after each fix** - Take new screenshot and check console again
9. **Repeat until clean** - No visual issues AND no console errors/warnings
10. **Close the browser** - After testing is complete, use `playwright_close` to close the test browser

### Important Rules
- For **Supabase production writes**: ALWAYS ask for user confirmation first
- For **local database changes**: Can make changes freely during testing
- **Don't ignore warnings**: Treat warnings as issues that need fixing

This ensures complete verification before the user manually checks.

## HTML Nesting Rules (Hydration Error Prevention)
To avoid React hydration errors, follow these rules when writing MUI components:

### ListItemText Component
- **NEVER** put `<Box>` or `<div>` directly inside `primary` or `secondary` props without adding typography props
- **FIX**: Add typography props to change wrapper from `<p>` to `<div>`:
  ```tsx
  <ListItemText
    primary={<Box>...</Box>}
    primaryTypographyProps={{ component: "div" }}
    secondary={<Box>...</Box>}
    secondaryTypographyProps={{ component: "div" }}
  />
  ```
- **Alternative**: Use `component="span"` on Box inside these props

### Typography Component
- **NEVER** put block elements (`<Box>`, `<div>`, `<Paper>`) inside `<Typography>`
- **FIX**: Use `component="div"` on Typography if you need block children:
  ```tsx
  <Typography component="div">
    <Box>...</Box>
  </Typography>
  ```

### FormControlLabel Component
- When using `<Box>` in `label` prop, use `component="span"`:
  ```tsx
  <FormControlLabel
    label={
      <Box component="span" sx={{ display: "flex" }}>
        ...
      </Box>
    }
  />
  ```

### General Rule
Block elements (`div`, `Box`, `Paper`, `Card`) cannot be nested inside:
- `<p>` tags (Typography default, ListItemText wrappers)
- `<span>` tags
- `<a>` tags
- Other inline elements

This causes hydration errors because browsers auto-correct invalid HTML differently than React expects during server-side rendering.

## Accessibility Guidelines

### MUI Autocomplete in Dialogs/Modals
When using Autocomplete components inside Dialog, Modal, or Drawer components:
- **Always add** `slotProps={{ popper: { disablePortal: false } }}` to prevent aria-hidden conflicts
- This ensures the dropdown renders **outside** the Dialog DOM tree via portal
- Prevents "Blocked aria-hidden on element because its descendant retained focus" browser warnings
- Required for WCAG accessibility compliance

**Why this matters:**
MUI Dialog sets `aria-hidden="true"` on background content. Without portal rendering, the Autocomplete dropdown stays inside the Dialog and causes focus conflicts when users interact with it.

**Example:**
```tsx
<Dialog open={open}>
  <Autocomplete
    options={options}
    slotProps={{
      popper: { disablePortal: false }  // Required inside Dialogs
    }}
    renderInput={(params) => <TextField {...params} />}
  />
</Dialog>
```

**Affected components in this codebase:**
- `UnifiedPurchaseOrderDialog.tsx` - 5 Autocomplete components
- `RequestItemRow.tsx` - 3 Autocomplete components (used inside Dialog)
- Any future Dialog/Modal/Drawer with Autocomplete inputs

## Project Structure
- `src/app/` - Next.js app router pages
- `src/components/` - React components
- `src/hooks/queries/` - React Query hooks
- `src/lib/` - Utilities and configurations
- `src/types/` - TypeScript type definitions
- `supabase/migrations/` - Database migrations

## Domain Quick Reference

### Materials Domain (52 components) - LARGEST
**Key Files:**
| File | Purpose |
|------|---------|
| `src/hooks/queries/usePurchaseOrders.ts` | PO workflow (3,385 lines) |
| `src/hooks/queries/useMaterialRequests.ts` | Request CRUD, timeout protection (1,969 lines) |
| `src/hooks/queries/useMaterialPurchases.ts` | Purchase tracking (1,599 lines) |
| `src/types/material.types.ts` | All material types (59KB) |
| `src/components/materials/` | 52 UI components |

**Workflows:**
- Material Request: `draft → pending → approved → ordered → fulfilled`
- Purchase Order: `draft → pending → approved → ordered → partially_delivered → delivered`
- Delivery: `pending → verified → completed`

**Common Issues:** Timeout on large PO lists (15-second protection exists), parent-child material relationships

---

### Payments & Settlements Domain (37 components)
**Key Files:**
| File | Purpose |
|------|---------|
| `src/lib/services/settlementService.ts` | Settlement calculations (93KB - largest service) |
| `src/hooks/queries/useInterSiteSettlements.ts` | Multi-site reconciliation (1,850 lines) |
| `src/components/payments/` | 37 UI components |
| `src/types/settlement.types.ts` | Settlement types |

**Workflows:**
- Settlement: `pending → approved → paid`
- Payment sources: `company`, `site_cash`, `engineer_own`

**Common Issues:** Multi-party calculations, wage/batch reconciliation

---

### Equipment Domain (10 components)
**Key Files:** `src/hooks/queries/useEquipment.ts`, `src/components/equipment/`, `src/types/equipment.types.ts`

**Workflows:**
- Status: `available → deployed → under_repair → disposed`
- Transfer: `pending → in_transit → received/rejected`
- Condition: `excellent → good → fair → poor → damaged`

---

### Rentals Domain (11 components)
**Key Files:** `src/hooks/queries/useRentals.ts` (1,673 lines), `src/lib/services/rentalService.ts` (19KB)

**Workflows:**
- Rental: `active → completed → cancelled`
- Advance: `pending → paid → settled`

---

### Tea Shop Domain (13 components)
**Key Files:** `src/hooks/queries/useCombinedTeaShop.ts`, `src/hooks/queries/useGroupTeaShop.ts`

**Note:** Multi-site group allocation logic is complex

---

### Attendance Domain (7 components)
**Key Files:** `src/hooks/queries/useAttendance.ts`, `src/components/attendance/`

---

### Wallet/Financial Domain (9 components)
**Key Files:** `src/lib/services/walletService.ts` (28KB), `src/hooks/queries/useEngineerWallet.ts`

---

## Route Quick Reference
| Route | Purpose |
|-------|---------|
| `/company/materials` | Material catalog |
| `/company/equipment` | Equipment management |
| `/company/rentals` | Rental store |
| `/company/laborers` | Internal workforce |
| `/company/engineer-wallet` | Fund management |
| `/site/material-requests` | Create/manage requests |
| `/site/purchase-orders` | PO workflow |
| `/site/delivery-verification` | Verify deliveries |
| `/site/attendance` | Daily attendance |
| `/site/payments` | Payment entry |
| `/site/rentals` | Site rental orders |
| `/site/tea-shop` | Tea shop entries |
| `/site/my-wallet` | Site wallet |

## Full-Stack Testing Workflow

### Database Safety Rules
- **Supabase MCP** connects to PRODUCTION (read-safe, write-requires-confirmation)
- **For testing changes**: Use local Supabase with `npm run dev:local`
- I will ALWAYS ask before any write operations to production via MCP

### Frontend Changes
1. Use Playwright to open localhost:3000 or 3001
2. Take screenshot and verify UI
3. Check browser console for errors
4. Fix and re-verify

### Backend/Database Changes
1. Use Supabase MCP to inspect current production schema/data (read-only)
2. Test changes locally with `npm run dev:local`
3. Write migrations for schema changes
4. Apply to production only after local testing passes

### Debugging Flow
1. If UI error → Check browser console via Playwright
2. If data not showing → Query Supabase via MCP (read-only)
3. If API error → Check Supabase dashboard logs
4. Fix code → Test locally → Deploy

### Refreshing Local Data from Production (On-Demand)
When you need fresh production data locally:
```bash
supabase db dump -f supabase/production_backup.sql --data-only
npm run db:reset
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/production_backup.sql
```