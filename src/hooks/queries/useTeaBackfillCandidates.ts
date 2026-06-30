/**
 * useTeaBackfillCandidates
 *
 * Finds the days a grouped tea bill was NEVER logged even though contract (or
 * regular) crews worked — the "No tea logged" gaps — so the Backfill Assistant
 * can create one group tea entry per day, split by man-days across every crew.
 *
 * For each candidate day it returns the same crew rows the live allocator builds
 * (the implicit per-site mesthri row + one row per activated contract that
 * worked), a suggested amount (recent ₹/man-day × that day's man-days), and the
 * contract chips for display. It also returns the blended rate so the dialog can
 * expose it as one editable knob.
 *
 * Exclusions mirror the page's `contract_no_tea` rows: a date already carrying a
 * group entry, or a site-wide holiday, is skipped. Activated-trade gating reuses
 * the same `deactivatedTradeIds` set as the allocator (un-activated trades fold
 * into the mesthri row).
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";
import type { ContractTeaModelRow } from "@/lib/tea/buildContractTeaModel";

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export interface BackfillCandidateRow extends ContractTeaModelRow {
  siteName: string;
  label: string;
  tradeName?: string | null;
}

export interface BackfillCandidate {
  date: string;
  rows: BackfillCandidateRow[];
  /** Contract items (excludes the mesthri row) for compact chips. */
  contractItems: { title: string; manDays: number }[];
  totalManDays: number;
  suggestedAmount: number;
}

export interface TeaBackfillData {
  candidates: BackfillCandidate[];
  ratePerManDay: number | null;
}

export interface UseTeaBackfillCandidatesOptions {
  siteGroupId: string | undefined;
  sites: { id: string; name: string }[];
  dateFrom: string | undefined;
  dateTo: string | undefined;
  /** Trade categories with the per-site workspace toggle OFF (folded into mesthri). */
  deactivatedTradeIds?: Set<string>;
  enabled?: boolean;
}

