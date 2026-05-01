"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import type {
  InterSiteSettlement,
  InterSiteSettlementWithDetails,
  InterSiteBalance,
  InterSiteBalanceMaterial,
  SiteSettlementSummary,
  InterSiteSettlementStatus,
  SettlementPaymentFormData,
} from "@/types/material.types";

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if error is due to missing table or query issues
 */
function isQueryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "42P01" ||
    err.code === "PGRST" ||
    (err.message?.includes("relation") ?? false) ||
    (err.message?.includes("does not exist") ?? false) ||
    (err.message?.includes("Could not find") ?? false)
  );
}

// ============================================
// FETCH SETTLEMENTS
// ============================================

/**
 * Fetch all settlements for a site (where site is either creditor or debtor)
 */
export function useInterSiteSettlements(
  siteId: string | undefined,
  status?: InterSiteSettlementStatus
) {
  const supabase = createClient();

  return useQuery({
    queryKey: status
      ? [...queryKeys.interSiteSettlements.bySite(siteId || ""), status]
      : queryKeys.interSiteSettlements.bySite(siteId || ""),
    queryFn: async () => {
      if (!siteId) return [] as InterSiteSettlementWithDetails[];

      try {
        let query = (supabase as any)
          .from("inter_site_material_settlements")
          .select(`
            *,
            from_site:sites!inter_site_material_settlements_from_site_id_fkey(id, name),
            to_site:sites!inter_site_material_settlements_to_site_id_fkey(id, name),
            site_group:site_groups(id, name)
          `)
          .or(`from_site_id.eq.${siteId},to_site_id.eq.${siteId}`)
          .order("created_at", { ascending: false });

        if (status) {
          query = query.eq("status", status);
        }

        const { data, error } = await query;
        if (error) {
          if (isQueryError(error)) {
            console.warn("Inter-site settlements query failed:", error.message);
            return [] as InterSiteSettlementWithDetails[];
          }
          throw error;
        }
        return (data || []) as InterSiteSettlementWithDetails[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Inter-site settlements query failed:", err);
          return [] as InterSiteSettlementWithDetails[];
        }
        throw err;
      }
    },
    enabled: !!siteId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Fetch a single settlement with full details
 */
export function useInterSiteSettlement(settlementId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: settlementId
      ? queryKeys.interSiteSettlements.byId(settlementId)
      : ["inter-site-settlements", "detail"],
    queryFn: async () => {
      if (!settlementId) return null;

      // Get settlement with related data
      const { data: settlement, error: settlementError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select(`
          *,
          from_site:sites!inter_site_material_settlements_from_site_id_fkey(id, name),
          to_site:sites!inter_site_material_settlements_to_site_id_fkey(id, name),
          site_group:site_groups(id, name)
        `)
        .eq("id", settlementId)
        .single();

      if (settlementError) throw settlementError;

      // Get settlement items
      const { data: items, error: itemsError } = await (supabase as any)
        .from("inter_site_settlement_items")
        .select(`
          *,
          material:materials(id, name, code, unit),
          brand:material_brands(id, brand_name)
        `)
        .eq("settlement_id", settlementId)
        .order("usage_date", { ascending: false });

      if (itemsError) throw itemsError;

      // Get payment records
      const { data: payments, error: paymentsError } = await (supabase as any)
        .from("inter_site_settlement_payments")
        .select("*")
        .eq("settlement_id", settlementId)
        .order("payment_date", { ascending: false });

      if (paymentsError) throw paymentsError;

      return {
        ...settlement,
        items: items || [],
        payments: payments || [],
      } as InterSiteSettlementWithDetails;
    },
    enabled: !!settlementId,
  });
}

// ============================================
// BALANCE CALCULATIONS
// ============================================

/**
 * Calculate pending balances between sites in a group
 * This aggregates unsettled batch_usage_records to show who owes whom
 *
 * NOTE: We only use batch_usage_records as the source of truth.
 * group_stock_transactions was the old approach and is NOT included here
 * to avoid double-counting (each usage creates both records).
 */
export function useInterSiteBalances(groupId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? queryKeys.interSiteSettlements.balances(groupId)
      : ["inter-site-settlements", "balances"],
    queryFn: async () => {
      if (!groupId) return [] as InterSiteBalance[];

      try {
        // Get group info
        const { data: group, error: groupError } = await (supabase as any)
          .from("site_groups")
          .select("id, name")
          .eq("id", groupId)
          .single();

        if (groupError) {
          if (isQueryError(groupError)) {
            console.warn("Site group query failed:", groupError.message);
            return [] as InterSiteBalance[];
          }
          throw groupError;
        }

        // Get pending batch usage records - this is the ONLY source of truth for balances
        // Do NOT also query group_stock_transactions as that causes double-counting
        const { data: batchUsageRecords, error: batchError } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            *,
            material:materials(id, name, code, unit),
            usage_site:sites!batch_usage_records_usage_site_id_fkey(id, name),
            batch:material_purchase_expenses!batch_usage_records_batch_ref_code_fkey(
              ref_code,
              paying_site_id,
              site_id,
              is_paid,
              paying_site:sites!material_purchase_expenses_paying_site_id_fkey(id, name)
            )
          `)
          .eq("site_group_id", groupId)
          .eq("settlement_status", "pending")
          .not("usage_site_id", "is", null)
          .eq("is_self_use", false) // Exclude self-use
          .order("usage_date", { ascending: false });

        if (batchError) {
          if (isQueryError(batchError)) {
            console.warn("Batch usage records query failed:", batchError.message);
            return [] as InterSiteBalance[];
          }
          throw batchError;
        }

        // Aggregate balances: for each usage by site X of material paid by site Y
        // Site X owes Site Y the usage cost
        const balanceMap = new Map<string, InterSiteBalance>();
        // Material breakdown: sitePairKey -> materialId -> breakdown
        const materialBreakdownMap = new Map<string, Map<string, InterSiteBalanceMaterial>>();

        // Process batch usage records (source of truth)
        for (const record of batchUsageRecords || []) {
          const paymentSourceSiteId = record.batch?.paying_site_id || record.batch?.site_id;

          if (!record.usage_site_id || !paymentSourceSiteId) continue;

          // Skip if the using site is the same as the paying site
          if (record.usage_site_id === paymentSourceSiteId) continue;

          const key = `${paymentSourceSiteId}-${record.usage_site_id}`;
          const amount = record.total_cost || 0;
          const vendorPaid = record.batch?.is_paid ?? false;

          if (balanceMap.has(key)) {
            const existing = balanceMap.get(key)!;
            existing.total_amount_owed += amount;
            existing.transaction_count += 1;
            existing.total_quantity += record.quantity || 0;
            // If any batch in this balance is vendor-unpaid, mark the whole balance as having unpaid vendors
            if (!vendorPaid) {
              existing.has_unpaid_vendor = true;
            }
          } else {
            balanceMap.set(key, {
              site_group_id: groupId,
              group_name: group.name,
              creditor_site_id: paymentSourceSiteId,
              creditor_site_name: record.batch?.paying_site?.name || "Unknown",
              debtor_site_id: record.usage_site_id,
              debtor_site_name: record.usage_site?.name || "Unknown",
              year: new Date(record.usage_date).getFullYear(),
              week_number: getWeekNumber(new Date(record.usage_date)),
              week_start: weekStartStr(record.usage_date),
              week_end: weekEndStr(record.usage_date),
              transaction_count: 1,
              material_count: 1,
              total_quantity: record.quantity || 0,
              total_amount_owed: amount,
              is_settled: false,
              has_unpaid_vendor: !vendorPaid,
              material_breakdown: [],
            });
          }

          // Build material-level breakdown
          if (!materialBreakdownMap.has(key)) {
            materialBreakdownMap.set(key, new Map());
          }
          const matMap = materialBreakdownMap.get(key)!;
          const matId = record.material_id;

          if (matMap.has(matId)) {
            const existing = matMap.get(matId)!;
            existing.total_amount += amount;
            existing.quantity += record.quantity || 0;
            existing.transaction_count += 1;
            if (!vendorPaid) existing.has_unpaid_vendor = true;
          } else {
            matMap.set(matId, {
              material_id: matId,
              material_name: record.material?.name || "Unknown",
              material_code: record.material?.code || "",
              total_amount: amount,
              quantity: record.quantity || 0,
              unit: record.material?.unit || "nos",
              transaction_count: 1,
              has_unpaid_vendor: !vendorPaid,
            });
          }
        }

        // Attach material breakdowns to balances, sorted by amount descending
        for (const [key, balance] of balanceMap.entries()) {
          const matMap = materialBreakdownMap.get(key);
          balance.material_breakdown = matMap
            ? Array.from(matMap.values()).sort((a, b) => b.total_amount - a.total_amount)
            : [];
          balance.material_count = balance.material_breakdown.length;
        }

        return Array.from(balanceMap.values());
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Inter-site balances calculation failed:", err);
          return [] as InterSiteBalance[];
        }
        throw err;
      }
    },
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Get settlement summary for a site
 * Shows total owed to the site and total the site owes
 */
export function useSiteSettlementSummary(siteId: string | undefined) {
  const supabase = createClient();

  const defaultSummary = {
    site_id: siteId || "",
    site_name: "",
    group_id: "",
    group_name: "",
    total_owed_to_you: 0,
    total_you_owe: 0,
    net_balance: 0,
    pending_settlements_count: 0,
    unsettled_count: 0,
    owed_to_you_count: 0,
    you_owe_count: 0,
  } as SiteSettlementSummary;

  return useQuery({
    queryKey: siteId
      ? queryKeys.interSiteSettlements.summary(siteId)
      : ["inter-site-settlements", "summary"],
    queryFn: async () => {
      if (!siteId) return defaultSummary;

      try {
        // Get site info with group
        const { data: site, error: siteError } = await (supabase as any)
          .from("sites")
          .select(`
            id, name, site_group_id,
            site_group:site_groups(id, name)
          `)
          .eq("id", siteId)
          .single();

        if (siteError || !site?.site_group_id) {
          return {
            ...defaultSummary,
            site_name: site?.name || "",
          };
        }

        // Get pending settlements where site is creditor (from_site)
        const { data: asCreditor, error: creditorError } = await (supabase as any)
          .from("inter_site_material_settlements")
          .select("total_amount, paid_amount")
          .eq("from_site_id", siteId)
          .in("status", ["pending", "approved"]);

        if (creditorError) {
          if (isQueryError(creditorError)) {
            console.warn("Creditor settlements query failed:", creditorError.message);
            return { ...defaultSummary, site_name: site.name };
          }
          throw creditorError;
        }

        // Get pending settlements where site is debtor (to_site)
        const { data: asDebtor, error: debtorError } = await (supabase as any)
          .from("inter_site_material_settlements")
          .select("total_amount, paid_amount")
          .eq("to_site_id", siteId)
          .in("status", ["pending", "approved"]);

        if (debtorError) {
          if (isQueryError(debtorError)) {
            console.warn("Debtor settlements query failed:", debtorError.message);
            return { ...defaultSummary, site_name: site.name };
          }
          throw debtorError;
        }

        // Get unsettled batch usage records (source of truth for inter-site balances)
        // Do NOT use group_stock_transactions to avoid double-counting
        const { data: unsettledUsage, error: usageError } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            total_cost,
            usage_site_id,
            batch:material_purchase_expenses!batch_usage_records_batch_ref_code_fkey(
              paying_site_id,
              site_id
            )
          `)
          .eq("site_group_id", site.site_group_id)
          .eq("settlement_status", "pending")
          .eq("is_self_use", false);

        if (usageError) {
          if (isQueryError(usageError)) {
            console.warn("Unsettled usage query failed:", usageError.message);
            return { ...defaultSummary, site_name: site.name };
          }
          throw usageError;
        }

        // Count pending settlements (already generated, awaiting payment)
        const pendingSettlementsCount = (asCreditor?.length || 0) + (asDebtor?.length || 0);

        // Calculate amounts from UNSETTLED batch_usage_records ONLY
        // Do NOT add pending settlements - those were already generated from batch records
        // which are now marked as 'in_settlement' (not 'pending')
        let unsettledOwedToYou = 0;
        let unsettledYouOwe = 0;
        let owedToYouCount = 0;
        let youOweCount = 0;

        for (const record of unsettledUsage || []) {
          const paymentSourceSiteId = record.batch?.paying_site_id || record.batch?.site_id;
          const amount = record.total_cost || 0;

          if (paymentSourceSiteId === siteId && record.usage_site_id !== siteId) {
            // This site paid, another site used = they owe us
            unsettledOwedToYou += amount;
            owedToYouCount += 1;
          } else if (record.usage_site_id === siteId && paymentSourceSiteId !== siteId) {
            // This site used, another site paid = we owe them
            unsettledYouOwe += amount;
            youOweCount += 1;
          }
        }

        // Summary shows ONLY unsettled amounts (to avoid double-counting with pending settlements)
        return {
          site_id: siteId,
          site_name: site.name,
          group_id: site.site_group_id,
          group_name: site.site_group?.name || "",
          total_owed_to_you: unsettledOwedToYou,
          total_you_owe: unsettledYouOwe,
          net_balance: unsettledOwedToYou - unsettledYouOwe,
          pending_settlements_count: pendingSettlementsCount,
          unsettled_count: owedToYouCount + youOweCount,
          owed_to_you_count: owedToYouCount,
          you_owe_count: youOweCount,
        } as SiteSettlementSummary;
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Settlement summary query failed:", err);
          return defaultSummary;
        }
        throw err;
      }
    },
    enabled: !!siteId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================
// SETTLEMENT MUTATIONS
// ============================================

/**
 * Generate a settlement from pending transactions
 * Uses batch_usage_records as the source of truth (matches useInterSiteBalances)
 */
export function useGenerateSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      siteGroupId: string;
      fromSiteId: string; // Creditor (paid for materials)
      toSiteId: string; // Debtor (used materials)
      year?: number;
      weekNumber?: number;
      userId?: string;
      skipVendorCheck?: boolean; // Override: allow generation even if vendor is unpaid
      materialIds?: string[]; // Optional: generate settlement for specific materials only
    }) => {
      await ensureFreshSession();

      const year = data.year || new Date().getFullYear();
      const weekNumber = data.weekNumber || getWeekNumber(new Date());

      // Get unsettled batch_usage_records - this is the SOURCE OF TRUTH
      // Must match the query in useInterSiteBalances to ensure consistency
      // Also fetch is_paid from parent batch to check vendor settlement status
      const { data: batchRecords, error: batchError } = await (supabase as any)
        .from("batch_usage_records")
        .select(`
          *,
          batch:material_purchase_expenses!batch_usage_records_batch_ref_code_fkey(
            paying_site_id,
            site_id,
            is_paid
          )
        `)
        .eq("site_group_id", data.siteGroupId)
        .eq("usage_site_id", data.toSiteId)
        .eq("settlement_status", "pending")
        .eq("is_self_use", false);

      if (batchError) throw batchError;

      // Filter to only records where creditor (paying site) matches fromSiteId
      let matchingRecords = (batchRecords || []).filter((record: any) => {
        const payingSiteId = record.batch?.paying_site_id || record.batch?.site_id;
        return payingSiteId === data.fromSiteId;
      });

      // If materialIds specified, further filter to those materials only
      if (data.materialIds && data.materialIds.length > 0) {
        matchingRecords = matchingRecords.filter(
          (record: any) => data.materialIds!.includes(record.material_id)
        );
      }

      if (matchingRecords.length === 0) {
        throw new Error("No unsettled transactions found between these sites");
      }

      // VENDOR SETTLEMENT GATE: Check if all parent batches have vendor paid
      // If skipVendorCheck is not set, block generation for unpaid vendor batches
      if (!data.skipVendorCheck) {
        const unpaidBatches = matchingRecords.filter(
          (record: any) => record.batch && record.batch.is_paid === false
        );
        if (unpaidBatches.length > 0) {
          const unpaidBatchCodes = [...new Set(unpaidBatches.map((r: any) => r.batch_ref_code))];
          throw new Error(
            `VENDOR_UNPAID:Vendor settlement must be completed before generating inter-site settlement. ` +
            `The following batch(es) have not been settled with the vendor: ${unpaidBatchCodes.join(", ")}. ` +
            `Please go to Material Settlements and mark the vendor as paid first.`
          );
        }
      }

      // Get the corresponding group_stock_transactions for these records
      const txIds = matchingRecords
        .map((r: any) => r.group_stock_transaction_id)
        .filter(Boolean);

      let transactions: any[] = [];
      if (txIds.length > 0) {
        const { data: txData, error: txError } = await (supabase as any)
          .from("group_stock_transactions")
          .select("*")
          .in("id", txIds);

        if (txError) {
          console.error("Error fetching transactions:", txError);
        } else {
          transactions = txData || [];
        }
      }

      // Calculate total amount from batch_usage_records (source of truth)
      const newAmount = matchingRecords.reduce(
        (sum: number, record: { total_cost: number }) => sum + Math.abs(record.total_cost || 0),
        0
      );

      // Get batch_ref_code from the matching records we already have
      const batchRefCode = matchingRecords[0]?.batch_ref_code || null;

      // Check if there's an existing PENDING settlement for this site pair
      // If yes, ADD to it instead of creating new (to avoid unique constraint violation)
      const { data: existingSettlements, error: existingError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select("*")
        .eq("site_group_id", data.siteGroupId)
        .eq("from_site_id", data.fromSiteId)
        .eq("to_site_id", data.toSiteId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) {
        console.error("Error checking for existing settlement:", existingError);
      }

      const existingSettlement = existingSettlements?.[0] || null;
      let settlement: InterSiteSettlement;

      if (existingSettlement) {
        // ADD to existing pending settlement
        const newTotalAmount = (existingSettlement.total_amount || 0) + newAmount;

        const { data: updatedSettlement, error: updateError } = await (supabase as any)
          .from("inter_site_material_settlements")
          .update({
            total_amount: newTotalAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingSettlement.id)
          .select()
          .single();

        if (updateError) throw updateError;
        settlement = updatedSettlement;
      } else {
        // Create NEW settlement (no existing pending one)
        const timestamp = Date.now().toString(36);
        const settlementCode = `SET-${year}-W${weekNumber}-${timestamp}-${generateShortId()}`;

        const { data: newSettlement, error: settlementError } = await (supabase as any)
          .from("inter_site_material_settlements")
          .insert({
            settlement_code: settlementCode,
            site_group_id: data.siteGroupId,
            from_site_id: data.fromSiteId,
            to_site_id: data.toSiteId,
            batch_ref_code: batchRefCode,
            year,
            week_number: weekNumber,
            period_start: weekStartStr(new Date(year, 0, 1 + (weekNumber - 1) * 7)),
            period_end: weekEndStr(new Date(year, 0, 1 + (weekNumber - 1) * 7)),
            total_amount: newAmount,
            paid_amount: 0,
            status: "pending",
            created_by: data.userId || null,
          })
          .select()
          .single();

        if (settlementError) throw settlementError;
        settlement = newSettlement;
      }

      // Create settlement items from batch_usage_records (source of truth)
      // Fall back to transaction data when available for additional fields
      const txMap = new Map(transactions.map((tx: any) => [tx.id, tx]));

      const itemsToInsert = matchingRecords.map((record: {
        id: string;
        material_id: string;
        brand_id: string | null;
        quantity: number;
        unit_cost: number;
        total_cost: number;
        usage_date: string;
        group_stock_transaction_id: string | null;
      }) => {
        const tx = record.group_stock_transaction_id
          ? txMap.get(record.group_stock_transaction_id)
          : null;

        return {
          settlement_id: settlement.id,
          material_id: record.material_id,
          brand_id: record.brand_id,
          quantity_used: Math.abs(record.quantity),
          unit: "nos",
          unit_cost: record.unit_cost || 0,
          total_cost: Math.abs(record.total_cost || 0),
          transaction_id: record.group_stock_transaction_id,
          usage_date: record.usage_date,
        };
      });

      const { error: itemsError } = await (supabase as any)
        .from("inter_site_settlement_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Mark group_stock_transactions as settled (if any exist)
      if (txIds.length > 0) {
        await (supabase as any)
          .from("group_stock_transactions")
          .update({ settlement_id: settlement.id })
          .in("id", txIds);
      }

      // CRITICAL: Update batch_usage_records using their IDs directly
      // Mark them as 'in_settlement' so they don't appear in unsettled balances but show as pending
      // Note: The table has an auto-update trigger for updated_at, so we don't set it manually
      const batchRecordIds = matchingRecords.map((r: { id: string }) => r.id);
      const { error: batchUpdateError } = await (supabase as any)
        .from("batch_usage_records")
        .update({
          settlement_id: settlement.id,
          settlement_status: 'in_settlement',
        })
        .in("id", batchRecordIds);

      if (batchUpdateError) {
        console.error("Error updating batch_usage_records:", batchUpdateError);
        throw batchUpdateError;
      }

      return settlement as InterSiteSettlement;
    },
    onSuccess: (settlement) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byGroup(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.from_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.to_site_id),
      });
    },
  });
}

