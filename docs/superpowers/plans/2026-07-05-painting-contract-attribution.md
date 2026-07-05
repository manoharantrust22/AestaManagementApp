# Painting-contract attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a company laborer's non-Civil trade-contract days (e.g. Asis → Painting — In-house) settled in that trade's own workspace — out of the Civil/company settlement math, labelled clearly wherever they appear, and auto-attributed on entry.

**Architecture:** Reuse the existing "settled separately" pattern (already used for task-work and daily/market). The dividing line is *trade*: a `daily_attendance.subcontract_id` pointing at a non-Civil trade contract is excluded from the default (company-wide) salary RPCs and shown greyed with a trade chip. Trade is resolved via `subcontracts.trade_category_id → labor_categories.name`. Civil (the default trade) and untagged days stay in the company view.

**Tech Stack:** Next.js 15, MUI v7, Supabase (Postgres RPC, plpgsql/sql), React Query, Vitest, Playwright.

## Global Constraints

- Supabase MCP writes to **PRODUCTION**. Every prod write (data UPDATE, `apply_migration`) requires **explicit user confirmation** first. Migrations are schema-first, then code (per CLAUDE.md).
- Migrations are additive `CREATE OR REPLACE` / read-path only — non-destructive. No DROP/type-narrowing.
- dev:cloud reads the **prod** database + prod RPCs; RPC-dependent Playwright verification requires the additive RPC migrations to be applied to prod first (consistent with the prior double-count read-path migrations).
- Trade identity: `labor_categories.name = 'Civil'` is the default trade (system seed, `is_system_seed=true`). "Non-Civil trade" = a subcontract whose `trade_category_id` joins to a `labor_categories` row with `name <> 'Civil'`.
- Keep existing guards intact in the salary RPCs: `l.laborer_type='contract'`, `d.is_deleted=false`, `d.is_archived=false`, `d.task_work_package_id IS NULL`.
- Re-`GRANT EXECUTE ... TO authenticated, service_role` on every `CREATE OR REPLACE` function.
- Do NOT `rm -rf .next` or restart the dev server while it runs. Only `findhari93-sketch` has GitHub write.
- Code stays uncommitted until the user says "move to prod" (this repo's convention). Commits below are local checkpoints per the executing-plans flow; do not push.
- Reference IDs (Srinivasan): Painting — In-house subcontract `71a92fdb-5045-4989-8155-f55566fe91f8`; Asis the Painter laborer `22090769-179b-42ad-9da4-f9ba440aab49`; Civil trade `96dce093-2509-4f5f-8aa3-326e7f8f15d4`; Painting trade `d862a9a3-a0ab-4674-b4ca-9a25d3baed40`.

---

## File Structure

- `supabase/migrations/20260705110000_company_settlement_exclude_nonciv_trades.sql` (create) — RPC exclusion (Task 2).
- `supabase/migrations/20260705110100_attendance_for_date_expose_trade.sql` (create) — expose subcontract/trade per daily laborer (Task 3).
- `src/hooks/queries/useAttendanceForDate.ts` (modify) — carry trade fields + bucket (Task 4).
- `src/components/common/InspectPane/AttendanceTab.tsx` (modify) — greyed trade-contract section (Task 5).
- `src/components/attendance/AttendanceDrawer.tsx` (modify) — auto-default subcontract_id (Task 6).
- `src/app/(main)/site/expenses/page.v2.tsx` (verify; modify only if gap) — painting labour under Painting (Task 7).
- `src/components/payments/TradeSettlementView.tsx` (verify; minor) — contract name explicit (Task 8).
- Data fix (Task 1) — one-off prod UPDATE, no file.

Task order: RPC migrations (Tasks 2, 3) → client (Tasks 4, 5, 6) → data fix (Task 1) → verify surfaces (Tasks 7, 8). Task 1 is placed after the RPCs so its effect is verifiable, but it is independently confirmable.

---

### Task 2: RPC — exclude non-Civil trade days from the default Company Settlement

**Files:**
- Create: `supabase/migrations/20260705110000_company_settlement_exclude_nonciv_trades.sql`
- Reference base (verbatim current prod defs): `supabase/migrations/20260705100000_contract_settlement_exclude_task_work.sql`

**Interfaces:**
- Produces: unchanged signatures `get_salary_waterfall(uuid,uuid,date,date,text)` and `get_salary_slice_summary(uuid,uuid,date,date,text)`. Behaviour change only when `p_subcontract_id IS NULL`.

- [ ] **Step 1: Create the migration from the verbatim base**

Copy the two full function bodies from `20260705100000_contract_settlement_exclude_task_work.sql` (they are the current prod defs). In the new file, `CREATE OR REPLACE` both, adding the trade guard in four places. The guard (identical shape, on the attendance source uses `d.subcontract_id`, on the settlement sources uses `sg.subcontract_id`):

Attendance guard — add immediately AFTER the existing `AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)` line, in BOTH `get_salary_slice_summary`'s `wages` CTE and `get_salary_waterfall`'s `attendance_in_scope` CTE:

```sql
      -- Non-Civil trade contracts settle in their own trade workspace; keep them
      -- out of the company-wide (p_subcontract_id IS NULL) view only. Civil,
      -- untagged, and unclassified-trade days stay.
      AND (
        p_subcontract_id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.subcontracts sc
          JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
          WHERE sc.id = d.subcontract_id
            AND lc.name <> 'Civil'
        )
      )
```

Settlement guard — add immediately AFTER the existing `AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)` line, in `get_salary_slice_summary`'s `setts` CTE, its `advs` CTE, and `get_salary_waterfall`'s `_settlements` temp table (three places), using `sg.subcontract_id`:

```sql
      AND (
        p_subcontract_id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.subcontracts sc
          JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
          WHERE sc.id = sg.subcontract_id
            AND lc.name <> 'Civil'
        )
      )
```

End the file with:

```sql
GRANT EXECUTE ON FUNCTION public.get_salary_slice_summary(uuid, uuid, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_salary_waterfall(uuid, uuid, date, date, text) TO authenticated, service_role;
```

- [ ] **Step 2: Prove the predicate against prod read-only (NO write)**

Before applying, confirm the intended delta with a rolled-back check that mimics the new wages filter for Srinivasan, company-wide (`p_subcontract_id IS NULL`).

Run (via `mcp__supabase__execute_sql`):

```sql
WITH site AS (SELECT id FROM public.sites WHERE name ILIKE '%srinivasan%')
SELECT
  SUM(d.daily_earnings) FILTER (WHERE TRUE)                                   AS company_all_today,
  SUM(d.daily_earnings) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM public.subcontracts sc
      JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
      WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
  )                                                                           AS company_after_fix,
  SUM(d.daily_earnings) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.subcontracts sc
      JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
      WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
  )                                                                           AS painting_excluded
FROM public.daily_attendance d
JOIN site ON d.site_id = site.id
JOIN public.laborers l ON l.id = d.laborer_id
WHERE d.is_deleted = false AND d.is_archived = false
  AND l.laborer_type = 'contract' AND d.task_work_package_id IS NULL;
```

Expected: `company_after_fix = company_all_today - painting_excluded`, and `painting_excluded` ≈ Asis's 4 already-tagged painting days (₹4,000 before the Task 1 data fix; ₹6,000 after). Record the numbers.

- [ ] **Step 3: Apply to prod (CONFIRM FIRST)**

Ask the user to confirm applying the additive read-path migration to prod (required for dev:cloud verification). On confirmation, `mcp__supabase__apply_migration` with name `company_settlement_exclude_nonciv_trades` and the SQL from Step 1. If it errors, stop and surface it.

- [ ] **Step 4: Verify live RPC**

Run:

```sql
WITH site AS (SELECT id FROM public.sites WHERE name ILIKE '%srinivasan%')
SELECT
  (SELECT wages_due FROM public.get_salary_slice_summary((SELECT id FROM site), NULL, NULL, NULL, 'all'))              AS company_wages,
  (SELECT wages_due FROM public.get_salary_slice_summary((SELECT id FROM site), '71a92fdb-5045-4989-8155-f55566fe91f8', NULL, NULL, 'all')) AS painting_wages;
```

Expected: `company_wages` dropped by the painting amount vs. before; `painting_wages` shows all of Asis's painting days (unchanged by the guard, since `p_subcontract_id` is non-NULL).

- [ ] **Step 5: Run client RPC tests + commit**

Run: `npx vitest run src/hooks/queries/useSalaryWaterfall.test.tsx src/hooks/queries/useSalarySliceSummary.test.tsx`
Expected: PASS (these mock the RPC shape; the return contract is unchanged).

```bash
git add supabase/migrations/20260705110000_company_settlement_exclude_nonciv_trades.sql
git commit -m "feat(payments): exclude non-Civil trade days from company salary settlement"
```

---

### Task 3: RPC — expose subcontract + trade per daily laborer in get_attendance_for_date

**Files:**
- Create: `supabase/migrations/20260705110100_attendance_for_date_expose_trade.sql`

**Interfaces:**
- Produces: `get_attendance_for_date(uuid,date)` — each element of `daily_laborers` gains `subcontract_id` (uuid|null), `subcontract_title` (text|null), `trade_name` (text|null). All other keys unchanged.

- [ ] **Step 1: Write the migration**

`CREATE OR REPLACE FUNCTION public.get_attendance_for_date(...)` reproducing the current prod def, with these three additions:

In the `daily_lab` CTE SELECT list, after `twp.title AS task_work_title`, add:

```sql
      ,
      d.subcontract_id AS subcontract_id,
      sc.title AS subcontract_title,
      lc.name AS trade_name
```

In the `daily_lab` CTE FROM/JOINs, after the `task_work_packages twp` LEFT JOIN, add:

```sql
    LEFT JOIN public.subcontracts sc ON sc.id = d.subcontract_id
    LEFT JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
```

In the `'daily_laborers'` jsonb_agg object, after `'task_work_title', dl.task_work_title`, add:

```sql
          ,
          'subcontract_id',    dl.subcontract_id,
          'subcontract_title', dl.subcontract_title,
          'trade_name',        dl.trade_name
```

End with:

```sql
GRANT EXECUTE ON FUNCTION public.get_attendance_for_date(uuid, date) TO authenticated, service_role;
```

(Full current def is available via `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='get_attendance_for_date'` — copy it verbatim, then apply the three additions above.)

- [ ] **Step 2: Apply to prod (CONFIRM FIRST)**

On user confirmation, `apply_migration` name `attendance_for_date_expose_trade`. Stop on error.

- [ ] **Step 3: Verify live RPC returns the new keys**

Run:

```sql
WITH site AS (SELECT id FROM public.sites WHERE name ILIKE '%srinivasan%')
SELECT jsonb_path_query_array(
  public.get_attendance_for_date((SELECT id FROM site), '2026-06-25'),
  '$.daily_laborers[*] ? (@.trade_name != null)'
);
```

Expected: at least one row with `"trade_name": "Painting"`, `"subcontract_title": "Painting — In-house"`, non-null `subcontract_id`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260705110100_attendance_for_date_expose_trade.sql
git commit -m "feat(attendance): expose subcontract + trade per laborer in get_attendance_for_date"
```

---

### Task 4: useAttendanceForDate — carry trade fields + trade-contract bucket

**Files:**
- Modify: `src/hooks/queries/useAttendanceForDate.ts`

**Interfaces:**
- Consumes: RPC keys from Task 3 (`subcontract_id`, `subcontract_title`, `trade_name`).
- Produces: `AttendanceLaborerRow` gains `subcontractId: string|null`, `subcontractTitle: string|null`, `tradeName: string|null`, and `isTradeContract: boolean` (true when `tradeName` is set AND not `'Civil'` AND not task-work-tagged). `dailyLaborersByType` gains `tradeContract: AttendanceLaborerRow[]`. Bucketing precedence: task-work first, then trade-contract, then contract (company/Civil), then daily.

- [ ] **Step 1: Extend the row interface**

In `AttendanceLaborerRow`, after `taskWorkTitle: string | null;` add:

```ts
  // Trade attribution: when this row's subcontract belongs to a non-Civil trade
  // (e.g. Painting), it settles in that trade's own workspace and is greyed out
  // of the company/Civil settlement. Civil / untagged rows have isTradeContract
  // = false and stay in the company bucket.
  subcontractId: string | null;
  subcontractTitle: string | null;
  tradeName: string | null;
  isTradeContract: boolean;
```

- [ ] **Step 2: Add the bucket to the return type**

In `dailyLaborersByType`, add after `taskWork: AttendanceLaborerRow[];`:

```ts
    tradeContract: AttendanceLaborerRow[]; // non-Civil trade-contract rows (settled in that trade's workspace)
```

- [ ] **Step 3: Map the new fields**

In the `dailyLaborers` map (the `.map((l: any) => ({ ... }))`), after `taskWorkTitle: parseTaskWorkTitle(l.task_work_title),` add:

```ts
          subcontractId: l.subcontract_id ? String(l.subcontract_id) : null,
          subcontractTitle:
            typeof l.subcontract_title === "string" && l.subcontract_title.length > 0
              ? l.subcontract_title
              : null,
          tradeName:
            typeof l.trade_name === "string" && l.trade_name.length > 0
              ? l.trade_name
              : null,
          isTradeContract:
            !l.task_work_package_id &&
            typeof l.trade_name === "string" &&
            l.trade_name.length > 0 &&
            l.trade_name !== "Civil",
```

- [ ] **Step 4: Bucket trade-contract rows**

Replace the bucketing loop (the `for (const lab of dailyLaborers)` block that fills `taskWorkBucket`/`contractBucket`/`dailyBucket`) with:

```ts
        const contractBucket: AttendanceLaborerRow[] = [];
        const dailyBucket: AttendanceLaborerRow[] = [];
        const taskWorkBucket: AttendanceLaborerRow[] = [];
        const tradeContractBucket: AttendanceLaborerRow[] = [];
        for (const lab of dailyLaborers) {
          if (lab.taskWorkPackageId) taskWorkBucket.push(lab);
          else if (lab.isTradeContract) tradeContractBucket.push(lab);
          else if (lab.laborerType === "contract") contractBucket.push(lab);
          else dailyBucket.push(lab);
        }
```

- [ ] **Step 5: Return the new bucket**

In the returned `dailyLaborersByType`, add after `taskWork: taskWorkBucket,`:

```ts
            tradeContract: tradeContractBucket,
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` (or `npm run build`)
Expected: no type errors in this file.

```bash
git add src/hooks/queries/useAttendanceForDate.ts
git commit -m "feat(attendance): carry trade attribution + tradeContract bucket in useAttendanceForDate"
```

---

### Task 5: AttendanceTab — greyed trade-contract section with a trade chip

**Files:**
- Modify: `src/components/common/InspectPane/AttendanceTab.tsx`

**Interfaces:**
- Consumes: `dailyLaborersByType.tradeContract` (Task 4). Each row exposes `tradeName`, `subcontractTitle`.
- Produces: a reusable `TradeContractPaidSection` component rendered in BOTH `DayDetailExpansion` (below the existing task-work / info sections) and `DailyShape`.

- [ ] **Step 1: Add the TradeContractPaidSection component**

Near the existing `TaskWorkPaidSection` component, add a sibling that renders one greyed block per row with a trade chip. Use the same greyed styling (`opacity: 0.7`, dashed border, `text.secondary`) already used by the task-work section:

```tsx
function TradeContractPaidSection({ rows }: { rows: AttendanceLaborerRow[] }) {
  const theme = useTheme();
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Box sx={{ mt: 1.5, opacity: 0.7 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary"
          sx={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Trade contract ({rows.length})
        </Typography>
        <Typography variant="caption"
          sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          ₹{total.toLocaleString("en-IN")}
        </Typography>
      </Box>
      <Box sx={{ display: "block", mb: 0.5, px: 0.5, fontSize: 10, fontStyle: "italic", color: "text.secondary" }}>
        Not included in this settlement&apos;s calculation — settled separately under the trade&apos;s own workspace.
      </Box>
      <Stack spacing={0.5}>
        {rows.map((lab) => (
          <Box key={lab.id}
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 0.5, px: 1.25,
              bgcolor: theme.palette.background.default, border: `1px dashed ${theme.palette.divider}`, borderRadius: 1 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12.5 }}>{lab.name}</Typography>
                <Chip size="small" label={lab.tradeName ?? "Trade"} variant="outlined"
                  sx={{ height: 18, fontSize: 10, fontWeight: 600, "& .MuiChip-label": { px: 0.75 } }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>
                {lab.subcontractTitle ? `${lab.role} · ${lab.subcontractTitle}` : lab.role}
              </Typography>
            </Box>
            <Typography variant="caption" fontWeight={600} color="text.secondary"
              sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              ₹{lab.amount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
```

(Confirm `Chip` is imported at the top of the file; it is already used elsewhere in this module.)

- [ ] **Step 2: Wire it into DayDetailExpansion**

In `DayDetailExpansion`, add a derived list near the other buckets:

```tsx
  const tradeContractRows = data?.dailyLaborersByType?.tradeContract ?? [];
```

Include it in `totalWorked` so headcount stays complete — change the `totalWorked` sum to add `tradeContractRows.length`:

```tsx
  const totalWorked =
    dailyOnlyList.length +
    contractList.length +
    marketList.length +
    tradeContractRows.length +
    taskWorkCount;
```

Render `<TradeContractPaidSection rows={tradeContractRows} />` immediately before the existing `<TaskWorkPaidSection ... />` in the render body.

- [ ] **Step 3: Wire it into DailyShape**

In `DailyShape`, derive `const tradeContractRows = data?.dailyLaborersByType?.tradeContract ?? [];` and render `<TradeContractPaidSection rows={tradeContractRows} />` immediately before its `<TaskWorkPaidSection ... />`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/InspectPane/AttendanceTab.tsx
git commit -m "feat(payments): show non-Civil trade-contract laborers greyed with a trade chip"
```

---

### Task 6: Auto-default subcontract_id for in-house trade mesthris on attendance save

**Files:**
- Modify: `src/components/attendance/AttendanceDrawer.tsx`

**Interfaces:**
- Consumes: existing `siteId`, `selectedLaborers`, `tradeScopeActive`, `scopedContractId`, `wholeContract`.
- Produces: a per-laborer `mesthriHomeContractByLaborer: Map<string,string>` used to fill `subcontract_id` when it would otherwise be null.

- [ ] **Step 1: Load in-house non-Civil trade contracts for the site**

Add a React Query near the other queries in `AttendanceDrawer` that fetches active in-house non-Civil trade contracts for `siteId` and maps `laborer_id → id`:

```tsx
  const { data: mesthriHomeContractByLaborer } = useQuery<Map<string, string>>({
    queryKey: ["mesthri-home-contract", siteId],
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: async () => {
      const supabaseQ: any = createClient();
      const { data, error } = await supabaseQ
        .from("subcontracts")
        .select("id, laborer_id, is_in_house, status, labor_categories!inner(name)")
        .eq("site_id", siteId)
        .eq("is_in_house", true)
        .eq("status", "active")
        .not("laborer_id", "is", null)
        .neq("labor_categories.name", "Civil");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of (data ?? []) as any[]) {
        if (r.laborer_id && !m.has(r.laborer_id)) m.set(String(r.laborer_id), String(r.id));
      }
      return m;
    },
  });
```

(Confirm `useQuery` and `createClient` are already imported in this file; they are.)

- [ ] **Step 2: Apply the default in the payload**

In the `namedRecords` map, replace the `subcontract_id:` assignment (currently `tradeScopeActive ? scopedContractId : wholeContract ? (scopedContractId ?? null) : null`) with a version that falls back to the laborer's home trade contract only when the value would be null:

```tsx
          subcontract_id: (() => {
            const explicit = tradeScopeActive
              ? scopedContractId
              : wholeContract
              ? (scopedContractId ?? null)
              : null;
            if (explicit) return explicit;
            // No contract chosen: if this laborer is the in-house mesthri of a
            // non-Civil trade contract (e.g. Asis → Painting), default to it so
            // their day settles in that trade's workspace, not the Civil pool.
            // Recording a genuine Civil day means picking Civil explicitly, which
            // sets tradeScopeActive/wholeContract above.
            return mesthriHomeContractByLaborer?.get(s.laborerId) ?? null;
          })(),
```

- [ ] **Step 3: Guard the scoped delete against the new default**

The scoped delete (`deleteBuilder ... .eq("subcontract_id", scopedContractId)` when `tradeScopeActive`) is unchanged and correct: auto-default only fires when NOT trade-scoped, so it never collides with the scoped delete. Add a code comment at the delete noting this, then verify no other code path assumes `subcontract_id` is null for non-trade saves. Search:

Run: `rg -n "subcontract_id" src/components/attendance/AttendanceDrawer.tsx`
Expected: the load (line ~751, select list), the save payload (now updated), and the scoped delete — no other assumption that a non-trade save is null.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/attendance/AttendanceDrawer.tsx
git commit -m "feat(attendance): default untagged in-house trade-mesthri days to their contract"
```

---

### Task 1: Data fix — re-tag Asis's two untagged painting days

**Files:** none (one-off prod data UPDATE).

**Interfaces:** none.

- [ ] **Step 1: Show the exact target rows (read-only)**

Run:

```sql
SELECT d.id, d.date, d.subcontract_id, d.section_id, d.daily_earnings
FROM public.daily_attendance d
WHERE d.laborer_id = '22090769-179b-42ad-9da4-f9ba440aab49'
  AND d.subcontract_id IS NULL
  AND d.task_work_package_id IS NULL
  AND d.is_deleted = false AND d.is_archived = false;
```

Expected: exactly the two rows dated 2026-06-27 and 2026-07-01 (₹1,000 each). If more/other rows appear, STOP and report — do not proceed.

- [ ] **Step 2: Get explicit user confirmation for the prod write**

Present the two rows and ask the user to confirm re-tagging them to Painting — In-house (`71a92fdb…`). Wait for explicit yes.

- [ ] **Step 3: Apply the UPDATE (only after confirmation)**

Run:

```sql
UPDATE public.daily_attendance
SET subcontract_id = '71a92fdb-5045-4989-8155-f55566fe91f8',
    updated_at = now()
WHERE laborer_id = '22090769-179b-42ad-9da4-f9ba440aab49'
  AND subcontract_id IS NULL
  AND task_work_package_id IS NULL
  AND is_deleted = false AND is_archived = false
  AND date IN ('2026-06-27','2026-07-01');
```

Expected: `UPDATE 2`.

- [ ] **Step 4: Verify**

Re-run the Step 1 SELECT. Expected: **0 rows** (no untagged painting days remain). Re-run Task 2 Step 4 — `company_wages` dropped by another ₹2,000 and `painting_wages` now totals all 6 days (₹6,000).

(No commit — data-only.)

---

### Task 7: Verify painting labour surfaces under Painting in /site/expenses

**Files:**
- Verify: `src/app/(main)/site/expenses/page.v2.tsx` (modify only if a gap is found).

**Interfaces:**
- Consumes: the labour-expense rows' `contract_id` (already mapped to trade via `contractToTrade`).

- [ ] **Step 1: Verify the expense row source carries contract_id from subcontract_id**

Identify how labour expense rows get `contract_id`. Run:

```sql
WITH site AS (SELECT id FROM public.sites WHERE name ILIKE '%srinivasan%')
SELECT e.id, e.contract_id, e.amount, e.category, e.expense_date
FROM public.expenses e
JOIN site ON e.site_id = site.id
WHERE e.expense_date IN ('2026-06-27','2026-07-01')
ORDER BY e.expense_date;
```

(Adjust table/column names to the actual expenses source used by `page.v2.tsx` — inspect the fetch in that file first: `rg -n "from\\(|rpc\\(|contract_id|subcontract" src/app/(main)/site/expenses/page.v2.tsx`.)

Expected after Task 1: the labour expense rows for those dates carry `contract_id = 71a92fdb…` (Painting). If so, the page already groups them under Painting — **no code change; skip to Step 3.**

- [ ] **Step 2 (only if gap): backfill/derive contract_id for labour expenses**

If the labour expense rows carry a NULL `contract_id` despite the tagged attendance, the attendance→expense sync does not propagate `subcontract_id`. Fix at the sync source (locate via `rg -n "synced_to_expense|expense_id" src/lib`), setting the expense's `contract_id` from `daily_attendance.subcontract_id`, and backfill Asis's two rows. Get user confirmation before any prod write. (Document the exact file/line once located; do not guess-edit.)

- [ ] **Step 3: Playwright check on dev:cloud**

On `/site/expenses` for Srinivasan, group/filter by trade → confirm a **Painting** group/line containing Asis's labour, separated from Civil, not under "Unlinked". Screenshot. Console clean.

- [ ] **Step 4: Commit (only if Step 2 changed code)**

```bash
git add -A
git commit -m "fix(expenses): tag in-house trade labour expenses to their contract"
```

---

### Task 8: Painting workspace — make the contract name explicit

**Files:**
- Verify/modify: `src/components/payments/TradeSettlementView.tsx`

**Interfaces:**
- Consumes: `contract: TradeContract` prop (already scoped to Painting — In-house).

- [ ] **Step 1: Verify the header names the contract**

Open the Painting chip on `/site/payments` (Srinivasan). Confirm the view header shows the contract title ("Painting — In-house") and its trade. If already clear, **no change** — mark done.

- [ ] **Step 2 (only if unclear): add the contract title to the header**

If the header shows only a generic label, add `contract.title` (and a Painting trade chip via `tradeColor`) to the `TradeSettlementView` header so settling there is unambiguous. Keep the change minimal and consistent with the existing header styling.

- [ ] **Step 3: Build + commit (only if changed)**

Run: `npm run build` → `✓ Compiled successfully`.

```bash
git add src/components/payments/TradeSettlementView.tsx
git commit -m "feat(payments): name the trade contract explicitly in TradeSettlementView"
```

---

## Final verification (all tasks)

- [ ] `npm run build` green; `npx vitest run` — full suite passes (≥1179 tests).
- [ ] Read-only prod SELECTs: default `get_salary_slice_summary(site, NULL)` mestri owed dropped by exactly Asis's painting total; `get_salary_slice_summary(site, '71a92fdb…')` unchanged and shows all 6 days.
- [ ] Playwright (dev:cloud, Srinivasan, Padmavathy login), console clean, browser closed:
  - Company Settlement default per-day expansion: Asis's painting days greyed under "Trade contract" with a **Painting** chip; excluded from the settleable total; Civil unaffected; `N worked on this day` still counts them.
  - Painting chip → workspace shows all 6 days / its own settle flow.
  - `/site/expenses`: painting labour under a **Painting** group, not "Unlinked".
  - `/site/attendance`: new Asis day with no contract → defaults to Painting; an explicit Civil day stays Civil.
- [ ] Migrations `20260705110000`, `20260705110100` applied to prod (confirmed). Code uncommitted-until-"move to prod" or committed as local checkpoints per the executing flow (do not push).
