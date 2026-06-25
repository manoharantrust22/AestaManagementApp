"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
  Chip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Info as InfoIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/cache/keys";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import type { Database } from "@/types/database.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];
type TeaShopEntry = Database["public"]["Tables"]["tea_shop_entries"]["Row"];

interface LaborGroupPercentageSplit {
  daily: number;
  contract: number;
  market: number;
}

interface TeaShopEntryExtended extends TeaShopEntry {
  // Add extended fields if needed
}
import SimpleEntryModeContent from "./SimpleEntryModeContent";
import GroupAllocationSection from "./GroupAllocationSection";
import { useDayUnitsForDate, useTeaShopForSite, useCreateEntryAllocations } from "@/hooks/queries/useCompanyTeaShops";
import { useSiteGroup } from "@/hooks/queries/useSiteGroups";
import { useLaborCategories } from "@/hooks/queries/useLaborCategories";
import { useTradePresentUnits } from "@/hooks/queries/useTradePresentUnits";
import { computeTeaSplitPreview } from "@/lib/tea/teaSplitPreview";
import dayjs from "dayjs";

interface TeaShopEntryDialogProps {
  open: boolean;
  onClose: () => void;
  shop: TeaShopAccount;
  entry?: TeaShopEntry | null;
  onSuccess?: () => void;
  initialDate?: string; // Optional: pre-set the date (YYYY-MM-DD format)
}