/**
 * Approve a settlement
 */
export function useApproveSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: { settlementId: string; userId?: string }) => {
      await ensureFreshSession();

      const { data: settlement, error } = await (supabase as any)
        .from("inter_site_material_settlements")
        .update({
          status: "approved",
          approved_by: data.userId || null,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.settlementId)
        .select()
        .single();

      if (error) throw error;
      return settlement as InterSiteSettlement;
    },
    onSuccess: (settlement) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byId(settlement.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.from_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.to_site_id),
      });
    },
  });
}

/**
 * Delete a settlement
 */
export function useDeleteSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (settlementId: string) => {
      await ensureFreshSession();

      // First, get settlement details for cache invalidation
      const { data: settlement, error: getError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select("site_group_id, from_site_id, to_site_id, settlement_code")
        .eq("id", settlementId)
        .single();

      if (getError) throw getError;

      // CRITICAL: Reset batch_usage_records back to unsettled state
      // This makes them reappear in "Unsettled Balances" after deletion
      const { error: resetBatchError } = await (supabase as any)
        .from("batch_usage_records")
        .update({
          settlement_id: null,
          settlement_status: 'pending', // Keep as pending so they show in Unsettled Balances
          updated_at: new Date().toISOString(),
        })
        .eq("settlement_id", settlementId);

      if (resetBatchError) {
        console.error("Error resetting batch usage records:", resetBatchError);
        throw new Error("Failed to reset batch usage records. Cannot delete settlement.");
      }

      // ALSO reset group_stock_transactions (used by Unsettled Balances query)
      const { error: resetTxError } = await (supabase as any)
        .from("group_stock_transactions")
        .update({
          settlement_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("settlement_id", settlementId);

      if (resetTxError) {
        console.error("Error resetting group stock transactions:", resetTxError);
        // Don't throw - this might not exist for batch-based settlements
      }

      // Delete settlement items
      const { error: itemsError } = await (supabase as any)
        .from("inter_site_settlement_items")
        .delete()
        .eq("settlement_id", settlementId);

      if (itemsError) throw itemsError;

      // Delete settlement payments
      const { error: paymentsError } = await (supabase as any)
        .from("inter_site_settlement_payments")
        .delete()
        .eq("settlement_id", settlementId);

      if (paymentsError) {
        console.warn("Error deleting settlement payments:", paymentsError);
        // Don't throw - payments might not exist
      }

      // Delete settlement expense allocations
      const { error: allocationsError } = await (supabase as any)
        .from("settlement_expense_allocations")
        .delete()
        .eq("settlement_id", settlementId);

      if (allocationsError) {
        console.warn("Error deleting settlement allocations:", allocationsError);
        // Don't throw - allocations might not exist
      }

      // Delete the settlement itself
      const { error } = await (supabase as any)
        .from("inter_site_material_settlements")
        .delete()
        .eq("id", settlementId);

      if (error) throw error;
      return settlement;
    },
    onSuccess: (settlement) => {
      // Invalidate all related settlement queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byGroup(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.from_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.to_site_id),
      });
    },
  });
}

