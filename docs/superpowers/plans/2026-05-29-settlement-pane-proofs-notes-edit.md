# Settlement Inspect Pane — Proofs, Notes & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show payment-screenshot thumbnails (with an in-page lightbox), a missing-screenshot warning, and notes inside the `/site/payments` Inspect Pane's Settlement tab, and add a straight-to-edit button — reusing existing components and dialogs.

**Architecture:** Export the existing full-detail fetch (`getSettlementDetailsByReference`) and wrap it in a new pane hook. The single-settlement view renders proofs/notes/edit inline; the roll-up (list) views get per-ref proof/notes indicator icons plus an editable detail dialog. Three optional edit props + a `paneZIndex` are threaded `payments-content → InspectPane → SettlementTab`, reusing the page's existing `editTarget`/`deleteTarget` state and edit/delete dialogs. No schema changes.

**Tech Stack:** Next.js 15, React, MUI v7, React Query (TanStack), Supabase JS, Vitest + React Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-05-29-settlement-pane-proofs-notes-edit-design.md`

**Conventions to match (read before starting):**
- Hook test pattern: `src/hooks/queries/useSalaryWaterfall.test.tsx` (mocks `@/lib/supabase/client`, wraps in a `QueryClientProvider` with `retry: false`).
- Component test pattern: `src/components/common/InspectPane/InspectPane.test.tsx`.
- Run a single test file: `npx vitest run <path>`. Run all: `npm run test`.
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer (see CLAUDE.md). Each task's commit block below omits the trailer for brevity — append it.
- Current branch: `feature/settlement-pane-proofs-notes-edit`.

---

## File Structure

**Create:**
- `src/hooks/queries/useSettlementFullDetails.ts` — pane hook returning the full `SettlementDetails` for one ref.
- `src/hooks/queries/useSettlementFullDetails.test.tsx`
- `src/hooks/queries/useSettlementProofFlags.ts` — batched `{hasProof,hasNotes}` per ref for roll-up indicators.
- `src/hooks/queries/useSettlementProofFlags.test.tsx`

**Modify:**
- `src/components/payments/SettlementRefDetailDialog.tsx` — export `getSettlementDetailsByReference`.
- `src/components/common/ScreenshotViewer.tsx` — add optional `zIndex` prop.
- `src/components/common/InspectPane/SettlementTab.tsx` — inline proofs/notes/edit (single view); per-ref indicators + editable detail dialog (roll-up views); new props.
- `src/components/common/InspectPane/types.ts` — add edit props + `paneZIndex` to `InspectPaneProps`.
- `src/components/common/InspectPane/InspectPane.tsx` — forward new props to `SettlementTab`.
- `src/components/common/InspectPane/InspectPane.test.tsx` — add forwarding test.
- `src/app/(main)/site/payments/payments-content.tsx` — pass the new props to `<InspectPane>`.

**Delete:**
- `src/hooks/queries/useSettlementDetails.ts` — superseded by `useSettlementFullDetails` (only `SettlementTab` imports it; verified in Task 5).

---

### Task 1: Export the full-detail fetch

**Files:**
- Modify: `src/components/payments/SettlementRefDetailDialog.tsx:161`

- [ ] **Step 1: Make `getSettlementDetailsByReference` exported**

In `src/components/payments/SettlementRefDetailDialog.tsx`, change the function declaration at line 161 from:

```ts
async function getSettlementDetailsByReference(
```

to:

```ts
export async function getSettlementDetailsByReference(
```

Leave the body untouched. It already returns `Promise<SettlementDetails | null>` (null on not-found / error) and is used internally by the default-exported dialog.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (existing baseline only).

- [ ] **Step 3: Commit**

```bash
git add src/components/payments/SettlementRefDetailDialog.tsx
git commit -m "refactor(payments): export getSettlementDetailsByReference for reuse"
```

---

### Task 2: `useSettlementFullDetails` hook

**Files:**
- Create: `src/hooks/queries/useSettlementFullDetails.ts`
- Test: `src/hooks/queries/useSettlementFullDetails.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/queries/useSettlementFullDetails.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockGet = vi.fn();
// Mock the dialog module so we don't pull its full Supabase fetch into the test.
vi.mock("@/components/payments/SettlementRefDetailDialog", () => ({
  __esModule: true,
  default: () => null,
  getSettlementDetailsByReference: (...args: any[]) => mockGet(...args),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { useSettlementFullDetails } from "./useSettlementFullDetails";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSettlementFullDetails", () => {
  beforeEach(() => mockGet.mockReset());

  it("does not fetch when ref is null", () => {
    const { result } = renderHook(
      () => useSettlementFullDetails(null, "site-1"),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns the SettlementDetails from getSettlementDetailsByReference", async () => {
    const details = {
      settlementReference: "SET-1",
      proofUrls: ["a.png"],
      notes: "hi",
      isCancelled: false,
    } as any;
    mockGet.mockResolvedValue(details);

    const { result } = renderHook(
      () => useSettlementFullDetails("SET-1", "site-1"),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(details);
    expect(mockGet).toHaveBeenCalledWith(expect.anything(), "SET-1");
  });

  it("passes through null when the settlement is not found", async () => {
    mockGet.mockResolvedValue(null);
    const { result } = renderHook(
      () => useSettlementFullDetails("SET-X", "site-1"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/queries/useSettlementFullDetails.test.tsx`
Expected: FAIL — cannot resolve `./useSettlementFullDetails`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useSettlementFullDetails.ts`:

```ts
/**
 * useSettlementFullDetails
 *
 * Powers the InspectPane's single-settlement view. Fetches the FULL settlement
 * record (proofs, notes, payer split, isContract, isCancelled) for one
 * settlement_reference by reusing getSettlementDetailsByReference — the same
 * canonical read used by SettlementRefDetailDialog. Replaces the older
 * lightweight useSettlementDetails projection.
 */
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import {
  getSettlementDetailsByReference,
  type SettlementDetails,
} from "@/components/payments/SettlementRefDetailDialog";

export function useSettlementFullDetails(
  settlementRef: string | null,
  siteId: string
) {
  const supabase = createClient();
  return useQuery<SettlementDetails | null>({
    queryKey: ["inspect-settlement-full", settlementRef, siteId],
    enabled: Boolean(settlementRef),
    staleTime: 60_000,
    queryFn: async () => {
      if (!settlementRef) return null;
      return withTimeout(
        getSettlementDetailsByReference(supabase, settlementRef),
        TIMEOUTS.QUERY,
        "Settlement details query timed out. Please retry."
      );
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/queries/useSettlementFullDetails.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useSettlementFullDetails.ts src/hooks/queries/useSettlementFullDetails.test.tsx
git commit -m "feat(payments): useSettlementFullDetails hook for inspect pane"
```

---

### Task 3: `useSettlementProofFlags` hook

**Files:**
- Create: `src/hooks/queries/useSettlementProofFlags.ts`
- Test: `src/hooks/queries/useSettlementProofFlags.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/queries/useSettlementProofFlags.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockIn = vi.fn();
// `.from(...).select(...).in(...)` chain; `.in` returns a thenable that also
// exposes `.abortSignal()` returning itself (matches the Supabase builder).
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, refs: string[]) => {
          const r: any = mockIn(refs);
          r.abortSignal = () => r;
          return r;
        },
      }),
    }),
  }),
}));

import { useSettlementProofFlags } from "./useSettlementProofFlags";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSettlementProofFlags", () => {
  beforeEach(() => mockIn.mockReset());

  it("does not fetch when refs is empty", () => {
    const { result } = renderHook(
      () => useSettlementProofFlags([], "site-1"),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockIn).not.toHaveBeenCalled();
  });

  it("derives hasProof/hasNotes per ref", async () => {
    mockIn.mockReturnValue(
      Promise.resolve({
        data: [
          { settlement_reference: "A", proof_urls: ["x.png"], proof_url: null, notes: "note" },
          { settlement_reference: "B", proof_urls: [], proof_url: "legacy.png", notes: null },
          { settlement_reference: "C", proof_urls: null, proof_url: null, notes: "  " },
        ],
        error: null,
      })
    );

    const { result } = renderHook(
      () => useSettlementProofFlags(["A", "B", "C"], "site-1"),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const map = result.current.data!;
    expect(map.get("A")).toEqual({ hasProof: true, hasNotes: true });
    expect(map.get("B")).toEqual({ hasProof: true, hasNotes: false });
    expect(map.get("C")).toEqual({ hasProof: false, hasNotes: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/queries/useSettlementProofFlags.test.tsx`
Expected: FAIL — cannot resolve `./useSettlementProofFlags`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useSettlementProofFlags.ts`:

```ts
/**
 * useSettlementProofFlags
 *
 * Batched proof/notes presence lookup for a set of settlement_references.
 * Powers the at-a-glance per-ref indicator icons in the InspectPane's
 * roll-up settlement views. One IN-query, returns a Map keyed by reference.
 */
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface SettlementProofFlag {
  hasProof: boolean;
  hasNotes: boolean;
}

export function useSettlementProofFlags(refs: string[], siteId: string) {
  const supabase = createClient();
  const sortedKey = [...refs].sort().join(",");
  return useQuery<Map<string, SettlementProofFlag>>({
    queryKey: ["settlement-proof-flags", siteId, sortedKey],
    enabled: refs.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase.from("settlement_groups") as any)
            .select("settlement_reference, proof_url, proof_urls, notes")
            .in("settlement_reference", refs)
            .abortSignal(signal)
        ),
        TIMEOUTS.QUERY,
        "Proof-flags query timed out. Please retry."
      );
      if (error) throw error;
      const map = new Map<string, SettlementProofFlag>();
      for (const row of (data ?? []) as any[]) {
        const hasProof =
          (Array.isArray(row.proof_urls) && row.proof_urls.length > 0) ||
          Boolean(row.proof_url);
        const hasNotes =
          typeof row.notes === "string" && row.notes.trim().length > 0;
        map.set(row.settlement_reference, { hasProof, hasNotes });
      }
      return map;
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/queries/useSettlementProofFlags.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/useSettlementProofFlags.ts src/hooks/queries/useSettlementProofFlags.test.tsx
git commit -m "feat(payments): useSettlementProofFlags batched indicator hook"
```

---

### Task 4: `ScreenshotViewer` z-index prop

**Files:**
- Modify: `src/components/common/ScreenshotViewer.tsx:23-37` (props), `:121-143` (Dialog)

- [ ] **Step 1: Add `zIndex` to the props interface**

In `src/components/common/ScreenshotViewer.tsx`, update the interface (lines 23-29):

```ts
interface ScreenshotViewerProps {
  open: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  title?: string;
  /** Override the modal's stacking context. Needed when the host pane runs in
   *  fullscreen (z-index 1400) — without this the lightbox renders underneath. */
  zIndex?: number;
}
```

- [ ] **Step 2: Destructure `zIndex`**

Update the component signature (lines 31-37):

```tsx
export default function ScreenshotViewer({
  open,
  onClose,
  images,
  initialIndex = 0,
  title,
  zIndex,
}: ScreenshotViewerProps) {
```

- [ ] **Step 3: Apply `zIndex` to the Dialog**

Change the `<Dialog>` opening tag (line 121) to add an `sx` that applies the override (leave `PaperProps` and `slotProps` as-is):

```tsx
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      sx={zIndex !== undefined ? { zIndex } : undefined}
      PaperProps={{
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ScreenshotViewer.tsx
git commit -m "feat(common): optional zIndex prop on ScreenshotViewer"
```

---

### Task 5: Single-settlement view — inline proofs, notes & edit

**Files:**
- Modify: `src/components/common/InspectPane/SettlementTab.tsx` (imports, `SettlementTab` props, `SingleRefSettlement`)
- Delete: `src/hooks/queries/useSettlementDetails.ts`
- Test: `src/components/common/InspectPane/SettlementTab.test.tsx` (new)

- [ ] **Step 1: Confirm `useSettlementDetails` has no other importers**

Run: `git grep -n "useSettlementDetails" -- "src/"`
Expected: matches ONLY in `src/components/common/InspectPane/SettlementTab.tsx` and `src/hooks/queries/useSettlementDetails.ts`. If any other file imports it, stop and reconsider — the rest of this task assumes it's safe to delete.

- [ ] **Step 2: Write the failing test**

Create `src/components/common/InspectPane/SettlementTab.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettlementTab from "./SettlementTab";
import type { InspectEntity } from "./types";

const mockUseFull = vi.fn();
vi.mock("@/hooks/queries/useSettlementFullDetails", () => ({
  useSettlementFullDetails: (...a: any[]) => mockUseFull(...a),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const dailyEntity: InspectEntity = {
  kind: "daily-date",
  siteId: "site-1",
  date: "2025-11-18",
  settlementRef: "SET-251118-002",
};

const baseDetails = {
  settlementGroupId: "g1",
  settlementReference: "SET-251118-002",
  settlementDate: "2025-11-18",
  totalAmount: 2600,
  distributedToLaborers: 2600,
  actualPaymentDate: null,
  paymentType: null,
  laborerCount: 2,
  paymentChannel: "direct",
  paymentMode: "upi",
  payerSource: "client_money",
  payerName: null,
  payerSourceSplit: null,
  proofUrls: [] as string[],
  notes: null as string | null,
  subcontractId: null,
  subcontractTitle: null,
  createdBy: null,
  createdByName: "Hari",
  createdAt: "2025-11-18",
  isCancelled: false,
  isContract: false,
  weekAllocations: [],
  laborers: [],
};

function renderTab(props: Partial<React.ComponentProps<typeof SettlementTab>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettlementTab entity={dailyEntity} {...props} />
    </QueryClientProvider>
  );
}

describe("SettlementTab — single settlement", () => {
  beforeEach(() => mockUseFull.mockReset());

  it("renders a proof thumbnail and opens the lightbox on click", () => {
    mockUseFull.mockReturnValue({
      data: { ...baseDetails, proofUrls: ["https://x/p1.png"] },
      isLoading: false,
    });
    renderTab();
    const thumb = screen.getByAltText("Payment proof 1");
    expect(thumb).toBeInTheDocument();
    fireEvent.click(thumb);
    // ScreenshotViewer shows the download control when open
    expect(screen.getByLabelText(/download/i)).toBeInTheDocument();
  });

  it("warns when no screenshot is attached", () => {
    mockUseFull.mockReturnValue({ data: { ...baseDetails, proofUrls: [] }, isLoading: false });
    renderTab();
    expect(screen.getByText(/no screenshot uploaded/i)).toBeInTheDocument();
  });

  it("renders notes when present", () => {
    mockUseFull.mockReturnValue({
      data: { ...baseDetails, notes: "Paid via GPay 2:30pm" },
      isLoading: false,
    });
    renderTab();
    expect(screen.getByText(/paid via gpay/i)).toBeInTheDocument();
  });

  it("shows Edit and calls onEditSettlement with the details", () => {
    const details = { ...baseDetails, proofUrls: ["https://x/p1.png"] };
    mockUseFull.mockReturnValue({ data: details, isLoading: false });
    const onEditSettlement = vi.fn();
    renderTab({ canEditSettlement: true, onEditSettlement });
    fireEvent.click(screen.getByRole("button", { name: /edit settlement/i }));
    expect(onEditSettlement).toHaveBeenCalledWith(details);
  });

  it("hides Edit and shows a Cancelled chip for cancelled settlements", () => {
    mockUseFull.mockReturnValue({
      data: { ...baseDetails, isCancelled: true, proofUrls: [] },
      isLoading: false,
    });
    renderTab({ canEditSettlement: true, onEditSettlement: vi.fn() });
    expect(screen.queryByRole("button", { name: /edit settlement/i })).toBeNull();
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
    // No missing-screenshot warning while cancelled
    expect(screen.queryByText(/no screenshot uploaded/i)).toBeNull();
  });

  it("does not show Edit when canEditSettlement is false", () => {
    mockUseFull.mockReturnValue({ data: baseDetails, isLoading: false });
    renderTab({ canEditSettlement: false, onEditSettlement: vi.fn() });
    expect(screen.queryByRole("button", { name: /edit settlement/i })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/common/InspectPane/SettlementTab.test.tsx`
Expected: FAIL (component still uses old hook / no proof/notes/edit UI; `useSettlementFullDetails` import unresolved or behavior missing).

- [ ] **Step 4: Update imports + add label helpers + props in `SettlementTab.tsx`**

Replace the import of the old hook and add the new imports. Change line 16 from:

```ts
import { useSettlementDetails } from "@/hooks/queries/useSettlementDetails";
```

to:

```ts
import { useSettlementFullDetails } from "@/hooks/queries/useSettlementFullDetails";
import { useSettlementProofFlags } from "@/hooks/queries/useSettlementProofFlags";
import ScreenshotViewer from "@/components/common/ScreenshotViewer";
import type { SettlementDetails } from "@/components/payments/SettlementRefDetailDialog";
import { Chip, Link as MuiLink } from "@mui/material";
```

(Merge `Chip` and `MuiLink` into the existing `@mui/material` import block instead of adding a second import if you prefer — both work.)

Add these view-layer label helpers near the top of the file, just after the `formatINR` helper (the file currently relies on the hook for these; the full hook returns raw enum values, so format here). Match the strings the old hook used:

```ts
function paymentModeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null;
  switch (mode) {
    case "upi": return "UPI";
    case "cash": return "Cash";
    case "net_banking": return "Net Banking";
    case "company_direct_online": return "Direct (Online)";
    case "via_site_engineer": return "Via Engineer";
    default: return mode;
  }
}
function paymentChannelLabel(channel: string | null | undefined): string | null {
  if (!channel) return null;
  switch (channel) {
    case "direct": return "Direct Payment";
    case "engineer_wallet": return "Via Engineer Wallet";
    default: return channel;
  }
}
function payerLabel(d: SettlementDetails): string {
  if (d.payerSourceSplit && d.payerSourceSplit.length > 0) return "Split";
  const source = d.payerSource;
  const name = d.payerName;
  if (!source) return name ?? "—";
  switch (source) {
    case "own_money": return "Own Money";
    case "amma_money":
    case "mothers_money": return "Amma Money";
    case "client_money": return "Client Money";
    case "trust_account": return "Trust Account";
    case "other_site_money": return name || "Other Site Money";
    case "custom": return name || "Custom";
    default: return name || source;
  }
}
```

Extend the `SettlementTab` props (lines 46-52) to thread the new fields and forward them:

```tsx
export default function SettlementTab({
  entity,
  onSettleClick,
  canEditSettlement,
  onEditSettlement,
  onDeleteSettlement,
  paneZIndex,
}: {
  entity: InspectEntity;
  onSettleClick?: (entity: InspectEntity) => void;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
  paneZIndex?: number;
}) {
  if (entity.kind === "weekly-aggregate") {
    return (
      <WeeklyAggregateSettlement
        entity={entity}
        onSettleClick={onSettleClick}
        canEditSettlement={canEditSettlement}
        onEditSettlement={onEditSettlement}
        onDeleteSettlement={onDeleteSettlement}
      />
    );
  }
  if (entity.kind === "daily-market-weekly") {
    return (
      <DailyMarketWeeklySettlement
        entity={entity}
        canEditSettlement={canEditSettlement}
        onEditSettlement={onEditSettlement}
        onDeleteSettlement={onDeleteSettlement}
      />
    );
  }
  return (
    <SingleRefSettlement
      entity={entity}
      onSettleClick={onSettleClick}
      canEditSettlement={canEditSettlement}
      onEditSettlement={onEditSettlement}
      paneZIndex={paneZIndex}
    />
  );
}
```

- [ ] **Step 5: Rewrite `SingleRefSettlement` to use the full hook + render proofs/notes/edit**

Replace the entire `SingleRefSettlement` function (lines 67-201) with:

```tsx
function SingleRefSettlement({
  entity,
  onSettleClick,
  canEditSettlement,
  onEditSettlement,
  paneZIndex,
}: {
  entity: Exclude<InspectEntity, { kind: "weekly-aggregate" }>;
  onSettleClick?: (entity: InspectEntity) => void;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  paneZIndex?: number;
}) {
  const theme = useTheme();
  const settlementRef = entitySettlementRef(entity);
  const isPending = !settlementRef;
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  const { data, isLoading } = useSettlementFullDetails(
    settlementRef,
    entity.siteId
  );

  if (isLoading && !isPending) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={120} />
      </Box>
    );
  }

  if (isPending) {
    return (
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.warning.main, 0.12),
            border: `1px solid ${theme.palette.warning.main}`,
            mb: 1.5,
          }}
        >
          <Typography variant="body2" fontWeight={600} color="warning.dark">
            Not yet settled
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click below to settle this{" "}
            {entity.kind === "daily-date" ? "date" : "week"} now.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="success"
          fullWidth
          onClick={() => onSettleClick?.(entity)}
          disabled={!onSettleClick}
        >
          Settle now
        </Button>
      </Box>
    );
  }

  const proofUrls = data?.proofUrls ?? [];
  const isCancelled = Boolean(data?.isCancelled);

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        divider={
          <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />
        }
      >
        <Row
          label="Reference"
          value={
            <Typography
              variant="body2"
              component="span"
              sx={{ fontFamily: "ui-monospace, monospace" }}
            >
              {settlementRef ?? "—"}
            </Typography>
          }
        />
        <Row
          label="Amount"
          value={
            data?.totalAmount != null ? (
              <Typography
                variant="body2"
                component="span"
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "success.dark",
                }}
              >
                {formatINR(data.totalAmount)}
              </Typography>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Settled on"
          value={
            data?.settlementDate
              ? dayjs(data.settlementDate).format("DD MMM YYYY")
              : "—"
          }
        />
        <Row label="Payer" value={data ? payerLabel(data) : "—"} />
        <Row
          label="Payment mode"
          value={paymentModeLabel(data?.paymentMode) ?? "—"}
        />
        <Row
          label="Channel"
          value={paymentChannelLabel(data?.paymentChannel) ?? "—"}
        />
        <Row label="Recorded by" value={data?.createdByName ?? "—"} />
      </Stack>

      {/* Screenshot / proof */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.75 }}
        >
          Payment screenshot
        </Typography>
        {proofUrls.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {proofUrls.map((url, i) => (
              <Box
                key={url}
                component="img"
                src={url}
                alt={`Payment proof ${i + 1}`}
                onClick={() => setViewer({ open: true, index: i })}
                sx={{
                  width: 64,
                  height: 64,
                  objectFit: "cover",
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.divider}`,
                  cursor: "pointer",
                  "&:hover": { borderColor: theme.palette.primary.main },
                }}
              />
            ))}
          </Box>
        ) : isCancelled ? (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        ) : (
          <Box
            sx={{
              p: 1.25,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.warning.main, 0.12),
              border: `1px solid ${theme.palette.warning.main}`,
            }}
          >
            <Typography variant="body2" fontWeight={600} color="warning.dark">
              No screenshot uploaded
            </Typography>
          </Box>
        )}
      </Box>

      {/* Notes */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          Notes
        </Typography>
        {data?.notes ? (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {data.notes}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No notes
          </Typography>
        )}
      </Box>

      {data?.subcontractId && (
        <Box
          sx={{
            mt: 2,
            p: 1.25,
            bgcolor: "background.paper",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Linked subcontract
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {data.subcontractTitle ?? "—"}
          </Typography>
        </Box>
      )}

      {/* Edit / cancelled footer */}
      <Box sx={{ mt: 2 }}>
        {isCancelled ? (
          <Chip label="Cancelled" color="default" size="small" />
        ) : canEditSettlement && data ? (
          <Button
            variant="outlined"
            fullWidth
            onClick={() => onEditSettlement?.(data)}
            disabled={!onEditSettlement}
          >
            Edit settlement
          </Button>
        ) : null}
      </Box>

      <ScreenshotViewer
        open={viewer.open}
        onClose={() => setViewer((v) => ({ ...v, open: false }))}
        images={proofUrls}
        initialIndex={viewer.index}
        title="Payment Proof"
        zIndex={paneZIndex !== undefined ? paneZIndex + 100 : undefined}
      />
    </Box>
  );
}
```

Note: `MuiLink` was imported in Step 4 for parity with other tabs but is unused here — remove it from the import if your lint config flags unused imports. The `Chip` import IS used.

- [ ] **Step 6: Delete the superseded hook**

```bash
git rm src/hooks/queries/useSettlementDetails.ts
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/common/InspectPane/SettlementTab.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `MuiLink` unused triggers a lint error in build, remove it.)

- [ ] **Step 9: Commit**

```bash
git add src/components/common/InspectPane/SettlementTab.tsx src/components/common/InspectPane/SettlementTab.test.tsx
git commit -m "feat(payments): inline proofs, notes & edit in single-settlement pane view"
```

---

### Task 6: Roll-up views — per-ref indicators + editable detail dialog

**Files:**
- Modify: `src/components/common/InspectPane/SettlementTab.tsx` (`WeeklyAggregateSettlement`, `DailyMarketWeeklySettlement`)
- Test: `src/components/common/InspectPane/SettlementTab.test.tsx` (add a `describe` block)

- [ ] **Step 1: Write the failing test (append to the existing test file)**

Append to `src/components/common/InspectPane/SettlementTab.test.tsx`. Add the proof-flags + ledger mocks at the TOP of the file alongside the existing mocks (so they apply to the whole file):

```tsx
const mockUseProofFlags = vi.fn();
vi.mock("@/hooks/queries/useSettlementProofFlags", () => ({
  useSettlementProofFlags: (...a: any[]) => mockUseProofFlags(...a),
}));
const mockUseLedger = vi.fn();
vi.mock("@/hooks/queries/usePaymentsLedger", () => ({
  usePaymentsLedger: (...a: any[]) => mockUseLedger(...a),
}));
```

Then add this `describe` block at the end of the file:

```tsx
describe("SettlementTab — daily-market-weekly roll-up", () => {
  beforeEach(() => {
    mockUseProofFlags.mockReset();
    mockUseLedger.mockReset();
  });

  const weekEntity: InspectEntity = {
    kind: "daily-market-weekly",
    siteId: "site-1",
    weekStart: "2025-11-16",
    weekEnd: "2025-11-22",
    scopeFrom: null,
    scopeTo: null,
  };

  function renderRollup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SettlementTab entity={weekEntity} canEditSettlement onEditSettlement={vi.fn()} />
      </QueryClientProvider>
    );
  }

  it("shows a proof-present icon for refs with a screenshot and a missing icon otherwise", () => {
    mockUseLedger.mockReturnValue({
      data: [
        { date: "2025-11-18", amount: 2600, isPaid: true, isPending: false, settlementRef: "SET-A" },
        { date: "2025-11-17", amount: 1500, isPaid: true, isPending: false, settlementRef: "SET-B" },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseProofFlags.mockReturnValue({
      data: new Map([
        ["SET-A", { hasProof: true, hasNotes: false }],
        ["SET-B", { hasProof: false, hasNotes: true }],
      ]),
    });
    renderRollup();
    expect(screen.getByLabelText("Screenshot attached")).toBeInTheDocument();
    expect(screen.getByLabelText("No screenshot")).toBeInTheDocument();
    expect(screen.getByLabelText("Has notes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/common/InspectPane/SettlementTab.test.tsx`
Expected: the new roll-up test FAILS (no indicator icons yet); the Task 5 single-settlement tests still PASS.

- [ ] **Step 3: Add indicator imports + a shared `ProofFlagIcons` helper**

In `SettlementTab.tsx`, add to the `@mui/icons-material` imports (create the import block if none exists — this file currently has no icon imports):

```ts
import {
  Image as ImageIcon,
  ImageNotSupported as ImageNotSupportedIcon,
  StickyNote2 as NotesIcon,
} from "@mui/icons-material";
```

Add a small presentational helper near the other top-level helpers:

```tsx
function ProofFlagIcons({
  flag,
}: {
  flag: { hasProof: boolean; hasNotes: boolean } | undefined;
}) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, ml: 0.5 }}>
      {flag?.hasProof ? (
        <ImageIcon
          aria-label="Screenshot attached"
          sx={{ fontSize: 14 }}
          color="action"
        />
      ) : (
        <ImageNotSupportedIcon
          aria-label="No screenshot"
          sx={{ fontSize: 14 }}
          color="warning"
        />
      )}
      {flag?.hasNotes && (
        <NotesIcon
          aria-label="Has notes"
          sx={{ fontSize: 14 }}
          color="disabled"
        />
      )}
    </Box>
  );
}
```

Note: MUI SvgIcons forward `aria-label` to the rendered `<svg>`, so `getByLabelText` resolves them.

- [ ] **Step 4: Wire indicators + editable dialog into `WeeklyAggregateSettlement`**

Update the function signature (line 213) to accept the edit props:

```tsx
function WeeklyAggregateSettlement({
  entity,
  onSettleClick,
  canEditSettlement,
  onEditSettlement,
  onDeleteSettlement,
}: {
  entity: Extract<InspectEntity, { kind: "weekly-aggregate" }>;
  onSettleClick?: (entity: InspectEntity) => void;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
}) {
```

After `const week = weeks?.find(...)` is computed and before the `return`, derive the refs and fetch flags. Place this just after the `if (!week) { ... }` guard:

```tsx
  const refList = week ? week.filledBy.map((f) => f.ref) : [];
  const { data: proofFlags } = useSettlementProofFlags(refList, entity.siteId);
```

> Hook-order note: `useSettlementProofFlags` must be called unconditionally on every render of this component. The existing early returns (`isError`, `isLoading`, `!week`) happen BEFORE this point, which would violate the rules of hooks. Move the `useSettlementProofFlags` call up to directly after the `useSalaryWaterfall` call (top of the component), computing `refList` from `weeks` defensively:
>
> ```tsx
> const refList =
>   (weeks?.find((w) => w.weekStart === entity.weekStart)?.filledBy ?? []).map(
>     (f) => f.ref
>   );
> const { data: proofFlags } = useSettlementProofFlags(refList, entity.siteId);
> ```
>
> Put both lines immediately below the `useSalaryWaterfall({...})` call, before any `if (isError)` return.

In the `week.filledBy.map(...)` ref button (the `<Box component="button" ...>{f.ref}</Box>` around line 369-391), render the icons next to the ref. Wrap the button and icons:

```tsx
                  <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setRefDetail(f.ref)}
                      sx={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11,
                        color: "primary.main",
                        background: "transparent",
                        border: "none",
                        p: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: 600,
                        "&:hover": { textDecoration: "underline" },
                        "&:focus-visible": {
                          outline: `2px solid ${theme.palette.primary.main}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      {f.ref}
                    </Box>
                    <ProofFlagIcons flag={proofFlags?.get(f.ref)} />
                  </Box>
```

Make the embedded detail dialog editable (the `<SettlementRefDetailDialog .../>` around line 481):

```tsx
      <SettlementRefDetailDialog
        open={refDetail !== null}
        settlementReference={refDetail}
        onClose={() => setRefDetail(null)}
        canEdit={canEditSettlement}
        onEdit={(d) => {
          setRefDetail(null);
          onEditSettlement?.(d);
        }}
        onDelete={(d) => {
          setRefDetail(null);
          onDeleteSettlement?.(d);
        }}
      />
```

- [ ] **Step 5: Wire indicators + editable dialog into `DailyMarketWeeklySettlement`**

Update the function signature (line 513) to accept the edit props:

```tsx
function DailyMarketWeeklySettlement({
  entity,
  canEditSettlement,
  onEditSettlement,
  onDeleteSettlement,
}: {
  entity: Extract<InspectEntity, { kind: "daily-market-weekly" }>;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
}) {
```

The `byDate` grouping produces `dates` with `refs: Set<string>`. Collect all refs and fetch flags. Add this immediately after the `usePaymentsLedger({...})` call (before the `if (isError)` return — unconditional for hook order):

```tsx
  const allRefs = Array.from(
    new Set((rows ?? []).map((r) => r.settlementRef).filter(Boolean) as string[])
  );
  const { data: proofFlags } = useSettlementProofFlags(allRefs, entity.siteId);
```

In the per-date ref chips (the `refs.map((ref) => ( <Box component="button" ...>{ref}</Box> ))` around line 682-707), add the icons after each ref button. Wrap each ref in a flex row:

```tsx
                  refs.map((ref) => (
                    <Box
                      key={ref}
                      sx={{ display: "inline-flex", alignItems: "center" }}
                    >
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setRefDetail(ref)}
                        sx={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 10.5,
                          color: "primary.main",
                          background: "transparent",
                          border: "none",
                          p: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          fontWeight: 600,
                          "&:hover": { textDecoration: "underline" },
                          "&:focus-visible": {
                            outline: `2px solid ${theme.palette.primary.main}`,
                            outlineOffset: 2,
                          },
                        }}
                      >
                        {ref}
                      </Box>
                      <ProofFlagIcons flag={proofFlags?.get(ref)} />
                    </Box>
                  ))
```

Find this component's embedded `<SettlementRefDetailDialog .../>` (it mounts one the same way `WeeklyAggregateSettlement` does — search for `SettlementRefDetailDialog` within `DailyMarketWeeklySettlement`, after line 732) and make it editable with the same four added props as in Step 4:

```tsx
      <SettlementRefDetailDialog
        open={refDetail !== null}
        settlementReference={refDetail}
        onClose={() => setRefDetail(null)}
        canEdit={canEditSettlement}
        onEdit={(d) => {
          setRefDetail(null);
          onEditSettlement?.(d);
        }}
        onDelete={(d) => {
          setRefDetail(null);
          onDeleteSettlement?.(d);
        }}
      />
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/common/InspectPane/SettlementTab.test.tsx`
Expected: PASS (all single-settlement + roll-up tests).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/common/InspectPane/SettlementTab.tsx src/components/common/InspectPane/SettlementTab.test.tsx
git commit -m "feat(payments): per-ref proof indicators + editable detail dialog in roll-up pane views"
```

---

### Task 7: Plumb props through `InspectPane` + `types`

**Files:**
- Modify: `src/components/common/InspectPane/types.ts:91-106`
- Modify: `src/components/common/InspectPane/InspectPane.tsx:42-54`, `:232-234`
- Test: `src/components/common/InspectPane/InspectPane.test.tsx`

- [ ] **Step 1: Write the failing test (append to `InspectPane.test.tsx`)**

At the TOP of `InspectPane.test.tsx`, add a mock for the full-details hook (it's only used by the Settlement tab, so existing attendance tests are unaffected):

```tsx
vi.mock("@/hooks/queries/useSettlementFullDetails", () => ({
  useSettlementFullDetails: () => ({
    data: {
      settlementGroupId: "g1",
      settlementReference: "SS-0421",
      settlementDate: "2026-04-21",
      totalAmount: 1000,
      distributedToLaborers: 1000,
      actualPaymentDate: null,
      paymentType: null,
      laborerCount: 1,
      paymentChannel: "direct",
      paymentMode: "upi",
      payerSource: "client_money",
      payerName: null,
      payerSourceSplit: null,
      proofUrls: [],
      notes: null,
      subcontractId: null,
      subcontractTitle: null,
      createdBy: null,
      createdByName: "Hari",
      createdAt: "2026-04-21",
      isCancelled: false,
      isContract: false,
      weekAllocations: [],
      laborers: [],
    },
    isLoading: false,
  }),
}));
```

Add this test inside the existing `describe("InspectPane", ...)` block:

```tsx
  it("forwards Edit from the Settlement tab to onEditSettlement", () => {
    const onEditSettlement = vi.fn();
    renderWithClient(
      <InspectPane
        {...baseProps}
        activeTab="settlement"
        canEditSettlement
        onEditSettlement={onEditSettlement}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit settlement/i }));
    expect(onEditSettlement).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/common/InspectPane/InspectPane.test.tsx`
Expected: FAIL — `canEditSettlement`/`onEditSettlement` are not valid props yet (TS error) and/or no Edit button rendered.

- [ ] **Step 3: Extend `InspectPaneProps` in `types.ts`**

In `src/components/common/InspectPane/types.ts`, add to the `InspectPaneProps` interface (after `onSettleClick`, before `zIndex`). Also import the type at the top of the file:

```ts
import type { SettlementDetails } from "@/components/payments/SettlementRefDetailDialog";
```

```ts
  onSettleClick?: (entity: InspectEntity) => void;
  /** Edit/delete a settlement straight from the Settlement tab. Wired by the
   *  host page to its existing edit/delete dialogs. */
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
```

- [ ] **Step 4: Forward props in `InspectPane.tsx`**

Destructure the new props (lines 42-54):

```tsx
  const {
    entity,
    isOpen,
    isPinned,
    activeTab,
    onTabChange,
    onClose,
    onTogglePin,
    onOpenInPage,
    onSettleClick,
    canEditSettlement,
    onEditSettlement,
    onDeleteSettlement,
    zIndex,
  } = props;
```

Forward them (and `paneZIndex={zIndex}`) to `SettlementTab` (line 232-234):

```tsx
        {activeTab === "settlement" && (
          <SettlementTab
            entity={entity}
            onSettleClick={onSettleClick}
            canEditSettlement={canEditSettlement}
            onEditSettlement={onEditSettlement}
            onDeleteSettlement={onDeleteSettlement}
            paneZIndex={zIndex}
          />
        )}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/common/InspectPane/InspectPane.test.tsx`
Expected: PASS (existing tests + new forwarding test).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/common/InspectPane/types.ts src/components/common/InspectPane/InspectPane.tsx src/components/common/InspectPane/InspectPane.test.tsx
git commit -m "feat(payments): thread settlement edit props through InspectPane"
```

---

### Task 8: Wire the page

**Files:**
- Modify: `src/app/(main)/site/payments/payments-content.tsx:1997-2008`

- [ ] **Step 1: Pass the new props to `<InspectPane>`**

In `src/app/(main)/site/payments/payments-content.tsx`, update the `<InspectPane>` mount (lines 1997-2008) to add the three edit props. They reuse the existing `canEditSettlements`, `setEditTarget`, and `setDeleteTarget` already defined in this component:

```tsx
      <InspectPane
        entity={pane.currentEntity}
        isOpen={pane.isOpen}
        isPinned={pane.isPinned}
        activeTab={pane.activeTab}
        onTabChange={pane.setActiveTab}
        onClose={pane.close}
        onTogglePin={pane.togglePin}
        onOpenInPage={handleOpenInPage}
        onSettleClick={handleSettleClick}
        canEditSettlement={canEditSettlements}
        onEditSettlement={(d) => setEditTarget(d)}
        onDeleteSettlement={(d) => setDeleteTarget(d)}
        zIndex={isFullscreen ? 1400 : undefined}
      />
```

> Note: `setEditTarget`/`setDeleteTarget` accept `SettlementDetails` and already drive the existing contract-vs-daily edit/delete dialog branches (lines 1837-1902) plus `invalidateSettlementsCaches` on success. No new state or dialogs are needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/site/payments/payments-content.tsx"
git commit -m "feat(payments): wire settlement proofs/notes/edit into /site/payments pane"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`
Expected: all tests PASS (including the three new test files). If a pre-existing failure appears unrelated to this work, note it but do not let it block — confirm it fails on a clean checkout of the base commit.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no type/lint errors. Fix any unused-import lint errors surfaced (e.g. remove `MuiLink` if unused).

- [ ] **Step 3: Visual verification via Playwright (per CLAUDE.md)**

Ensure `npm run dev:cloud` is running, then with Playwright MCP:
1. Navigate to `http://localhost:3000/dev-login` (auto-logs in).
2. Go to `/site/payments`, switch to the **Daily + Market** tab, **By date** view.
3. Click a UPI settlement that has a screenshot → confirm the thumbnail renders in the Settlement tab; click it → `ScreenshotViewer` opens the image; test zoom/next/prev/close.
4. Click a settlement with no screenshot → confirm the amber "No screenshot uploaded" warning.
5. Confirm notes render when present.
6. Click **Edit settlement** → confirm `DailySettlementEditDialog` opens pre-filled; make a no-op save → confirm the "Settlement updated" snackbar and that the pane reflects state on reopen.
7. Open a weekly roll-up entity → confirm per-ref icons (📷 / amber missing / notes) appear next to refs; click a ref → detail dialog opens with Edit/Delete enabled.
8. Toggle Fullscreen, open a screenshot → confirm the lightbox renders above the pane.
9. Read console logs via `playwright_console_logs` → fix any errors/warnings introduced.
10. `playwright_close`.

- [ ] **Step 4: Finalize**

If any fixes were needed in Step 1-3, commit them:

```bash
git add -A
git commit -m "fix(payments): address verification findings for settlement pane proofs/notes/edit"
```

Then invoke `superpowers:finishing-a-development-branch` to decide how to integrate the branch.

---

## Self-Review

**Spec coverage:**
- Show screenshot inline + open in-page → Task 5 (thumbnails + `ScreenshotViewer`). ✓
- Warn when no screenshot (always) → Task 5 (amber banner, suppressed when cancelled). ✓
- Show notes → Task 5. ✓
- Edit straight to dialog → Task 5 (`onEditSettlement`) + Task 8 (`setEditTarget`). ✓
- All views → Task 5 (single) + Task 6 (roll-ups: indicators + editable detail dialog). ✓
- Cancelled → no Edit + "Cancelled" chip → Task 5. ✓
- Payer split row → Task 5 (`payerLabel`). ✓
- Export full-detail fetch → Task 1. ✓
- New hooks → Task 2, Task 3. ✓
- Fullscreen z-index → Task 4 (`ScreenshotViewer.zIndex`) + Task 5/7 (`paneZIndex` thread). ✓
- Plumbing → Task 7 (InspectPane/types) + Task 8 (page). ✓
- No schema changes → confirmed; no migration tasks. ✓

**Type consistency:**
- `SettlementDetails` imported from `@/components/payments/SettlementRefDetailDialog` in the hook, `SettlementTab`, and `types.ts` — same source. ✓
- New props `canEditSettlement` / `onEditSettlement` / `onDeleteSettlement` / `paneZIndex` named identically across `SettlementTab`, `InspectPane`, `types.ts`, and the page. ✓
- `useSettlementFullDetails(ref, siteId)` and `useSettlementProofFlags(refs, siteId)` signatures match their call sites. ✓
- `ProofFlagIcons` aria-labels (`"Screenshot attached"`, `"No screenshot"`, `"Has notes"`) match the Task 6 test assertions. ✓
- `useSettlementProofFlags` returns `Map<string, {hasProof,hasNotes}>`; consumers call `proofFlags?.get(ref)`. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows full code. ✓

**Hook-order risk flagged:** Task 6 Step 4 explicitly calls out moving `useSettlementProofFlags` above the early returns in `WeeklyAggregateSettlement` to satisfy the rules of hooks. ✓