export default function TeaShopEntryDialog({
  open,
  onClose,
  shop,
  entry,
  onSuccess,
  initialDate,
}: TeaShopEntryDialogProps) {
  const { userProfile } = useAuth();
  const { selectedSite, sites } = useSite();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simple mode state
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [simpleTotalCost, setSimpleTotalCost] = useState(0);
  const [percentageSplit, setPercentageSplit] = useState<LaborGroupPercentageSplit>({
    daily: 40,
    contract: 35,
    market: 25,
  });
  const [notes, setNotes] = useState("");

  // Multi-site split state
  const [enableMultiSite, setEnableMultiSite] = useState(false);
  const [secondarySite, setSecondarySite] = useState<typeof selectedSite>(null);
  const [primarySitePercent, setPrimarySitePercent] = useState(50);
  const [secondarySitePercent, setSecondarySitePercent] = useState(50);

  // Group allocation state
  const [enableManualOverride, setEnableManualOverride] = useState(false);
  const [manualAllocations, setManualAllocations] = useState<{ siteId: string; percentage: number; amount: number }[]>([]);

  // Detect if site is in a group with company tea shop
  const siteGroupId = selectedSite?.site_group_id as string | undefined;
  const isInGroup = !!siteGroupId;
  const { data: siteGroup } = useSiteGroup(siteGroupId);
  const { data: companyTeaShop } = useTeaShopForSite(selectedSite?.id);

  // Get fallback sites from siteGroup for when the sites query fails
  const fallbackSites = useMemo(() => {
    if (!siteGroup?.sites) return undefined;
    return siteGroup.sites.map((s: any) => ({ id: s.id, name: s.name }));
  }, [siteGroup?.sites]);

  // Get day units data for allocation (only when in group)
  const { data: dayUnitsData, isLoading: loadingDayUnits } = useDayUnitsForDate(
    isInGroup ? siteGroupId : undefined,
    date,
    undefined, // totalAmount - not needed for allocation preview
    fallbackSites // Pass fallback sites in case sites query fails
  );

  // Mutation for creating entry allocations
  const createAllocations = useCreateEntryAllocations();

  // Show group allocation section when site is in a group and has a company tea shop
  const showGroupAllocation = !!(isInGroup && companyTeaShop);

  // Handler for site percentage change
  const handleSitePercentChange = (primary: number, secondary: number) => {
    setPrimarySitePercent(primary);
    setSecondarySitePercent(secondary);
  };

  // Calculate allocations based on day units (or equal split if no attendance data)
  const calculatedAllocations = useMemo(() => {
    // If we have day units data, use it
    if (dayUnitsData && dayUnitsData.length > 0) {
      const totalUnits = dayUnitsData.reduce((sum, s) => sum + s.totalUnits, 0);

      // If manual override is enabled, use manual allocations
      if (enableManualOverride && manualAllocations.length > 0) {
        return dayUnitsData.map(s => {
          const manual = manualAllocations.find(m => m.siteId === s.siteId);
          return {
            site_id: s.siteId,
            day_units_sum: s.totalUnits,
            worker_count: s.workerCount || 0,
            allocation_percentage: manual?.percentage || 0,
            allocated_amount: manual?.amount || 0,
            is_manual_override: true,
          };
        });
      }

      // FIXED: If no attendance data (all zeros), return ZERO allocations (not equal split)
      // Unfilled dates should show 0 tea allocation, not an equal split
      if (totalUnits === 0) {
        return dayUnitsData.map((s) => {
          return {
            site_id: s.siteId,
            day_units_sum: 0,
            worker_count: 0,
            allocation_percentage: 0,
            allocated_amount: 0,
            is_manual_override: false,
          };
        });
      }

      // Calculate based on day units
      let remaining = simpleTotalCost;
      return dayUnitsData.map((s, idx) => {
        const percentage = Math.round((s.totalUnits / totalUnits) * 100);
        const amount = idx === dayUnitsData.length - 1
          ? remaining
          : Math.round((s.totalUnits / totalUnits) * simpleTotalCost);
        remaining -= amount;
        return {
          site_id: s.siteId,
          day_units_sum: s.totalUnits,
          worker_count: s.workerCount || 0,
          allocation_percentage: percentage,
          allocated_amount: amount,
          is_manual_override: false,
        };
      });
    }

    // Fallback: if no dayUnitsData but we have fallbackSites, use equal split
    if (fallbackSites && fallbackSites.length > 0) {
      const numSites = fallbackSites.length;
      const equalPercent = Math.round(100 / numSites);
      let remainingAmount = simpleTotalCost;

      return fallbackSites.map((s, idx) => {
        const isLast = idx === numSites - 1;
        const amount = isLast ? remainingAmount : Math.round(simpleTotalCost / numSites);
        remainingAmount -= amount;
        return {
          site_id: s.id,
          day_units_sum: 0,
          worker_count: 0,
          allocation_percentage: isLast ? 100 - (equalPercent * (numSites - 1)) : equalPercent,
          allocated_amount: amount,
          is_manual_override: false,
        };
      });
    }

    return [];
  }, [dayUnitsData, fallbackSites, simpleTotalCost, enableManualOverride, manualAllocations]);

  // --- Per-trade split preview (display-only, no saved-amount change) ---
  const { data: categories = [] } = useLaborCategories(false);
  const teaTrades = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        teaMode: c.tea_mode,
        poolHost: c.tea_pool_host_category_id,
      })),
    [categories]
  );
  const defaultHost = useMemo(() => {
    const civil = categories.find((c) => c.name.toLowerCase() === "civil");
    return civil?.id ?? categories[0]?.id ?? "";
  }, [categories]);

  // Determine which site ids the current bill touches
  const previewSiteIds = useMemo(() => {
    const ids: string[] = [];
    if (shop.site_id) ids.push(shop.site_id);
    if (enableMultiSite && secondarySite?.id) ids.push(secondarySite.id);
    if (showGroupAllocation && siteGroup?.sites) {
      for (const s of siteGroup.sites as { id: string }[]) {
        if (!ids.includes(s.id)) ids.push(s.id);
      }
    }
    return ids;
  }, [shop.site_id, enableMultiSite, secondarySite, showGroupAllocation, siteGroup]);

  const { data: presentUnits = {} } = useTradePresentUnits(previewSiteIds, date);

  const primarySiteId = shop.site_id ?? "";
  const previewSites = useMemo(() => {
    if (showGroupAllocation && calculatedAllocations.length > 0) {
      // Group mode: use per-site allocated amounts
      return calculatedAllocations.map((a) => ({
        siteId: a.site_id as string,
        poolHost: null as string | null,
        amount: a.allocated_amount,
        unitsByTrade: (presentUnits as Record<string, Record<string, number>>)[a.site_id as string] ?? {},
      }));
    }
    if (enableMultiSite && secondarySite) {
      // Multi-site legacy split
      const primaryAmount = Math.round((primarySitePercent / 100) * simpleTotalCost);
      const secondaryAmount = Math.round((secondarySitePercent / 100) * simpleTotalCost);
      return [
        { siteId: primarySiteId, poolHost: null as string | null, amount: primaryAmount, unitsByTrade: presentUnits[primarySiteId] ?? {} },
        { siteId: secondarySite.id as string, poolHost: null as string | null, amount: secondaryAmount, unitsByTrade: presentUnits[secondarySite.id as string] ?? {} },
      ];
    }
    // Single-site (common case)
    return [
      { siteId: primarySiteId, poolHost: null as string | null, amount: simpleTotalCost, unitsByTrade: presentUnits[primarySiteId] ?? {} },
    ];
  }, [showGroupAllocation, calculatedAllocations, enableMultiSite, secondarySite, primarySitePercent, secondarySitePercent, simpleTotalCost, primarySiteId, presentUnits]);

  const splitPreview = useMemo(
    () =>
      defaultHost
        ? computeTeaSplitPreview({ defaultHost, trades: teaTrades, sites: previewSites })
        : [],
    [defaultHost, teaTrades, previewSites]
  );

  // Helper: resolve site name from available data
  const siteNameById = (siteId: string): string => {
    if (siteId === primarySiteId) return selectedSite?.name ?? siteId;
    if (enableMultiSite && secondarySite && siteId === secondarySite.id) return (secondarySite as any).name ?? siteId;
    if (showGroupAllocation && siteGroup?.sites) {
      const found = (siteGroup.sites as { id: string; name: string }[]).find((s) => s.id === siteId);
      if (found) return found.name;
    }
    return siteId;
  };
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      if (entry) {
        // Cast entry to extended type to access new fields
        const extEntry = entry as TeaShopEntryExtended;

        setDate(entry.date);
        setNotes(entry.notes || "");

        // Load simple mode fields
        setSimpleTotalCost(extEntry.simple_total_cost || entry.total_amount || 0);
        if (extEntry.percentage_split) {
          setPercentageSplit(extEntry.percentage_split as unknown as LaborGroupPercentageSplit);
        } else {
          setPercentageSplit({ daily: 40, contract: 35, market: 25 });
        }

        // Load multi-site split state
        if (extEntry.is_split_entry && extEntry.split_percentage) {
          setEnableMultiSite(true);
          setPrimarySitePercent(extEntry.split_percentage);
          setSecondarySitePercent(100 - extEntry.split_percentage);
        } else {
          setEnableMultiSite(false);
          setSecondarySite(null);
          setPrimarySitePercent(50);
          setSecondarySitePercent(50);
        }
      } else {
        // New entry - reset form
        setDate(initialDate || dayjs().format("YYYY-MM-DD"));
        setSimpleTotalCost(0);
        setPercentageSplit({ daily: 40, contract: 35, market: 25 });
        setNotes("");
        setEnableMultiSite(false);
        setSecondarySite(null);
        setPrimarySitePercent(50);
        setSecondarySitePercent(50);
        // Reset group allocation state
        setEnableManualOverride(false);
        setManualAllocations([]);
      }
      setError(null);
    }
  }, [open, entry, initialDate]);

  const handleSave = async () => {
    // Validate percentage sum (only for non-group mode or if labor split is used)
    if (!showGroupAllocation) {
      const percentSum = percentageSplit.daily + percentageSplit.contract + percentageSplit.market;
      if (percentSum !== 100) {
        setError(`Labor group percentages must sum to 100% (currently ${percentSum}%)`);
        return;
      }
    }

    if (simpleTotalCost <= 0) {
      setError("Please enter a total cost");
      return;
    }

    // Validate group allocation percentages if in manual override mode
    if (showGroupAllocation && enableManualOverride && calculatedAllocations.length > 0) {
      const totalPercentage = calculatedAllocations.reduce((sum, a) => sum + a.allocation_percentage, 0);
      if (totalPercentage !== 100) {
        setError(`Site allocation percentages must sum to 100% (currently ${totalPercentage}%)`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Calculate the amount for this site (after multi-site split)
      const thisSiteAmount = enableMultiSite && secondarySite
        ? Math.round((primarySitePercent / 100) * simpleTotalCost)
        : simpleTotalCost;

      // Calculate total day units for group entries
      const totalDayUnits = showGroupAllocation && dayUnitsData
        ? dayUnitsData.reduce((sum, s) => sum + s.totalUnits, 0)
        : null;

      const entryData: Record<string, unknown> = {
        tea_shop_id: shop.id,
        site_id: shop.site_id,
        date,
        amount: thisSiteAmount,
        total_amount: thisSiteAmount,
        entry_mode: "simple",
        simple_total_cost: simpleTotalCost,
        percentage_split: percentageSplit,
        is_split_entry: enableMultiSite && secondarySite ? true : false,
        split_percentage: enableMultiSite && secondarySite ? primarySitePercent : null,
        split_target_site_id: enableMultiSite && secondarySite ? secondarySite.id : null,
        // New group entry fields
        company_tea_shop_id: companyTeaShop?.id || null,
        is_group_entry: showGroupAllocation,
        site_group_id: showGroupAllocation ? siteGroupId : null,
        total_day_units: totalDayUnits,
        // Set default detailed fields to 0/null (no longer used)
        tea_rounds: 0,
        tea_rate_per_round: 0,
        tea_total: 0,
        snacks_items: null,
        snacks_total: 0,
        tea_people_count: 0,
        num_rounds: 0,
        num_people: 0,
        market_laborer_count: 0,
        market_laborer_tea_amount: 0,
        market_laborer_snacks_amount: 0,
        market_laborer_total: 0,
        nonworking_laborer_count: 0,
        nonworking_laborer_total: 0,
        working_laborer_count: 0,
        working_laborer_total: 0,
        trade_pool_host_category_id: null, // common pool; resolved to the company default host by the view
        notes: notes.trim() || null,
        entered_by: userProfile?.name || null,
        entered_by_user_id: userProfile?.id || null,
      };

      if (entry) {
        // Get site_group_id for waterfall recalculation
        const { data: currentEntry } = await (supabase
          .from("tea_shop_entries") as any)
          .select("site_group_id, site_id")
          .eq("id", entry.id)
          .single();

        let effectiveSiteGroupId = currentEntry?.site_group_id || siteGroupId;
        console.log("[TeaShopDialog] Checking waterfall. entry.site_group_id:", currentEntry?.site_group_id, "context.siteGroupId:", siteGroupId, "entry.site_id:", currentEntry?.site_id);

        // If no site_group_id but entry has site_id, look up the site's group
        if (!effectiveSiteGroupId && currentEntry?.site_id) {
          const { data: siteData } = await (supabase as any)
            .from("sites")
            .select("site_group_id")
            .eq("id", currentEntry.site_id)
            .single();

          effectiveSiteGroupId = siteData?.site_group_id;
          console.log("[TeaShopDialog] Looked up site group from site_id:", effectiveSiteGroupId);
        }

        // Update existing entry (payment status will be recalculated via waterfall)
        const updateData = {
          ...entryData,
          updated_by: userProfile?.name || null,
          updated_by_user_id: userProfile?.id || null,
        };

        const { error: updateError } = await (supabase
          .from("tea_shop_entries") as any)
          .update(updateData)
          .eq("id", entry.id);

        if (updateError) throw updateError;

        // Delete existing consumption details (no longer used)
        await (supabase
          .from("tea_shop_consumption_details") as any)
          .delete()
          .eq("entry_id", entry.id);

        // Update allocations if group entry
        if (showGroupAllocation && calculatedAllocations.length > 0) {
          await createAllocations.mutateAsync({
            entryId: entry.id,
            allocations: calculatedAllocations,
          });
        }

        // Full waterfall recalculation from oldest to newest
        // This ensures correct payment allocation regardless of which entry was modified
        if (effectiveSiteGroupId) {
          setLoadingMessage("Recalculating payment status...");
          console.log("[TeaShopDialog] Triggering waterfall recalculation for:", effectiveSiteGroupId);
          // 1a. Get total from GROUP settlements
          const { data: groupSettlements } = await (supabase as any)
            .from("tea_shop_group_settlements")
            .select("amount_paid")
            .eq("site_group_id", effectiveSiteGroupId)
            .eq("is_cancelled", false);

          const groupPaid = (groupSettlements || []).reduce(
            (sum: number, s: { amount_paid: number }) => sum + (s.amount_paid || 0),
            0
          );

          // 1b. Get sites in this group to fetch individual settlements
          const { data: sites } = await (supabase as any)
            .from("sites")
            .select("id")
            .eq("site_group_id", effectiveSiteGroupId);

          const siteIds = (sites || []).map((s: { id: string }) => s.id);
          console.log("[TeaShopDialog] Sites in group:", siteIds.length);

          // 1c. Get total from INDIVIDUAL settlements for sites in this group
          let individualPaid = 0;
          if (siteIds.length > 0) {
            const { data: shopAccounts } = await (supabase as any)
              .from("tea_shop_accounts")
              .select("id")
              .in("site_id", siteIds);

            const shopIds = (shopAccounts || []).map((s: { id: string }) => s.id);

            if (shopIds.length > 0) {
              const { data: individualSettlements } = await (supabase as any)
                .from("tea_shop_settlements")
                .select("amount_paid")
                .in("tea_shop_id", shopIds)
                .eq("is_cancelled", false);

              individualPaid = (individualSettlements || []).reduce(
                (sum: number, s: { amount_paid: number }) => sum + (s.amount_paid || 0),
                0
              );
            }
          }

          const totalPaid = groupPaid + individualPaid;
          console.log("[TeaShopDialog] Total paid:", totalPaid, "group:", groupPaid, "individual:", individualPaid);

          // 2. Get ALL entries (group + individual) ordered by date, oldest first
          let entriesQuery = (supabase as any)
            .from("tea_shop_entries")
            .select("id, total_amount, date, site_id, site_group_id");

          const orFilterString = `site_group_id.eq.${effectiveSiteGroupId},site_id.in.(${siteIds.join(",")})`;
          console.log("[TeaShopDialog] Query filter:", siteIds.length > 0 ? `OR: ${orFilterString}` : `EQ: site_group_id=${effectiveSiteGroupId}`);
          console.log("[TeaShopDialog] Entry's current site_id:", currentEntry?.site_id, "Entry's site_group_id:", currentEntry?.site_group_id);

          if (siteIds.length > 0) {
            entriesQuery = entriesQuery.or(orFilterString);
          } else {
            entriesQuery = entriesQuery.eq("site_group_id", effectiveSiteGroupId);
          }

          const { data: allEntries, error: entriesError } = await entriesQuery.order("date", { ascending: true });
          console.log("[TeaShopDialog] Entries found:", allEntries?.length, "Error:", entriesError?.message);
          console.log("[TeaShopDialog] Entry being edited ID:", entry.id);

          // Check if the entry being edited is in the list
          const editedEntryInList = allEntries?.find((e: any) => e.id === entry.id);
          console.log("[TeaShopDialog] Entry being edited found in list:", !!editedEntryInList, editedEntryInList);

          if (allEntries && allEntries.length > 0) {
            console.log("[TeaShopDialog] Entries found:", allEntries.length);

            // OPTIMIZED: Fetch all allocations upfront in ONE query
            const entryIds = allEntries.map((e: any) => e.id);
            const { data: allAllocations } = await (supabase as any)
              .from("tea_shop_entry_allocations")
              .select("id, entry_id, allocated_amount")
              .in("entry_id", entryIds);

            // Group allocations by entry_id for quick lookup
            const allocsByEntry = new Map<string, any[]>();
            (allAllocations || []).forEach((a: any) => {
              if (!allocsByEntry.has(a.entry_id)) {
                allocsByEntry.set(a.entry_id, []);
              }
              allocsByEntry.get(a.entry_id)!.push(a);
            });

            // Calculate all updates in memory first
            const entryUpdates: { id: string; amount_paid: number; is_fully_paid: boolean }[] = [];
            const allocUpdates: { id: string; amount_paid: number; is_fully_paid: boolean }[] = [];

            let remaining = totalPaid;
            for (const e of allEntries) {
              const eTotal = e.total_amount || 0;
              const toAllocate = remaining > 0 ? Math.min(remaining, eTotal) : 0;
              const isFullyPaid = toAllocate >= eTotal && eTotal > 0;

              entryUpdates.push({ id: e.id, amount_paid: toAllocate, is_fully_paid: isFullyPaid });

              // Calculate allocation updates
              const entryAllocs = allocsByEntry.get(e.id) || [];
              let allocRemaining = toAllocate;
              for (const alloc of entryAllocs) {
                const allocAmount = alloc.allocated_amount || 0;
                const allocPaid = Math.min(allocRemaining, allocAmount);
                const allocFullyPaid = allocPaid >= allocAmount && allocAmount > 0;

                allocUpdates.push({ id: alloc.id, amount_paid: allocPaid, is_fully_paid: allocFullyPaid });
                allocRemaining -= allocPaid;
              }

              remaining -= toAllocate;
            }

            // OPTIMIZED: Execute all updates in parallel batches
            const BATCH_SIZE = 10;

            // Update entries in parallel batches
            for (let i = 0; i < entryUpdates.length; i += BATCH_SIZE) {
              const batch = entryUpdates.slice(i, i + BATCH_SIZE);
              await Promise.all(batch.map(upd =>
                (supabase as any)
                  .from("tea_shop_entries")
                  .update({ amount_paid: upd.amount_paid, is_fully_paid: upd.is_fully_paid })
                  .eq("id", upd.id)
              ));
            }

            // Update allocations in parallel batches
            for (let i = 0; i < allocUpdates.length; i += BATCH_SIZE) {
              const batch = allocUpdates.slice(i, i + BATCH_SIZE);
              await Promise.all(batch.map(upd =>
                (supabase as any)
                  .from("tea_shop_entry_allocations")
                  .update({ amount_paid: upd.amount_paid, is_fully_paid: upd.is_fully_paid })
                  .eq("id", upd.id)
              ));
            }

            console.log("[TeaShopDialog] Waterfall complete. Entries updated:", entryUpdates.length, "Allocations updated:", allocUpdates.length);
            setLoadingMessage(null);

            // Invalidate combined tea shop queries to refresh UI
            queryClient.invalidateQueries({
              queryKey: queryKeys.combinedTeaShop.entries(effectiveSiteGroupId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.combinedTeaShop.pending(effectiveSiteGroupId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.combinedTeaShop.unsettled(effectiveSiteGroupId),
            });
          }
        } else {
          console.log("[TeaShopDialog] No effectiveSiteGroupId, skipping waterfall");
        }
      } else {
        // New entry
        const { data: insertData, error: insertError } = await (supabase
          .from("tea_shop_entries") as any)
          .insert(entryData)
          .select()
          .single();

        if (insertError) throw insertError;

        // Save allocations if group entry
        if (showGroupAllocation && calculatedAllocations.length > 0) {
          await createAllocations.mutateAsync({
            entryId: insertData.id,
            allocations: calculatedAllocations,
          });
        }

        // If multi-site split, create entry for secondary site (legacy mode)
        if (enableMultiSite && secondarySite && !showGroupAllocation) {
          const secondaryAmount = Math.round((secondarySitePercent / 100) * simpleTotalCost);

          // Get or create tea shop for secondary site
          let secondaryShopId = null;

          // Check if secondary site has a tea shop
          const { data: existingShop } = await (supabase
            .from("tea_shop_accounts") as any)
            .select("id")
            .eq("site_id", secondarySite.id)
            .eq("is_active", true)
            .single();

          if (existingShop) {
            secondaryShopId = existingShop.id;
          } else {
            // Create a tea shop for secondary site
            const { data: newShop, error: shopError } = await (supabase
              .from("tea_shop_accounts") as any)
              .insert({
                site_id: secondarySite.id,
                shop_name: "Tea Shop",
                is_active: true,
              })
              .select()
              .single();

            if (shopError) {
              console.error("Error creating tea shop for secondary site:", shopError);
            } else {
              secondaryShopId = newShop.id;
            }
          }

          if (secondaryShopId) {
            const secondaryEntryData = {
              ...entryData,
              tea_shop_id: secondaryShopId,
              site_id: secondarySite.id,
              amount: secondaryAmount,
              total_amount: secondaryAmount,
              split_source_entry_id: insertData.id,
              split_percentage: secondarySitePercent,
              split_target_site_id: shop.site_id, // Primary site is the "target" from secondary's perspective
            };

            await (supabase
              .from("tea_shop_entries") as any)
              .insert(secondaryEntryData);
          }
        }
      }

      onSuccess?.();
    } catch (err: any) {
      console.error("Error saving entry:", err);
      let errorMessage = "Failed to save entry";
      if (err.message) {
        if (err.code === "23505") {
          errorMessage = "An entry already exists for this date. Please edit the existing entry instead.";
        } else {
          errorMessage = `Error: ${err.message}`;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedSite) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="h6" component="span" fontWeight={700}>
              {entry ? "Edit Entry" : showGroupAllocation ? "Add Group T&S Entry" : "Add Tea/Snacks Entry"}
            </Typography>
            {showGroupAllocation && siteGroup?.sites && (
              <Chip
                icon={<GroupsIcon />}
                label={`${siteGroup.sites.length} sites`}
                color="secondary"
                size="small"
                variant="outlined"
              />
            )}
            {entry && (
              <Tooltip
                title={
                  <Box>
                    <Typography variant="caption" display="block">
                      <strong>Created by:</strong> {entry.entered_by || "Unknown"}
                    </Typography>
                    <Typography variant="caption" display="block">
                      <strong>Created at:</strong> {dayjs(entry.created_at).format("DD MMM YYYY, hh:mm A")}
                    </Typography>
                    {entry.updated_at && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        <strong>Last updated:</strong> {dayjs(entry.updated_at).format("DD MMM YYYY, hh:mm A")}
                      </Typography>
                    )}
                  </Box>
                }
              >
                <InfoIcon fontSize="small" color="action" sx={{ cursor: "pointer" }} />
              </Tooltip>
            )}
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        {/* Group Sites Info */}
        {showGroupAllocation && siteGroup?.sites && (
          <Alert severity="info" sx={{ mt: 1, py: 0.5 }} icon={<GroupsIcon />}>
            <Typography variant="body2">
              <strong>Sites:</strong> {siteGroup.sites.map((s: any) => s.name).join(", ")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This entry will be split across all sites based on attendance (day units)
            </Typography>
          </Alert>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ maxHeight: "70vh" }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loadingMessage && (
          <Alert severity="info" sx={{ mb: 2 }} icon={<CircularProgress size={18} />}>
            {loadingMessage}
          </Alert>
        )}

        <SimpleEntryModeContent
          date={date}
          onDateChange={setDate}
          totalCost={simpleTotalCost}
          onTotalCostChange={setSimpleTotalCost}
          percentageSplit={percentageSplit}
          onPercentageSplitChange={setPercentageSplit}
          notes={notes}
          onNotesChange={setNotes}
          enableMultiSite={showGroupAllocation ? false : enableMultiSite}
          onEnableMultiSiteChange={setEnableMultiSite}
          primarySite={selectedSite}
          secondarySite={secondarySite}
          onSecondarySiteChange={setSecondarySite}
          primarySitePercent={primarySitePercent}
          secondarySitePercent={secondarySitePercent}
          onSitePercentChange={handleSitePercentChange}
          availableSites={sites}
          hideForGroupEntry={!!showGroupAllocation}
        />

        {/* Group Allocation Section - shows when site is in a group with company tea shop */}
        {showGroupAllocation && (
          <>
            <Divider sx={{ my: 2 }} />
            <GroupAllocationSection
              isInGroup={isInGroup}
              dayUnitsData={dayUnitsData}
              isLoadingDayUnits={loadingDayUnits}
              totalCost={simpleTotalCost}
              date={date}
              enableManualOverride={enableManualOverride}
              onManualOverrideChange={setEnableManualOverride}
              manualAllocations={manualAllocations}
              onManualAllocationsChange={setManualAllocations}
              siteGroup={siteGroup}
            />
          </>
        )}
      </DialogContent>

      {simpleTotalCost > 0 && splitPreview.some((s) => s.perTrade.length > 0) && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Alert severity="info" icon={false} sx={{ py: 0.5 }}>
            <Typography variant="caption" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
              This bill will be split across trades (added to each trade&apos;s contract):
            </Typography>
            {splitPreview.map((s) => (
              <Typography key={s.siteId} variant="caption" component="div">
                {siteNameById(s.siteId)}:{" "}
                {s.perTrade.map((p) => `${p.tradeName} ₹${p.amount.toLocaleString("en-IN")}`).join(" · ")}
              </Typography>
            ))}
          </Alert>
        </Box>
      )}

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || simpleTotalCost <= 0}
        >
          {loading ? <CircularProgress size={24} /> : entry ? "Update" : "Save Entry"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