/**
 * Record a payment against a settlement
 * This also creates a material expense for the debtor site when settlement is completed
 */
export function useRecordSettlementPayment() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: SettlementPaymentFormData & { userId?: string }) => {
      await ensureFreshSession();

      console.log("[RecordSettlementPayment] Starting payment recording for settlement:", data.settlement_id);

      // Get current settlement with related site info
      const { data: settlement, error: getError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select(`
          *,
          from_site:sites!inter_site_material_settlements_from_site_id_fkey(id, name),
          to_site:sites!inter_site_material_settlements_to_site_id_fkey(id, name)
        `)
        .eq("id", data.settlement_id)
        .single();

      if (getError) {
        console.error("[RecordSettlementPayment] Error fetching settlement:", getError);
        throw getError;
      }

      console.log("[RecordSettlementPayment] Settlement fetched:", {
        id: settlement.id,
        from_site_id: settlement.from_site_id,
        to_site_id: settlement.to_site_id,
        total_amount: settlement.total_amount,
        current_status: settlement.status
      });

      // Create payment record
      const { data: payment, error: paymentError } = await (supabase as any)
        .from("inter_site_settlement_payments")
        .insert({
          settlement_id: data.settlement_id,
          payment_date: data.payment_date,
          amount: data.amount,
          payment_mode: data.payment_mode,
          payment_source: data.payment_source || null,
          reference_number: data.reference_number || null,
          notes: data.notes || null,
          recorded_by: data.userId || null,
        })
        .select()
        .single();

      if (paymentError) {
        console.error("[RecordSettlementPayment] Error creating payment:", paymentError);
        throw paymentError;
      }

      console.log("[RecordSettlementPayment] Payment created:", payment.id);

      // Update settlement amounts
      const newPaidAmount = (settlement.paid_amount || 0) + data.amount;
      const newPendingAmount = settlement.total_amount - newPaidAmount;
      const newStatus = newPendingAmount <= 0 ? "settled" : settlement.status;

      console.log("[RecordSettlementPayment] Calculating new status:", {
        newPaidAmount,
        newPendingAmount,
        newStatus
      });

      // Note: pending_amount is a generated column (computed as total_amount - paid_amount)
      // So we only update paid_amount and status - pending_amount will be auto-calculated
      const updateData: Record<string, unknown> = {
        paid_amount: newPaidAmount,
        status: newStatus,
      };

      if (newStatus === "settled") {
        updateData.settled_by = data.userId || null;
        updateData.settled_at = new Date().toISOString();
      }

      console.log("[RecordSettlementPayment] Updating settlement with:", updateData);

      const { error: updateError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .update(updateData)
        .eq("id", data.settlement_id);

      if (updateError) {
        console.error("[RecordSettlementPayment] Error updating settlement:", updateError);
        throw updateError;
      }

      console.log("[RecordSettlementPayment] Settlement updated successfully");

      // If settlement is now complete, create material expense for debtor site and update batch_usage_records
      if (newStatus === "settled") {
        console.log("[RecordSettlementPayment] Settlement completed, creating material expense for debtor site");

        // Create material expense for the debtor site (from_site)
        // This expense represents the debtor's payment for materials used from group purchases
        try {
          // Generate a reference code for the expense
          let refCode: string;
          try {
            const { data: rpcRefCode } = await (supabase as any).rpc(
              "generate_material_purchase_reference"
            );
            refCode = rpcRefCode || `ISET-${Date.now()}`;
          } catch {
            refCode = `ISET-${Date.now()}`;
          }

          // Use the settlement code as the batch reference to link this expense to the settlement
          const settlementCode = settlement.settlement_code || `SET-${settlement.id.slice(0, 8)}`;

          // Map payment mode - material_purchase_expenses allows: cash, upi, bank_transfer, cheque, credit
          // inter_site_settlement_payments allows: cash, bank_transfer, upi, adjustment
          const validExpenseModes = ["cash", "upi", "bank_transfer", "cheque", "credit"];
          const expensePaymentMode = validExpenseModes.includes(data.payment_mode) ? data.payment_mode : "cash";

          // Build expense payload without created_by to avoid FK constraint issues
          // The FK constraint on created_by expects the user to be in public.users table
          // but auth.users IDs may not always sync to public.users
          // NOTE: to_site_id is the DEBTOR (site that used materials and needs to pay)
          // from_site_id is the CREDITOR (site that paid for the original purchase)
          const expensePayload: Record<string, unknown> = {
            site_id: settlement.to_site_id, // Debtor site - the site that used the materials
            ref_code: refCode,
            purchase_type: "own_site", // Still own_site as the debtor is paying for materials
            purchase_date: data.payment_date,
            total_amount: settlement.total_amount,
            transport_cost: 0,
            status: "completed",
            is_paid: true,
            paid_date: data.payment_date,
            payment_mode: expensePaymentMode,
            payment_reference: data.reference_number || null,
            // Set original_batch_code and settlement_reference to make it appear as "allocated" type
            // in Material Expenses page (From Group category)
            original_batch_code: settlementCode,
            settlement_reference: settlementCode,
            // Additional settlement tracking fields
            settlement_date: data.payment_date,
            settlement_payer_source: "own", // The debtor site is paying
            site_group_id: settlement.site_group_id,
            notes: `Inter-site settlement payment from ${settlement.to_site?.name || 'debtor site'} to ${settlement.from_site?.name || 'creditor site'} for materials used. Settlement: ${settlementCode}`,
          };

          console.log("[RecordSettlementPayment] Creating expense for debtor site:", {
            site_id: expensePayload.site_id,
            ref_code: expensePayload.ref_code,
            total_amount: expensePayload.total_amount,
            original_batch_code: expensePayload.original_batch_code,
            settlement_reference: expensePayload.settlement_reference,
          });

          const { data: expense, error: expenseError } = await (supabase as any)
            .from("material_purchase_expenses")
            .insert(expensePayload)
            .select()
            .single();

          if (expenseError) {
            console.error("[RecordSettlementPayment] Error creating material expense:", expenseError);
            // Log detailed error info for debugging
            console.error("[RecordSettlementPayment] Expense payload was:", JSON.stringify(expensePayload, null, 2));
            // Don't throw - payment was already recorded successfully
          } else {
            console.log("[RecordSettlementPayment] Material expense created successfully:", expense?.id, expense?.ref_code);

            // Fetch settlement items and create expense items for material details
            try {
              const { data: settlementItems, error: itemsError } = await (supabase as any)
                .from("inter_site_settlement_items")
                .select("material_id, brand_id, quantity_used, unit_cost, notes")
                .eq("settlement_id", data.settlement_id);

              if (itemsError) {
                console.warn("[RecordSettlementPayment] Could not fetch settlement items:", itemsError.message);
              } else if (settlementItems && settlementItems.length > 0) {
                // Create material_purchase_expense_items from settlement items
                const expenseItems = settlementItems.map((item: any) => ({
                  purchase_expense_id: expense.id,
                  material_id: item.material_id,
                  brand_id: item.brand_id || null,
                  quantity: Number(item.quantity_used || 0),
                  unit_price: Number(item.unit_cost || 0),
                  notes: item.notes || `From settlement ${settlementCode}`,
                }));

                const { error: expenseItemsError } = await (supabase as any)
                  .from("material_purchase_expense_items")
                  .insert(expenseItems);

                if (expenseItemsError) {
                  console.warn("[RecordSettlementPayment] Could not create expense items:", expenseItemsError.message);
                } else {
                  console.log("[RecordSettlementPayment] Created", expenseItems.length, "expense items");
                }
              }
            } catch (itemErr) {
              console.warn("[RecordSettlementPayment] Non-critical: Failed to create expense items:", itemErr);
            }
          }
        } catch (err) {
          console.error("[RecordSettlementPayment] Failed to create material expense:", err);
          // Don't throw - payment was already recorded successfully
        }

        // Update batch_usage_records to 'settled'
        try {
          const { error: batchUpdateError } = await (supabase as any)
            .from("batch_usage_records")
            .update({
              settlement_status: 'settled',
            })
            .eq("settlement_id", data.settlement_id)
            .eq("settlement_status", 'in_settlement');

          if (batchUpdateError) {
            console.warn("[RecordSettlementPayment] Non-critical: Error updating batch_usage_records:", batchUpdateError);
          } else {
            console.log("[RecordSettlementPayment] batch_usage_records updated to settled");
          }
        } catch (err) {
          console.warn("[RecordSettlementPayment] Non-critical: Failed to update batch_usage_records:", err);
        }

        // NOTE: Self-use expense creation is intentionally NOT done here.
        // Self-use expenses for the creditor site should only be created when the batch
        // is explicitly completed (via the "Complete" button or process_batch_settlement RPC).
        // Creating self-use expenses prematurely during settlement payment can cause
        // orphaned records if the batch still has remaining materials that haven't been used yet.
      }

      console.log("[RecordSettlementPayment] Payment recording completed successfully");
      // Return both payment and settlement for proper cache invalidation
      return { payment, settlement, newStatus };
    },
    onSuccess: (result) => {
      const { settlement, newStatus } = result;

      // Invalidate settlement-specific queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byId(settlement.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });

      // Invalidate site-specific queries
      if (settlement.from_site_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.bySite(settlement.from_site_id),
        });
      }
      if (settlement.to_site_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.bySite(settlement.to_site_id),
        });
      }

      // Invalidate group-specific queries
      if (settlement.site_group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.byGroup(settlement.site_group_id),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.interSiteSettlements.balances(settlement.site_group_id),
        });
      }

      // Also invalidate batch usage queries to reflect the updated status
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });

      // Invalidate material purchases to show the new expense (if settlement completed)
      if (newStatus === "settled") {
        queryClient.invalidateQueries({
          queryKey: queryKeys.materialPurchases.all,
        });
        // Invalidate for creditor site (from_site) - refresh batch data
        if (settlement.from_site_id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.materialPurchases.bySite(settlement.from_site_id),
          });
        }
        // Invalidate for debtor site (to_site) - for allocated expense
        if (settlement.to_site_id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.materialPurchases.bySite(settlement.to_site_id),
          });
        }
        // Invalidate expenses queries to refresh All Site Expenses page
        queryClient.invalidateQueries({
          queryKey: queryKeys.expenses.all,
        });
        if (settlement.from_site_id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.expenses.bySite(settlement.from_site_id),
          });
        }
        if (settlement.to_site_id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.expenses.bySite(settlement.to_site_id),
          });
        }
      }

      // Invalidate group stock queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.all,
      });
    },
  });
}