export function useTeaBackfillCandidates({
  siteGroupId,
  sites,
  dateFrom,
  dateTo,
  deactivatedTradeIds,
  enabled = true,
}: UseTeaBackfillCandidatesOptions) {
  const supabase = createClient();
  const ids = sites.map((s) => s.id).filter(Boolean).sort();
  const nameById = new Map(sites.map((s) => [s.id, s.name]));
  const deactivated = deactivatedTradeIds ?? new Set<string>();

  return useQuery<TeaBackfillData>({
    queryKey: [
      "tea-backfill-candidates",
      siteGroupId,
      ids,
      dateFrom,
      dateTo,
      [...deactivated].sort(),
    ] as const,
    enabled: enabled && !!siteGroupId && ids.length > 0 && !!dateFrom && !!dateTo,
    staleTime: cacheTTL.transactional,
    queryFn: async (): Promise<TeaBackfillData> => {
      if (!siteGroupId || !dateFrom || !dateTo || ids.length === 0) {
        return { candidates: [], ratePerManDay: null };
      }

      // ---- Presence (range, multi-site) -----------------------------------
      const pkgQuery = (supabase.from("task_work_day_logs" as any) as any)
        .select(
          "site_id, log_date, man_days, worker_count, worker_lines, package_id, task_work_packages!inner(title, labor_category_id)"
        )
        .in("site_id", ids)
        .gte("log_date", dateFrom)
        .lte("log_date", dateTo);

      const scQuery = (supabase.from("subcontract_headcount_attendance" as any) as any)
        .select(
          "attendance_date, units, subcontract_id, subcontracts!inner(title, site_id, trade_category_id)"
        )
        .in("subcontracts.site_id", ids)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo);

      // ---- Regular-crew day-units (range, multi-site) ----------------------
      const daQuery = (supabase.from("daily_attendance" as any) as any)
        .select("site_id, date, day_units")
        .in("site_id", ids)
        .eq("is_deleted", false)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      const mlQuery = (supabase.from("market_laborer_attendance" as any) as any)
        .select("site_id, date, count")
        .in("site_id", ids)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      // ---- Exclusions: any tea entry (group OR individual site) + holidays --
      const entryQuery = (supabase.from("tea_shop_entries" as any) as any)
        .select("date, site_group_id, site_id")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .or(`site_group_id.eq.${siteGroupId},site_id.in.(${ids.join(",")})`);

      const holidayQuery = (supabase.from("site_holidays" as any) as any)
        .select("date, trade_category_id")
        .in("site_id", ids)
        .is("trade_category_id", null)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      // ---- Recent group entries for the blended rate -----------------------
      const recentEntriesQuery = (supabase.from("tea_shop_entries" as any) as any)
        .select("id")
        .eq("site_group_id", siteGroupId)
        .eq("is_group_entry", true)
        .order("date", { ascending: false })
        .limit(60);

      const [pkgRes, scRes, daRes, mlRes, entryRes, holidayRes, recentRes] =
        await Promise.all([
          pkgQuery,
          scQuery,
          daQuery,
          mlQuery,
          entryQuery,
          holidayQuery,
          recentEntriesQuery,
        ]);

      for (const [label, res] of [
        ["packages", pkgRes],
        ["subcontracts", scRes],
        ["daily_attendance", daRes],
        ["market", mlRes],
        ["entries", entryRes],
        ["holidays", holidayRes],
        ["recent", recentRes],
      ] as const) {
        if (res.error) console.warn(`Backfill candidates (${label}) failed:`, res.error);
      }

      // Blended ₹/man-day from recent group-entry allocations (robust to the
      // legacy total_day_units being null).
      let ratePerManDay: number | null = null;
      const recentIds = ((recentRes.data || []) as any[]).map((r) => r.id);
      if (recentIds.length > 0) {
        const { data: allocs } = await (supabase.from("tea_shop_entry_allocations" as any) as any)
          .select("allocated_amount, day_units_sum")
          .in("entry_id", recentIds);
        let amt = 0;
        let units = 0;
        for (const a of (allocs || []) as any[]) {
          amt += Number(a.allocated_amount) || 0;
          units += Number(a.day_units_sum) || 0;
        }
        ratePerManDay = units > 0 ? amt / units : null;
      }

      const excludeDates = new Set<string>();
      for (const r of (entryRes.data || []) as any[]) excludeDates.add(r.date);
      for (const r of (holidayRes.data || []) as any[]) excludeDates.add(r.date);

      // date -> site -> rows
      type DayBucket = Map<string, BackfillCandidateRow[]>;
      const byDate = new Map<string, DayBucket>();
      const ensure = (date: string, siteId: string): BackfillCandidateRow[] => {
        let sites_ = byDate.get(date);
        if (!sites_) {
          sites_ = new Map();
          byDate.set(date, sites_);
        }
        let arr = sites_.get(siteId);
        if (!arr) {
          arr = [];
          sites_.set(siteId, arr);
        }
        return arr;
      };

      // Mesthri man-days per (date, site) = daily_attendance.day_units + market count.
      const mesthriUnits = new Map<string, number>(); // `${date}|${siteId}` -> units
      const addMesthri = (date: string, siteId: string, u: number) => {
        if (u <= 0) return;
        const k = `${date}|${siteId}`;
        mesthriUnits.set(k, (mesthriUnits.get(k) ?? 0) + u);
      };
      for (const r of (daRes.data || []) as any[]) {
        addMesthri(r.date, r.site_id, Number(r.day_units) || 1);
      }
      for (const r of (mlRes.data || []) as any[]) {
        addMesthri(r.date, r.site_id, Number(r.count) || 0);
      }

      // Contract package items per (date, site).
      for (const r of (pkgRes.data || []) as any[]) {
        const date = r.log_date as string;
        const siteId = r.site_id as string;
        if (excludeDates.has(date) || !nameById.has(siteId)) continue;
        const tradeId = r.task_work_packages?.labor_category_id ?? null;
        if (tradeId && deactivated.has(tradeId)) continue; // folded into mesthri
        const units = num(r.man_days) || num(r.worker_count);
        if (units <= 0) continue;
        ensure(date, siteId).push({
          key: `package:${r.package_id}`,
          siteId,
          siteName: nameById.get(siteId) ?? siteId,
          label: r.task_work_packages?.title ?? "Task work",
          presenceKind: "package",
          refId: r.package_id,
          tradeCategoryId: tradeId,
          tradeName: undefined,
          manDays: units,
        });
      }

      // Headcount subcontract items per (date, site) — fold roles to one item.
      const scAgg = new Map<string, BackfillCandidateRow>();
      for (const r of (scRes.data || []) as any[]) {
        const date = r.attendance_date as string;
        const siteId = r.subcontracts?.site_id as string;
        if (!date || excludeDates.has(date) || !nameById.has(siteId)) continue;
        const tradeId = r.subcontracts?.trade_category_id ?? null;
        if (tradeId && deactivated.has(tradeId)) continue;
        const key = `${date}|${r.subcontract_id}`;
        const cur = scAgg.get(key) ?? {
          key: `subcontract:${r.subcontract_id}`,
          siteId,
          siteName: nameById.get(siteId) ?? siteId,
          label: r.subcontracts?.title ?? "Contract",
          presenceKind: "subcontract" as const,
          refId: r.subcontract_id,
          tradeCategoryId: tradeId,
          tradeName: undefined,
          manDays: 0,
        };
        cur.manDays += num(r.units);
        scAgg.set(key, cur);
      }
      for (const [key, row] of scAgg.entries()) {
        if (row.manDays <= 0) continue;
        const date = key.split("|")[0];
        ensure(date, row.siteId).push(row);
      }

      // Now fold the mesthri rows in: a site is a candidate on a date if it has
      // any contract rows OR positive mesthri units.
      for (const [k, u] of mesthriUnits.entries()) {
        const [date, siteId] = k.split("|");
        if (excludeDates.has(date) || !nameById.has(siteId)) continue;
        if (u <= 0) continue;
        // Prepend a mesthri row so it sorts above contracts for the site.
        ensure(date, siteId).unshift({
          key: `mesthri:${siteId}`,
          siteId,
          siteName: nameById.get(siteId) ?? siteId,
          label: "Regular crew (mesthri)",
          presenceKind: "mesthri",
          refId: null,
          tradeCategoryId: null,
          tradeName: null,
          manDays: u,
        });
      }

      // Build candidates, newest first.
      const candidates: BackfillCandidate[] = [];
      const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1));
      for (const date of dates) {
        const siteMap = byDate.get(date)!;
        const rows: BackfillCandidateRow[] = [];
        for (const siteId of ids) {
          const arr = siteMap.get(siteId);
          if (arr && arr.length) rows.push(...arr);
        }
        if (rows.length === 0) continue;
        const totalManDays = rows.reduce((s, r) => s + r.manDays, 0);
        if (totalManDays <= 0) continue;
        const contractItems = rows
          .filter((r) => r.presenceKind !== "mesthri")
          .map((r) => ({ title: r.label, manDays: r.manDays }));
        // Scope: only days that had CONTRACT work (the user's ask). A pure
        // regular-crew day with no contract is left out — its mesthri tea is the
        // normal Add-Entry flow, not this backfill. (Mesthri man-days on a
        // contract day still count toward that day's split.)
        if (contractItems.length === 0) continue;
        const suggestedAmount =
          ratePerManDay != null ? Math.round(ratePerManDay * totalManDays) : 0;
        candidates.push({ date, rows, contractItems, totalManDays, suggestedAmount });
      }

      return { candidates, ratePerManDay };
    },
  });
}