/**
 * Cancel a settlement
 */
export function useCancelSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      settlementId: string;
      reason: string;
      userId?: string;
    }) => {
      await ensureFreshSession();

      // Get settlement to get transaction IDs
      const { data: items, error: itemsError } = await (supabase as any)
        .from("inter_site_settlement_items")
        .select("transaction_id")
        .eq("settlement_id", data.settlementId);

      if (itemsError) throw itemsError;

      // Unmark transactions
      if (items && items.length > 0) {
        const txIds = items
          .map((i: { transaction_id: string | null }) => i.transaction_id)
          .filter(Boolean);

        if (txIds.length > 0) {
          await (supabase as any)
            .from("group_stock_transactions")
            .update({ settlement_id: null })
            .in("id", txIds);
        }
      }

      // Update settlement status
      const { data: settlement, error } = await (supabase as any)
        .from("inter_site_material_settlements")
        .update({
          status: "cancelled",
          cancelled_by: data.userId || null,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: data.reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.settlementId)
        .select()
        .single();

      if (error) throw error;
      return settlement as InterSiteSettlement;
    },
    onSuccess: (settlement) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byGroup(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(settlement.site_group_id),
      });
      // Invalidate stock inventory and low stock alerts (prevents stale summary cards)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
    },
  });
}

/**
 * Cancel a completed settlement - moves it back to pending status
 * Deletes all payment records as per user preference
 */
export function useCancelCompletedSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      settlementId: string;
      reason?: string;
      userId?: string;
    }) => {
      await ensureFreshSession();

      // Get settlement details
      const { data: settlement, error: getError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select("*")
        .eq("id", data.settlementId)
        .single();

      if (getError) throw getError;

      if (settlement.status !== 'settled' && settlement.status !== 'completed') {
        throw new Error("Can only cancel settlements that are completed/settled");
      }

      // Delete payment records
      const { error: paymentsError } = await (supabase as any)
        .from("inter_site_settlement_payments")
        .delete()
        .eq("settlement_id", data.settlementId);

      if (paymentsError) {
        console.error("Error deleting payment records:", paymentsError);
        // Continue anyway - might not have payments
      }

      // Delete allocated expense records from material_purchase_expenses
      // These are created when settlement is completed and linked via settlement_reference
      if (settlement.settlement_code) {
        // First get the IDs of expenses to delete (for cascading items)
        const { data: expensesToDelete } = await (supabase as any)
          .from("material_purchase_expenses")
          .select("id")
          .eq("settlement_reference", settlement.settlement_code);

        if (expensesToDelete && expensesToDelete.length > 0) {
          const expenseIds = expensesToDelete.map((e: any) => e.id);

          // Delete the expense items first (if not cascading)
          const { error: itemsError } = await (supabase as any)
            .from("material_purchase_expense_items")
            .delete()
            .in("purchase_expense_id", expenseIds);

          if (itemsError) {
            console.error("Error deleting allocated expense items:", itemsError);
          }

          // Delete the expenses
          const { error: expenseError } = await (supabase as any)
            .from("material_purchase_expenses")
            .delete()
            .eq("settlement_reference", settlement.settlement_code);

          if (expenseError) {
            console.error("Error deleting allocated expenses:", expenseError);
          }
        }
      }

      // Reset settlement to pending status
      const { data: updated, error: updateError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .update({
          status: "pending",
          paid_amount: 0,
          settled_at: null,
          settled_by: null,
          cancellation_reason: data.reason || "Cancelled from completed state",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.settlementId)
        .select()
        .single();

      if (updateError) throw updateError;
      return updated as InterSiteSettlement;
    },
    onSuccess: (settlement) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byId(settlement.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.from_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.to_site_id),
      });
      // Invalidate material purchases to refresh site-level expenses
      queryClient.invalidateQueries({
        queryKey: ["material-purchases"],
      });
      // Invalidate stock inventory and low stock alerts (prevents stale summary cards)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
    },
  });
}

/**
 * Cancel a pending settlement - moves usage records back to unsettled
 * Deletes settlement items and the settlement itself
 */
export function useCancelPendingSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      settlementId: string;
      reason?: string;
      userId?: string;
    }) => {
      await ensureFreshSession();

      // Get settlement details
      const { data: settlement, error: getError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .select("*")
        .eq("id", data.settlementId)
        .single();

      if (getError) throw getError;

      if (settlement.status !== 'pending' && settlement.status !== 'approved') {
        throw new Error("Can only cancel settlements that are pending");
      }

      // Reset batch_usage_records back to pending state
      const { error: resetBatchError } = await (supabase as any)
        .from("batch_usage_records")
        .update({
          settlement_id: null,
          settlement_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq("settlement_id", data.settlementId);

      if (resetBatchError) {
        console.error("Error resetting batch usage records:", resetBatchError);
      }

      // Reset group_stock_transactions
      const { error: resetTxError } = await (supabase as any)
        .from("group_stock_transactions")
        .update({
          settlement_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("settlement_id", data.settlementId);

      if (resetTxError) {
        console.error("Error resetting group stock transactions:", resetTxError);
      }

      // Delete payment records if any
      await (supabase as any)
        .from("inter_site_settlement_payments")
        .delete()
        .eq("settlement_id", data.settlementId);

      // Delete allocated expense records from material_purchase_expenses
      // These may exist if settlement was previously completed then cancelled
      if (settlement.settlement_code) {
        const { data: expensesToDelete } = await (supabase as any)
          .from("material_purchase_expenses")
          .select("id")
          .eq("settlement_reference", settlement.settlement_code);

        if (expensesToDelete && expensesToDelete.length > 0) {
          const expenseIds = expensesToDelete.map((e: any) => e.id);

          // Delete the expense items first
          await (supabase as any)
            .from("material_purchase_expense_items")
            .delete()
            .in("purchase_expense_id", expenseIds);

          // Delete the expenses
          await (supabase as any)
            .from("material_purchase_expenses")
            .delete()
            .eq("settlement_reference", settlement.settlement_code);
        }
      }

      // Delete settlement items
      const { error: itemsError } = await (supabase as any)
        .from("inter_site_settlement_items")
        .delete()
        .eq("settlement_id", data.settlementId);

      if (itemsError) {
        console.error("Error deleting settlement items:", itemsError);
      }

      // Delete the settlement
      const { error: deleteError } = await (supabase as any)
        .from("inter_site_material_settlements")
        .delete()
        .eq("id", data.settlementId);

      if (deleteError) throw deleteError;

      return settlement;
    },
    onSuccess: (settlement) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.byGroup(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(settlement.site_group_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.from_site_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.bySite(settlement.to_site_id),
      });
      // Invalidate material purchases to refresh site-level expenses
      queryClient.invalidateQueries({
        queryKey: ["material-purchases"],
      });
      // Invalidate stock inventory and low stock alerts (prevents stale summary cards)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialStock.all,
      });
    },
  });
}

/**
 * Delete unsettled usage records between two sites
 * Completely removes the usage records and restores inventory
 */
export function useDeleteUnsettledUsage() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      groupId: string;
      creditorSiteId: string;
      debtorSiteId: string;
    }) => {
      await ensureFreshSession();

      // Find all pending batch_usage_records for this site pair
      const { data: usageRecords, error: fetchError } = await (supabase as any)
        .from("batch_usage_records")
        .select(`
          *,
          batch:material_purchase_expenses!batch_usage_records_batch_ref_code_fkey(
            paying_site_id,
            site_id
          )
        `)
        .eq("site_group_id", data.groupId)
        .eq("usage_site_id", data.debtorSiteId)
        .eq("settlement_status", "pending");

      if (fetchError) throw fetchError;

      // Filter to only records where creditor matches
      const matchingRecords = (usageRecords || []).filter((record: any) => {
        const payingSiteId = record.batch?.paying_site_id || record.batch?.site_id;
        return payingSiteId === data.creditorSiteId;
      });

      if (matchingRecords.length === 0) {
        throw new Error("No unsettled usage records found for this site pair");
      }

      // Collect transaction IDs for later deletion
      const transactionIds: string[] = [];

      // For each usage record, restore inventory
      for (const record of matchingRecords) {
        if (record.group_stock_transaction_id) {
          transactionIds.push(record.group_stock_transaction_id);

          // Get the transaction to find inventory_id
          const { data: tx } = await (supabase as any)
            .from("group_stock_transactions")
            .select("inventory_id, quantity")
            .eq("id", record.group_stock_transaction_id)
            .single();

          if (tx?.inventory_id) {
            // Restore the quantity to inventory
            const { data: inventory } = await (supabase as any)
              .from("group_stock_inventory")
              .select("current_qty")
              .eq("id", tx.inventory_id)
              .single();

            if (inventory) {
              await (supabase as any)
                .from("group_stock_inventory")
                .update({
                  current_qty: inventory.current_qty + Math.abs(tx.quantity),
                })
                .eq("id", tx.inventory_id);
            }
          }
        }
      }

      // Delete batch_usage_records FIRST (they reference group_stock_transactions)
      const recordIds = matchingRecords.map((r: { id: string }) => r.id);
      if (recordIds.length > 0) {
        const { error: deleteUsageError } = await (supabase as any)
          .from("batch_usage_records")
          .delete()
          .in("id", recordIds);

        if (deleteUsageError) {
          console.error("Error deleting batch_usage_records:", deleteUsageError);
          throw deleteUsageError;
        }
      }

      // Delete group_stock_transactions AFTER (now safe to delete)
      if (transactionIds.length > 0) {
        const { error: deleteTxError } = await (supabase as any)
          .from("group_stock_transactions")
          .delete()
          .in("id", transactionIds);

        if (deleteTxError) {
          console.error("Error deleting group_stock_transactions:", deleteTxError);
          // Don't throw - batch records already deleted
        }
      }

      return { deletedCount: matchingRecords.length };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.balances(variables.groupId),
      });
      // Invalidate ALL inter-site settlement queries (including summary) to ensure UI is in sync
      queryClient.invalidateQueries({
        queryKey: queryKeys.interSiteSettlements.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.byGroup(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupStock.transactions(variables.groupId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.batchUsage.all,
      });
    },
  });
}

// ============================================
// GROUP STOCK TRANSACTIONS
// ============================================

export interface GroupStockTransaction {
  id: string;
  site_group_id: string;
  inventory_id: string;
  material_id: string;
  brand_id: string | null;
  transaction_type: "purchase" | "usage" | "transfer" | "adjustment";
  quantity: number;
  unit_cost: number;
  total_cost: number;
  transaction_date: string;
  payment_source_site_id: string | null;
  usage_site_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  batch_ref_code: string | null;
  notes: string | null;
  recorded_by: string | null;
  settlement_id: string | null;
  created_at: string;
  // Joined data
  material?: { id: string; name: string; code: string; unit: string };
  brand?: { id: string; brand_name: string };
  payment_source_site?: { id: string; name: string };
  usage_site?: { id: string; name: string };
}

/**
 * Fetch all group stock transactions for a site group
 * Includes both purchases and usage transactions
 */
export function useGroupStockTransactions(
  groupId: string | undefined,
  options?: {
    transactionType?: "purchase" | "usage" | "transfer" | "adjustment";
    limit?: number;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: groupId
      ? [...queryKeys.interSiteSettlements.balances(groupId), "transactions", options?.transactionType]
      : ["group-stock-transactions"],
    queryFn: async () => {
      if (!groupId) return [] as GroupStockTransaction[];

      try {
        let query = (supabase as any)
          .from("group_stock_transactions")
          .select(`
            *,
            material:materials(id, name, code, unit),
            brand:material_brands(id, brand_name),
            payment_source_site:sites!group_stock_transactions_payment_source_site_id_fkey(id, name),
            usage_site:sites!group_stock_transactions_usage_site_id_fkey(id, name)
          `)
          .eq("site_group_id", groupId)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (options?.transactionType) {
          query = query.eq("transaction_type", options.transactionType);
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
          if (isQueryError(error)) {
            console.warn("Group stock transactions query failed:", error.message);
            return [] as GroupStockTransaction[];
          }
          throw error;
        }

        return (data || []) as GroupStockTransaction[];
      } catch (err) {
        if (isQueryError(err)) {
          console.warn("Group stock transactions query failed:", err);
          return [] as GroupStockTransaction[];
        }
        throw err;
      }
    },
    enabled: !!groupId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================
// NET SETTLEMENT (NETTING / OFFSET)
// ============================================

/**
 * Net settle reciprocal debts between two sites.
 * When Site A owes Site B and Site B owes Site A simultaneously,
 * offset the smaller amount from the larger. The smaller debt gets
 * fully settled, the larger has only the net remainder left.
 *
 * Uses the existing `adjustment` payment mode for the offset.
 */
export function useNetSettlement() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: {
      siteGroupId: string;
      balanceA: InterSiteBalance; // One direction
      balanceB: InterSiteBalance; // Reverse direction
      userId?: string;
      /** Payment details for the net remaining amount (fully settles both directions) */
      paymentDetails?: {
        amount: number;
        payment_mode: string;
        payment_source?: string;
        payment_date: string;
        reference_number?: string;
        notes?: string;
        proof_url?: string;
        subcontract_id?: string;
      };
    }) => {
      await ensureFreshSession();

      const { balanceA, balanceB, siteGroupId } = data;
      const now = new Date();
      const year = now.getFullYear();
      const weekNumber = getWeekNumber(now);
      const today = now.toISOString().split("T")[0];

      // Step 1: Calculate netting
      const amountA = balanceA.total_amount_owed;
      const amountB = balanceB.total_amount_owed;
      const offsetAmount = Math.min(amountA, amountB);
      const netRemaining = Math.round((Math.abs(amountA - amountB)) * 100) / 100;

      console.log("[NetSettlement] Starting netting:", {
        directionA: `${balanceA.debtor_site_name} → ${balanceA.creditor_site_name}: ${amountA}`,
        directionB: `${balanceB.debtor_site_name} → ${balanceB.creditor_site_name}: ${amountB}`,
        offsetAmount,
        netRemaining,
      });

      // Helper: generate a settlement for one direction (same logic as useGenerateSettlement)
      async function generateForDirection(balance: InterSiteBalance) {
        // Get unsettled batch_usage_records
        const { data: batchRecords, error: batchError } = await (supabase as any)
          .from("batch_usage_records")
          .select(`
            *,
            batch:material_purchase_expenses!batch_usage_records_batch_ref_code_fkey(
              paying_site_id,
              site_id
            )
          `)
          .eq("site_group_id", siteGroupId)
          .eq("usage_site_id", balance.debtor_site_id)
          .eq("settlement_status", "pending")
          .eq("is_self_use", false);

        if (batchError) throw batchError;

        const matchingRecords = (batchRecords || []).filter((record: any) => {
          const payingSiteId = record.batch?.paying_site_id || record.batch?.site_id;
          return payingSiteId === balance.creditor_site_id;
        });

        if (matchingRecords.length === 0) {
          throw new Error(`No unsettled transactions found for ${balance.debtor_site_name} → ${balance.creditor_site_name}`);
        }

        // Get group_stock_transactions
        const txIds = matchingRecords.map((r: any) => r.group_stock_transaction_id).filter(Boolean);
        let transactions: any[] = [];
        if (txIds.length > 0) {
          const { data: txData } = await (supabase as any)
            .from("group_stock_transactions")
            .select("*")
            .in("id", txIds);
          transactions = txData || [];
        }

        const totalAmount = matchingRecords.reduce(
          (sum: number, r: { total_cost: number }) => sum + Math.abs(r.total_cost || 0), 0
        );

        const batchRefCode = matchingRecords[0]?.batch_ref_code || null;

        // Check for existing pending settlement for this week/direction
        const { data: existingSettlements } = await (supabase as any)
          .from("inter_site_material_settlements")
          .select("*")
          .eq("site_group_id", siteGroupId)
          .eq("from_site_id", balance.creditor_site_id)
          .eq("to_site_id", balance.debtor_site_id)
          .eq("year", year)
          .eq("week_number", weekNumber)
          .in("status", ["draft", "pending"])
          .order("created_at", { ascending: false })
          .limit(1);

        const existing = existingSettlements?.[0] || null;
        let settlement: any;

        if (existing) {
          const newTotal = (existing.total_amount || 0) + totalAmount;
          const { data: updated, error: updateError } = await (supabase as any)
            .from("inter_site_material_settlements")
            .update({ total_amount: newTotal, updated_at: now.toISOString() })
            .eq("id", existing.id)
            .select()
            .single();
          if (updateError) throw updateError;
          settlement = updated;
        } else {
          const timestamp = Date.now().toString(36);
          const code = `SET-${year}-W${weekNumber}-${timestamp}-${generateShortId()}`;
          const { data: created, error: createError } = await (supabase as any)
            .from("inter_site_material_settlements")
            .insert({
              settlement_code: code,
              site_group_id: siteGroupId,
              from_site_id: balance.creditor_site_id,
              to_site_id: balance.debtor_site_id,
              batch_ref_code: batchRefCode,
              year,
              week_number: weekNumber,
              period_start: weekStartStr(new Date(year, 0, 1 + (weekNumber - 1) * 7)),
              period_end: weekEndStr(new Date(year, 0, 1 + (weekNumber - 1) * 7)),
              total_amount: totalAmount,
              paid_amount: 0,
              status: "pending",
              created_by: data.userId || null,
            })
            .select()
            .single();
          if (createError) throw createError;
          settlement = created;
        }

        // Create settlement items
        const txMap = new Map(transactions.map((tx: any) => [tx.id, tx]));
        const items = matchingRecords.map((record: any) => ({
          settlement_id: settlement.id,
          material_id: record.material_id,
          brand_id: record.brand_id,
          quantity_used: Math.abs(record.quantity),
          unit: "nos",
          unit_cost: record.unit_cost || 0,
          total_cost: Math.abs(record.total_cost || 0),
          transaction_id: record.group_stock_transaction_id,
          usage_date: record.usage_date,
        }));

        await (supabase as any).from("inter_site_settlement_items").insert(items);

        // Mark group_stock_transactions
        if (txIds.length > 0) {
          await (supabase as any)
            .from("group_stock_transactions")
            .update({ settlement_id: settlement.id })
            .in("id", txIds);
        }

        // Mark batch_usage_records as in_settlement
        const batchRecordIds = matchingRecords.map((r: { id: string }) => r.id);
        await (supabase as any)
          .from("batch_usage_records")
          .update({ settlement_id: settlement.id, settlement_status: "in_settlement" })
          .in("id", batchRecordIds);

        return settlement;
      }

      // Helper: complete a settled settlement (create expense, mark records)
      async function completeSettlement(settlement: any, paymentInfo?: { payment_mode: string; payment_date?: string; reference_number?: string }) {
        // Fetch settlement with site info
        const { data: fullSettlement } = await (supabase as any)
          .from("inter_site_material_settlements")
          .select(`
            *,
            from_site:sites!inter_site_material_settlements_from_site_id_fkey(id, name),
            to_site:sites!inter_site_material_settlements_to_site_id_fkey(id, name)
          `)
          .eq("id", settlement.id)
          .single();

        if (!fullSettlement) return;

        const settlementCode = fullSettlement.settlement_code || `SET-${fullSettlement.id.slice(0, 8)}`;

        // Generate ref code
        let refCode: string;
        try {
          const { data: rpcRefCode } = await (supabase as any).rpc("generate_material_purchase_reference");
          refCode = rpcRefCode || `ISET-${Date.now()}`;
        } catch {
          refCode = `ISET-${Date.now()}`;
        }

        // Create material expense for debtor site
        const { data: expense, error: expError } = await (supabase as any)
          .from("material_purchase_expenses")
          .insert({
            site_id: fullSettlement.to_site_id,
            ref_code: refCode,
            purchase_type: "own_site",
            purchase_date: today,
            total_amount: fullSettlement.total_amount,
            transport_cost: 0,
            status: "completed",
            is_paid: true,
            paid_date: today,
            payment_mode: paymentInfo?.payment_mode || "adjustment",
            original_batch_code: settlementCode,
            settlement_reference: settlementCode,
            settlement_date: paymentInfo?.payment_date || today,
            settlement_payer_source: "own",
            site_group_id: fullSettlement.site_group_id,
            notes: `Net settlement${paymentInfo ? " with payment" : " offset"}. ${fullSettlement.to_site?.name || "debtor"} to ${fullSettlement.from_site?.name || "creditor"}. Settlement: ${settlementCode}`,
          })
          .select()
          .single();

        if (expError) {
          console.warn("[NetSettlement] Non-critical: Failed to create expense:", expError);
        } else if (expense) {
          // Create expense items from settlement items
          const { data: settlementItems } = await (supabase as any)
            .from("inter_site_settlement_items")
            .select("material_id, brand_id, quantity_used, unit_cost, notes")
            .eq("settlement_id", settlement.id);

          if (settlementItems?.length > 0) {
            await (supabase as any)
              .from("material_purchase_expense_items")
              .insert(
                settlementItems.map((item: any) => ({
                  purchase_expense_id: expense.id,
                  material_id: item.material_id,
                  brand_id: item.brand_id || null,
                  quantity: Number(item.quantity_used || 0),
                  unit_price: Number(item.unit_cost || 0),
                  notes: item.notes || `From net settlement ${settlementCode}`,
                }))
              );
          }
        }

        // Mark batch_usage_records as settled
        await (supabase as any)
          .from("batch_usage_records")
          .update({ settlement_status: "settled" })
          .eq("settlement_id", settlement.id)
          .eq("settlement_status", "in_settlement");
      }

      // Step 2: Generate both settlements
      let settlementA: any;
      let settlementB: any;

      try {
        settlementA = await generateForDirection(balanceA);
        console.log("[NetSettlement] Generated settlement A:", settlementA.id, settlementA.settlement_code);
      } catch (err) {
        console.error("[NetSettlement] Failed to generate settlement A:", err);
        throw err;
      }

      try {
        settlementB = await generateForDirection(balanceB);
        console.log("[NetSettlement] Generated settlement B:", settlementB.id, settlementB.settlement_code);
      } catch (err) {
        console.error("[NetSettlement] Failed to generate settlement B, cleaning up A:", err);
        // Cleanup: reset A's batch records and delete settlement A
        await (supabase as any)
          .from("batch_usage_records")
          .update({ settlement_id: null, settlement_status: "pending" })
          .eq("settlement_id", settlementA.id);
        await (supabase as any).from("inter_site_settlement_items").delete().eq("settlement_id", settlementA.id);
        await (supabase as any).from("inter_site_material_settlements").delete().eq("id", settlementA.id);
        throw err;
      }

      // Step 3: Determine which is smaller/larger
      const aIsSmaller = settlementA.total_amount <= settlementB.total_amount;
      const smallerSettlement = aIsSmaller ? settlementA : settlementB;
      const largerSettlement = aIsSmaller ? settlementB : settlementA;

      // Step 4: Record adjustment payments on both
      try {
        // Payment on smaller settlement (will fully settle it)
        await (supabase as any)
          .from("inter_site_settlement_payments")
          .insert({
            settlement_id: smallerSettlement.id,
            payment_date: today,
            amount: offsetAmount,
            payment_mode: "adjustment",
            reference_number: `NET-${largerSettlement.settlement_code}`,
            notes: `Net settlement offset against ${largerSettlement.settlement_code}. Offset ${formatCurrencySimple(offsetAmount)} from reciprocal debt.`,
            recorded_by: data.userId || null,
          });

        // Payment on larger settlement (partial)
        await (supabase as any)
          .from("inter_site_settlement_payments")
          .insert({
            settlement_id: largerSettlement.id,
            payment_date: today,
            amount: offsetAmount,
            payment_mode: "adjustment",
            reference_number: `NET-${smallerSettlement.settlement_code}`,
            notes: `Net settlement offset against ${smallerSettlement.settlement_code}. Offset ${formatCurrencySimple(offsetAmount)} from reciprocal debt.`,
            recorded_by: data.userId || null,
          });

        // Step 5: Update settlement statuses
        // Smaller: fully settled
        await (supabase as any)
          .from("inter_site_material_settlements")
          .update({
            paid_amount: smallerSettlement.total_amount,
            status: "settled",
            settled_by: data.userId || null,
            settled_at: now.toISOString(),
          })
          .eq("id", smallerSettlement.id);

        // Larger: partially paid
        await (supabase as any)
          .from("inter_site_material_settlements")
          .update({
            paid_amount: offsetAmount,
          })
          .eq("id", largerSettlement.id);

        // Step 6: Complete the smaller settlement (create expense, mark batch records)
        await completeSettlement(smallerSettlement);

        // If both amounts are equal, also complete the larger one
        if (netRemaining === 0) {
          await (supabase as any)
            .from("inter_site_material_settlements")
            .update({
              paid_amount: largerSettlement.total_amount,
              status: "settled",
              settled_by: data.userId || null,
              settled_at: now.toISOString(),
            })
            .eq("id", largerSettlement.id);
          await completeSettlement(largerSettlement);
        }

        // Step 7: If payment details provided, fully settle the larger settlement too
        if (data.paymentDetails && netRemaining > 0) {
          const pd = data.paymentDetails;
          console.log("[NetSettlement] Recording payment for net remaining:", pd.amount);

          // Record the real payment for the net remaining amount
          await (supabase as any)
            .from("inter_site_settlement_payments")
            .insert({
              settlement_id: largerSettlement.id,
              payment_date: pd.payment_date,
              amount: netRemaining,
              payment_mode: pd.payment_mode,
              payment_source: pd.payment_source || null,
              reference_number: pd.reference_number || null,
              notes: pd.notes || null,
              recorded_by: data.userId || null,
            });

          // Update larger settlement to fully settled
          await (supabase as any)
            .from("inter_site_material_settlements")
            .update({
              paid_amount: largerSettlement.total_amount,
              status: "settled",
              settled_by: data.userId || null,
              settled_at: now.toISOString(),
            })
            .eq("id", largerSettlement.id);

          // Complete the larger settlement (create expense, mark batch records as settled)
          await completeSettlement(largerSettlement, {
            payment_mode: pd.payment_mode,
            payment_date: pd.payment_date,
            reference_number: pd.reference_number,
          });

          console.log("[NetSettlement] Larger settlement fully settled with payment:", largerSettlement.settlement_code);
        }

        console.log("[NetSettlement] Netting complete:", {
          smallerSettled: smallerSettlement.settlement_code,
          largerStatus: netRemaining > 0
            ? (data.paymentDetails ? `${largerSettlement.settlement_code} (fully settled with payment)` : `${largerSettlement.settlement_code} (${netRemaining} remaining)`)
            : "also settled (equal amounts)",
        });

        return {
          settlementA,
          settlementB,
          smallerSettlement,
          largerSettlement,
          offsetAmount,
          netRemaining,
          siteGroupId,
        };
      } catch (err) {
        console.error("[NetSettlement] Payment/completion step failed:", err);
        throw err;
      }
    },
    onSuccess: (result) => {
      const { siteGroupId, settlementA, settlementB } = result;

      // Comprehensive cache invalidation
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.byGroup(siteGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.balances(siteGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.bySite(settlementA.from_site_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.bySite(settlementA.to_site_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.bySite(settlementB.from_site_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.interSiteSettlements.bySite(settlementB.to_site_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchUsage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groupStock.all });
    },
  });
}

function formatCurrencySimple(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
