"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  RentalItem,
  RentalItemWithDetails,
  RentalItemFormData,
  RentalItemCategory,
  RentalOrder,
  RentalOrderWithDetails,
  RentalOrderFormData,
  RentalOrderFilterState,
  RentalStoreInventory,
  RentalStoreInventoryWithDetails,
  RentalStoreInventoryFormData,
  RentalReturnFormData,
  RentalAdvanceFormData,
  RentalSettlement,
  RentalSettlementFormData,
  RentalCostCalculation,
  RentalItemCostBreakdown,
  RentalPriceComparisonResult,
  RentalPriceHistory,
  RentalSummary,
  RentalType,
  RentalItemSize,
  RentalItemSizeFormData,
  SizeRates,
  HistoricalRentalFormData,
} from "@/types/rental.types";

// ============================================
// QUERY KEYS
// ============================================

export const rentalQueryKeys = {
  all: ["rentals"] as const,
  items: {
    all: ["rentals", "items"] as const,
    list: () => [...rentalQueryKeys.items.all, "list"] as const,
    byId: (id: string) => [...rentalQueryKeys.items.all, id] as const,
    byCategory: (categoryId: string) =>
      [...rentalQueryKeys.items.all, "category", categoryId] as const,
    search: (term: string) =>
      [...rentalQueryKeys.items.all, "search", term] as const,
    sizes: (itemId: string) =>
      ["rentals", "items", itemId, "sizes"] as const,
  },
  categories: {
    all: ["rentals", "categories"] as const,
    tree: ["rentals", "categories", "tree"] as const,
  },
  orders: {
    all: ["rentals", "orders"] as const,
    list: () => [...rentalQueryKeys.orders.all, "list"] as const,
    byId: (id: string) => [...rentalQueryKeys.orders.all, id] as const,
    bySite: (siteId: string) =>
      [...rentalQueryKeys.orders.all, "site", siteId] as const,
    ongoing: (siteId: string) =>
      [...rentalQueryKeys.orders.all, "ongoing", siteId] as const,
    overdue: (siteId: string) =>
      [...rentalQueryKeys.orders.all, "overdue", siteId] as const,
  },
  storeInventory: {
    all: ["rentals", "storeInventory"] as const,
    byVendor: (vendorId: string) =>
      [...rentalQueryKeys.storeInventory.all, "vendor", vendorId] as const,
    byItem: (itemId: string) =>
      [...rentalQueryKeys.storeInventory.all, "item", itemId] as const,
  },
  priceComparison: (itemId: string) =>
    ["rentals", "priceComparison", itemId] as const,
  priceHistory: (itemId: string, vendorId?: string) =>
    ["rentals", "priceHistory", itemId, vendorId] as const,
  summary: (siteId: string) => ["rentals", "summary", siteId] as const,
};

// ============================================
// RENTAL ITEM CATEGORIES
// ============================================

export function useRentalCategories() {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.categories.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_item_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data as RentalItemCategory[];
    },
  });
}

export function useCreateRentalCategory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: Partial<RentalItemCategory>) => {
      await ensureFreshSession();

      const { data: result, error } = await supabase
        .from("rental_item_categories")
        .insert(data as never)
        .select()
        .single();

      if (error) throw error;
      return result as RentalItemCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.categories.all });
    },
  });
}

// ============================================
// RENTAL ITEMS
// ============================================

export function useRentalItems(categoryId?: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: categoryId
      ? rentalQueryKeys.items.byCategory(categoryId)
      : rentalQueryKeys.items.list(),
    queryFn: async () => {
      let query = supabase
        .from("rental_items")
        .select(
          `
          *,
          category:rental_item_categories(id, name, code)
        `
        )
        .eq("is_active", true)
        .order("name");

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as RentalItemWithDetails[];
    },
  });
}

export function useRentalItemsWithVendorStats(categoryId?: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: [
      ...rentalQueryKeys.items.list(),
      "withVendorStats",
      categoryId ?? "all",
    ],
    queryFn: wrapQueryFn(async () => {
      let query = supabase
        .from("rental_items")
        .select(
          `
          *,
          category:rental_item_categories(id, name, code),
          sizes:rental_item_sizes(id, size_label, display_order, is_active),
          inventory:rental_store_inventory(id, vendor_id, daily_rate, size_rates)
        `
        )
        .eq("is_active", true)
        .order("name");

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((item: any) => ({
        ...item,
        vendor_count: (item.inventory as any[])?.length ?? 0,
        lowest_rate:
          (item.inventory as any[])?.length > 0
            ? Math.min(
                ...(item.inventory as any[]).map(
                  (inv: any) => inv.daily_rate ?? Infinity
                )
              )
            : null,
        sizes: ((item.sizes as any[]) ?? []).filter((s: any) => s.is_active),
      })) as (RentalItemWithDetails & {
        vendor_count: number;
        lowest_rate: number | null;
      })[];
    }, { operationName: "useRentalItemsWithVendorStats" }),
  });
}

/**
 * Pagination parameters
 */
export interface RentalPaginationParams {
  pageIndex: number;
  pageSize: number;
}

/**
 * Paginated result
 */
export interface RentalPaginatedResult<T> {
  data: T[];
  totalCount: number;
  pageCount: number;
}

/**
 * Fetch rental items with server-side pagination
 */
export function usePaginatedRentalItems(
  pagination: RentalPaginationParams,
  rentalType?: RentalType | "all" | null,
  searchTerm?: string,
  sortBy: "alphabetical" | "recently_added" | "by_rate" = "alphabetical"
) {
  const supabase = createClient();
  const { pageIndex, pageSize } = pagination;
  const offset = pageIndex * pageSize;

  return useQuery({
    queryKey: ["rentals", "items", "paginated", { pageIndex, pageSize, rentalType, searchTerm, sortBy }],
    queryFn: wrapQueryFn<RentalPaginatedResult<RentalItemWithDetails>>(async () => {
      // Get total count
      let countQuery = supabase
        .from("rental_items")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      if (rentalType && rentalType !== "all") {
        countQuery = countQuery.eq("rental_type", rentalType);
      }

      if (searchTerm && searchTerm.length >= 2) {
        countQuery = countQuery.or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,local_name.ilike.%${searchTerm}%`
        );
      }

      const { count: totalCount, error: countError } = await countQuery;
      if (countError) throw countError;

      // Get paginated data
      let dataQuery = supabase
        .from("rental_items")
        .select(
          `
          *,
          category:rental_item_categories(id, name, code)
        `
        )
        .eq("is_active", true);

      // Apply sorting
      switch (sortBy) {
        case "recently_added":
          dataQuery = dataQuery.order("created_at", { ascending: false });
          break;
        case "by_rate":
          dataQuery = dataQuery.order("daily_rate", { ascending: true });
          break;
        default:
          dataQuery = dataQuery.order("name", { ascending: true });
      }

      dataQuery = dataQuery.range(offset, offset + pageSize - 1);

      if (rentalType && rentalType !== "all") {
        dataQuery = dataQuery.eq("rental_type", rentalType);
      }

      if (searchTerm && searchTerm.length >= 2) {
        dataQuery = dataQuery.or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,local_name.ilike.%${searchTerm}%`
        );
      }

      const { data, error: dataError } = await dataQuery;
      if (dataError) throw dataError;

      return {
        data: data as RentalItemWithDetails[],
        totalCount: totalCount || 0,
        pageCount: Math.ceil((totalCount || 0) / pageSize),
      };
    }, { operationName: "usePaginatedRentalItems" }),
    placeholderData: (previousData) => previousData,
  });
}

export function useRentalItem(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.items.byId(id || ""),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("rental_items")
        .select(
          `
          *,
          category:rental_item_categories(id, name, code)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as RentalItemWithDetails;
    },
    enabled: !!id,
  });
}

export function useRentalItemSearch(searchTerm: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.items.search(searchTerm),
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const { data, error } = await supabase
        .from("rental_items")
        .select(
          `
          *,
          category:rental_item_categories(id, name, code)
        `
        )
        .eq("is_active", true)
        .or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,local_name.ilike.%${searchTerm}%`
        )
        .order("name")
        .limit(20);

      if (error) throw error;
      return data as RentalItemWithDetails[];
    },
    enabled: searchTerm.length >= 2,
  });
}

export function useCreateRentalItem() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalItemFormData) => {
      await ensureFreshSession();

      // Generate code if not provided
      if (!data.code) {
        const prefix =
          data.rental_type === "equipment"
            ? "EQP"
            : data.rental_type === "scaffolding"
              ? "SCF"
              : data.rental_type === "shuttering"
                ? "SHT"
                : "OTH";

        const { count } = await supabase
          .from("rental_items")
          .select("*", { count: "exact", head: true })
          .ilike("code", `${prefix}-%`);

        data.code = `${prefix}-${String((count || 0) + 1).padStart(4, "0")}`;
      }

      const { data: result, error } = await supabase
        .from("rental_items")
        .insert(data as never)
        .select()
        .single();

      if (error) throw error;
      return result as RentalItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.items.all });
    },
  });
}

export function useUpdateRentalItem() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<RentalItemFormData>;
    }) => {
      await ensureFreshSession();

      const { data: result, error } = await supabase
        .from("rental_items")
        .update(data as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as RentalItem;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.items.all });
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.items.byId(variables.id),
      });
    },
  });
}

export function useDeleteRentalItem() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();

      // Soft delete
      const { error } = await supabase
        .from("rental_items")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.items.all });
    },
  });
}

// ============================================
// RENTAL ORDERS
// ============================================

export function useRentalOrders(
  siteId: string,
  filters?: RentalOrderFilterState,
  options?: { enabled?: boolean }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: [...rentalQueryKeys.orders.bySite(siteId), filters],
    queryFn: wrapQueryFn(async () => {
      let query = supabase
        .from("rental_orders")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, address, shop_name),
          site:sites(id, name),
          items:rental_order_items(
            *,
            rental_item:rental_items(id, name, code, rental_type, unit, image_url)
          ),
          advances:rental_advances(*),
          settlement:rental_settlements(*)
        `
        )
        .eq("site_id", siteId)
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status as any);
      }
      if (filters?.vendorId) {
        query = query.eq("vendor_id", filters.vendorId);
      }
      if (filters?.dateFrom) {
        query = query.gte("start_date", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("start_date", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Calculate accrued costs and overdue status
      return (data || []).map((order) => {
        const now = new Date();
        const startDate = new Date(order.start_date);
        const daysSinceStart = Math.max(
          0,
          Math.ceil(
            (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        const expectedReturnDate = order.expected_return_date
          ? new Date(order.expected_return_date)
          : null;
        const isOverdue = expectedReturnDate
          ? now > expectedReturnDate && order.status !== "completed"
          : false;

        const accruedRentalCost = (order.items || []).reduce(
          (sum: number, item: any) => {
            // For hourly rate items, use hours_used instead of days
            if (item.rate_type === "hourly") {
              return (
                sum +
                (item.quantity_outstanding || 0) *
                  (item.daily_rate_actual || 0) *
                  (item.hours_used || 0)
              );
            }

            // For daily rate items, calculate based on days
            const itemDays = item.item_start_date
              ? Math.max(
                  1,
                  Math.ceil(
                    (now.getTime() - new Date(item.item_start_date).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                )
              : daysSinceStart || 1;
            return (
              sum + (item.quantity_outstanding || 0) * (item.daily_rate_actual || 0) * itemDays
            );
          },
          0
        );

        const totalAdvancePaid = (order.advances || []).reduce(
          (sum: number, adv: any) => sum + adv.amount,
          0
        );

        const { settlement, ...rest } = order as any;
        return {
          ...rest,
          settlements: Array.isArray(settlement) ? settlement : (settlement ? [settlement] : []),
          parent_order_id: (order as any).parent_order_id ?? null,
          accrued_rental_cost: accruedRentalCost,
          total_advance_paid: totalAdvancePaid,
          days_since_start: daysSinceStart,
          is_overdue: isOverdue,
        } as RentalOrderWithDetails;
      });
    }, { operationName: "useRentalOrders" }),
    staleTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!siteId,
  });
}

export function useOngoingRentals(siteId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.orders.ongoing(siteId),
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await supabase
        .from("rental_orders")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, shop_name),
          items:rental_order_items(
            *,
            rental_item:rental_items(id, name, unit)
          ),
          advances:rental_advances(amount)
        `
        )
        .eq("site_id", siteId)
        .in("status", ["confirmed", "active", "partially_returned"])
        .order("start_date", { ascending: true });

      if (error) throw error;

      // Calculate costs for each order
      const now = new Date();
      return (data || []).map((order) => {
        const startDate = new Date(order.start_date);
        const daysSinceStart = Math.max(
          1,
          Math.ceil(
            (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        const expectedReturnDate = order.expected_return_date
          ? new Date(order.expected_return_date)
          : null;
        const isOverdue = expectedReturnDate ? now > expectedReturnDate : false;

        const accruedRentalCost = (order.items || []).reduce(
          (sum: number, item: any) => {
            const itemDays = item.item_start_date
              ? Math.max(
                  1,
                  Math.ceil(
                    (now.getTime() - new Date(item.item_start_date).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                )
              : daysSinceStart;
            return (
              sum + (item.quantity_outstanding || 0) * item.daily_rate_actual * itemDays
            );
          },
          0
        );

        const totalAdvancePaid = (order.advances || []).reduce(
          (sum: number, adv: any) => sum + (adv.amount || 0),
          0
        );

        return {
          ...order,
          accrued_rental_cost: accruedRentalCost,
          total_advance_paid: totalAdvancePaid,
          days_since_start: daysSinceStart,
          is_overdue: isOverdue,
        } as RentalOrderWithDetails;
      });
    }, { operationName: "useOngoingRentals" }),
    staleTime: 5 * 60 * 1000,
    enabled: !!siteId,
  });
}

export function useOverdueRentals(siteId: string) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: rentalQueryKeys.orders.overdue(siteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_orders")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, shop_name),
          items:rental_order_items(*),
          advances:rental_advances(amount)
        `
        )
        .eq("site_id", siteId)
        .in("status", ["confirmed", "active", "partially_returned"])
        .lt("expected_return_date", today)
        .order("expected_return_date", { ascending: true });

      if (error) throw error;
      return data as RentalOrderWithDetails[];
    },
    enabled: !!siteId,
  });
}

export function useRentalOrder(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.orders.byId(id || ""),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("rental_orders")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, address, email, shop_name),
          site:sites(id, name),
          items:rental_order_items(
            *,
            rental_item:rental_items(*)
          ),
          advances:rental_advances(*),
          returns:rental_returns(*),
          settlement:rental_settlements(*)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      // Calculate costs
      const now = new Date();
      const startDate = new Date(data.start_date);
      const daysSinceStart = Math.max(
        1,
        Math.ceil(
          (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      const expectedReturnDate = data.expected_return_date
        ? new Date(data.expected_return_date)
        : null;
      const isOverdue = expectedReturnDate
        ? now > expectedReturnDate && data.status !== "completed"
        : false;

      // Get all returns to calculate proper end dates for cost calculation
      const allReturns = data.returns || [];

      const accruedRentalCost = (data.items || []).reduce(
        (sum: number, item: any) => {
          const itemStartDate = item.item_start_date
            ? new Date(item.item_start_date)
            : startDate;

          // Get returns for this specific item
          const itemReturns = allReturns.filter(
            (r: any) => r.rental_order_item_id === item.id
          );

          // Find the last return date for this item if fully returned
          const itemLastReturnDate =
            itemReturns.length > 0
              ? new Date(
                  Math.max(
                    ...itemReturns.map((r: any) =>
                      new Date(r.return_date).getTime()
                    )
                  )
                )
              : null;

          // Use return date if item is fully returned, otherwise use now
          const itemEndDate =
            (item.quantity_outstanding || 0) === 0 && itemLastReturnDate
              ? itemLastReturnDate
              : now;

          const itemDays = Math.max(
            1,
            Math.ceil(
              (itemEndDate.getTime() - itemStartDate.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          );

          // Use full quantity for cost (not quantity_outstanding)
          return sum + (item.quantity || 0) * item.daily_rate_actual * itemDays;
        },
        0
      );

      const totalAdvancePaid = (data.advances || []).reduce(
        (sum: number, adv: any) => sum + (adv.amount || 0),
        0
      );

      const { settlement: settlementSingular, ...restData } = data as any;
      return {
        ...restData,
        settlements: Array.isArray(settlementSingular) ? settlementSingular : (settlementSingular ? [settlementSingular] : []),
        parent_order_id: (data as any).parent_order_id ?? null,
        accrued_rental_cost: accruedRentalCost,
        total_advance_paid: totalAdvancePaid,
        days_since_start: daysSinceStart,
        is_overdue: isOverdue,
      } as RentalOrderWithDetails;
    },
    enabled: !!id,
  });
}

export function useCreateRentalOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalOrderFormData) => {
      await ensureFreshSession();

      // Generate order number
      const { data: orderNumber, error: numError } = await supabase.rpc(
        "generate_rental_order_number",
        {
          p_site_id: data.site_id,
        }
      );

      if (numError) {
        console.error("RPC generate_rental_order_number error:", numError);
        throw new Error(`Failed to generate order number: ${numError.message}`);
      }

      if (!orderNumber) {
        throw new Error("Failed to generate order number: No value returned");
      }

      const { items, ...orderData } = data;

      // Calculate estimated total - considering hourly vs daily rate types
      const excludeStart = data.exclude_start_date ?? false;
      const days = data.expected_return_date
        ? Math.max(
            1,
            Math.ceil(
              (new Date(data.expected_return_date).getTime() -
                new Date(data.start_date).getTime()) /
                (1000 * 60 * 60 * 24)
            ) + (excludeStart ? 0 : 1)
          )
        : 30;
      // NOTE: rentalService.ts accrued-cost calculations don't yet read exclude_start_date

      const itemsTotal = items.reduce((sum, item) => {
        if (item.rate_type === "hourly") {
          // Hourly: quantity × rate × hours
          return sum + item.quantity * item.daily_rate_actual * (item.hours_used || 0);
        } else {
          // Daily: quantity × rate × days
          return sum + item.quantity * item.daily_rate_actual * days;
        }
      }, 0);

      // Add transport costs
      const transportTotal =
        (data.transport_cost_outward || 0) +
        (data.loading_cost_outward || 0) +
        (data.unloading_cost_outward || 0);

      const estimatedTotal = itemsTotal + transportTotal;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("rental_orders")
        .insert({
          ...orderData,
          rental_order_number: orderNumber,
          status: "confirmed",
          estimated_total: estimatedTotal,
        })
        .select()
        .single();

      if (orderError) {
        console.error("Insert rental_orders error:", orderError);
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      // Create items
      if (items.length > 0) {
        const itemsToInsert = items.map((item) => ({
          ...item,
          rental_order_id: order.id,
        }));

        const { error: itemsError } = await supabase
          .from("rental_order_items")
          .insert(itemsToInsert);

        if (itemsError) {
          console.error("Insert rental_order_items error:", itemsError);
          throw new Error(`Failed to create order items: ${itemsError.message}`);
        }
      }

      return order as RentalOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.bySite(data.site_id),
      });
    },
  });
}

export function useUpdateRentalOrderStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: RentalOrder["status"];
    }) => {
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("rental_orders")
        .update({ status: status as any })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as RentalOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.byId(data.id),
      });
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

export function useCancelRentalOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }) => {
      await ensureFreshSession();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("rental_orders")
        .update({
          status: "cancelled",
          cancelled_by: user?.id,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as RentalOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.byId(data.id),
      });
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

export function useDeleteRentalOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();

      // Delete related records first (order matters due to foreign keys)
      // Delete advances
      await supabase.from("rental_advances").delete().eq("rental_order_id", id);

      // Delete returns
      await supabase.from("rental_returns").delete().eq("rental_order_id", id);

      // Delete order items
      await supabase
        .from("rental_order_items")
        .delete()
        .eq("rental_order_id", id);

      // Delete the order itself
      const { error } = await supabase
        .from("rental_orders")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: ["rentals", "summary"] });
    },
  });
}

// ============================================
// RENTAL RETURNS
// ============================================

export function useRecordRentalReturn() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalReturnFormData) => {
      await ensureFreshSession();

      // Create return record
      const { data: returnRecord, error: returnError } = await supabase
        .from("rental_returns")
        .insert(data)
        .select()
        .single();

      if (returnError) throw returnError;

      // Get current item
      const { data: item } = await supabase
        .from("rental_order_items")
        .select("quantity, quantity_returned")
        .eq("id", data.rental_order_item_id)
        .single();

      if (item) {
        const newQuantityReturned =
          (item.quantity_returned || 0) + data.quantity_returned;
        const newStatus =
          newQuantityReturned >= item.quantity
            ? "returned"
            : "partially_returned";

        await supabase
          .from("rental_order_items")
          .update({
            quantity_returned: newQuantityReturned,
            status: newStatus,
          })
          .eq("id", data.rental_order_item_id);
      }

      // Update order status if all items returned
      const { data: orderItems } = await supabase
        .from("rental_order_items")
        .select("quantity, quantity_returned")
        .eq("rental_order_id", data.rental_order_id);

      if (orderItems) {
        const allReturned = orderItems.every(
          (i: any) => (i.quantity_returned || 0) >= i.quantity
        );
        const partiallyReturned = orderItems.some(
          (i: any) => (i.quantity_returned || 0) > 0
        );

        let newOrderStatus: RentalOrder["status"] = "active";
        if (allReturned) {
          // Keep as partially_returned until settlement is done
          // Settlement will change status to "completed"
          newOrderStatus = "partially_returned";
        } else if (partiallyReturned) {
          newOrderStatus = "partially_returned";
        }

        await supabase
          .from("rental_orders")
          .update({ status: newOrderStatus })
          .eq("id", data.rental_order_id);
      }

      return returnRecord;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.byId(variables.rental_order_id),
      });
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ============================================
// RENTAL ADVANCES
// ============================================

export function useRecordRentalAdvance() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalAdvanceFormData) => {
      await ensureFreshSession();

      const { data: advance, error } = await supabase
        .from("rental_advances")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return advance;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.byId(variables.rental_order_id),
      });
    },
  });
}

export function useDeleteRentalAdvance() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, rental_order_id }: { id: string; rental_order_id: string }) => {
      await ensureFreshSession();
      const { error } = await supabase.from("rental_advances").delete().eq("id", id);
      if (error) throw error;
      return { id, rental_order_id };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.byId(variables.rental_order_id),
      });
    },
  });
}

// ============================================
// RENTAL SETTLEMENTS
// ============================================

export function useSettleRental() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalSettlementFormData) => {
      await ensureFreshSession();

      // Get order details including vendor info for expense creation
      const { data: order } = await supabase
        .from("rental_orders")
        .select("site_id, vendor:vendors(name, shop_name, phone)")
        .eq("id", data.rental_order_id)
        .single();

      if (!order?.site_id) {
        throw new Error("Order not found or missing site_id");
      }

      // Generate settlement reference
      const { data: settRef } = await supabase.rpc(
        "generate_rental_settlement_reference",
        {
          p_site_id: order.site_id,
        }
      );

      const { data: settlement, error } = await supabase
        .from("rental_settlements")
        .insert({
          ...data,
          settlement_reference: settRef,
        })
        .select()
        .single();

      if (error) throw error;

      // Update order status to completed
      await supabase
        .from("rental_orders")
        .update({
          status: "completed",
          actual_total:
            data.negotiated_final_amount || data.total_rental_amount,
          actual_return_date: data.settlement_date,
        })
        .eq("id", data.rental_order_id);

      // NOTE: We do NOT create a direct expense entry here.
      // Rental settlements automatically appear in the v_all_expenses view
      // via the rental_settlements UNION clause in the view definition.
      // Creating a direct expense would cause duplicates.

      return settlement;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.orders.byId(variables.rental_order_id),
      });
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
      // Invalidate expenses view since rental settlements automatically appear in v_all_expenses
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

// ============================================
// STORE INVENTORY & PRICE COMPARISON
// ============================================

export function useRentalStoreInventory(vendorId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.storeInventory.byVendor(vendorId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_store_inventory")
        .select(
          `
          *,
          rental_item:rental_items(*)
        `
        )
        .eq("vendor_id", vendorId)
        .order("created_at");

      if (error) throw error;
      return data as RentalStoreInventoryWithDetails[];
    },
    enabled: !!vendorId,
  });
}

export function useRentalStoresForItem(rentalItemId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.storeInventory.byItem(rentalItemId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_store_inventory")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, rating, shop_name)
        `
        )
        .eq("rental_item_id", rentalItemId)
        .order("daily_rate", { ascending: true });

      if (error) throw error;
      return data as RentalStoreInventoryWithDetails[];
    },
    enabled: !!rentalItemId,
  });
}

export function useAddRentalStoreInventory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalStoreInventoryFormData) => {
      await ensureFreshSession();

      const { data: result, error } = await supabase
        .from("rental_store_inventory")
        .upsert(data, {
          onConflict: "vendor_id,rental_item_id",
        })
        .select()
        .single();

      if (error) throw error;
      return result as RentalStoreInventory;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.storeInventory.byVendor(variables.vendor_id),
      });
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.storeInventory.byItem(
          variables.rental_item_id
        ),
      });
    },
  });
}

export function useRentalPriceComparison(rentalItemId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.priceComparison(rentalItemId),
    queryFn: async () => {
      // Get item details
      const { data: item } = await supabase
        .from("rental_items")
        .select("id, name")
        .eq("id", rentalItemId)
        .single();

      // Get store inventory
      const { data: inventory, error } = await supabase
        .from("rental_store_inventory")
        .select(
          `
          *,
          vendor:vendors(id, name, phone, rating, shop_name)
        `
        )
        .eq("rental_item_id", rentalItemId)
        .order("daily_rate", { ascending: true });

      if (error) throw error;

      // Get latest price history for each vendor
      const { data: priceHistory } = await supabase
        .from("rental_price_history")
        .select("vendor_id, daily_rate, recorded_date")
        .eq("rental_item_id", rentalItemId)
        .order("recorded_date", { ascending: false });

      // Build comparison result
      const vendors = (inventory || []).map((inv: any) => {
        const lastHistory = (priceHistory || []).find(
          (ph: any) => ph.vendor_id === inv.vendor_id
        );

        return {
          vendorId: inv.vendor.id,
          vendorName: inv.vendor.name,
          shopName: inv.vendor.shop_name,
          dailyRate: inv.daily_rate,
          weeklyRate: inv.weekly_rate,
          monthlyRate: inv.monthly_rate,
          transportCost: inv.transport_cost || 0,
          rating: inv.vendor.rating,
          lastRentalDate: lastHistory?.recorded_date || null,
        };
      });

      return {
        rentalItemId,
        rentalItemName: item?.name || "",
        vendors,
      } as RentalPriceComparisonResult;
    },
    enabled: !!rentalItemId,
  });
}

export function useRentalPriceHistory(
  rentalItemId: string,
  vendorId?: string
) {
  const supabase = createClient();

  return useQuery({
    queryKey: rentalQueryKeys.priceHistory(rentalItemId, vendorId),
    queryFn: async () => {
      let query = supabase
        .from("rental_price_history")
        .select(
          `
          *,
          vendor:vendors(id, name, shop_name)
        `
        )
        .eq("rental_item_id", rentalItemId)
        .order("recorded_date", { ascending: false })
        .limit(50);

      if (vendorId) {
        query = query.eq("vendor_id", vendorId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (RentalPriceHistory & {
        vendor: { id: string; name: string; shop_name: string | null };
      })[];
    },
    enabled: !!rentalItemId,
  });
}

// ============================================
// RENTAL SUMMARY
// ============================================

export function useRentalSummary(siteId: string) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: rentalQueryKeys.summary(siteId),
    queryFn: wrapQueryFn(async () => {
      // Fetch ongoing orders
      const { data: ongoingOrders, error: ongoingError } = await supabase
        .from("rental_orders")
        .select(
          `
          id,
          status,
          start_date,
          expected_return_date,
          items:rental_order_items(quantity_outstanding, daily_rate_actual, item_start_date, rate_type, hours_used),
          advances:rental_advances(amount)
        `
        )
        .eq("site_id", siteId)
        .in("status", ["confirmed", "active", "partially_returned"]);

      if (ongoingError) throw ongoingError;

      // Fetch completed orders with settlements
      const { data: completedOrders, error: completedError } = await supabase
        .from("rental_orders")
        .select(
          `
          id,
          status,
          actual_total,
          settlement:rental_settlements(
            negotiated_final_amount,
            total_rental_amount,
            total_transport_amount,
            total_damage_amount,
            total_advance_paid,
            balance_amount
          ),
          advances:rental_advances(amount)
        `
        )
        .eq("site_id", siteId)
        .eq("status", "completed");

      if (completedError) throw completedError;

      let ongoingCount = 0;
      let overdueCount = 0;
      let totalAccruedCost = 0;
      let totalAdvancesPaid = 0;

      const now = new Date();

      for (const order of ongoingOrders || []) {
        ongoingCount++;

        if (order.expected_return_date && order.expected_return_date < today) {
          overdueCount++;
        }

        // Sum advances
        totalAdvancesPaid += (order.advances || []).reduce(
          (sum: number, adv: any) => sum + (adv.amount || 0),
          0
        );

        // Calculate accrued cost
        const startDate = new Date(order.start_date);
        const daysSinceStart = Math.max(
          1,
          Math.ceil(
            (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        totalAccruedCost += (order.items || []).reduce(
          (sum: number, item: any) => {
            // For hourly rate items, use hours_used instead of days
            if (item.rate_type === "hourly") {
              return (
                sum +
                (item.quantity_outstanding || 0) *
                  (item.daily_rate_actual || 0) *
                  (item.hours_used || 0)
              );
            }

            // For daily rate items, calculate based on days
            const itemDays = item.item_start_date
              ? Math.max(
                  1,
                  Math.ceil(
                    (now.getTime() - new Date(item.item_start_date).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                )
              : daysSinceStart;
            return (
              sum + (item.quantity_outstanding || 0) * (item.daily_rate_actual || 0) * itemDays
            );
          },
          0
        );
      }

      // Calculate completed stats
      let completedCount = 0;
      let totalSettledAmount = 0;
      let totalOutstandingBalance = 0;

      for (const order of completedOrders || []) {
        completedCount++;
        const settlement = (order as any).settlement as any;
        if (settlement) {
          // Settlement exists - use negotiated or calculated amount
          const finalAmount = settlement.negotiated_final_amount ||
            (settlement.total_rental_amount + settlement.total_transport_amount + settlement.total_damage_amount);
          totalSettledAmount += finalAmount;
          // Balance that was actually paid at settlement (could be 0 if fully prepaid)
          totalOutstandingBalance += Math.max(0, settlement.balance_amount || 0);
        } else {
          // No settlement yet but order is completed (shouldn't happen normally)
          totalSettledAmount += order.actual_total || 0;
        }
      }

      return {
        ongoingCount,
        overdueCount,
        totalAccruedCost,
        totalAdvancesPaid,
        totalDue: totalAccruedCost - totalAdvancesPaid,
        completedCount,
        totalSettledAmount,
        totalOutstandingBalance,
      } as RentalSummary;
    }, { operationName: "useRentalSummary" }),
    staleTime: 5 * 60 * 1000,
    enabled: !!siteId,
  });
}

// ============================================
// COST CALCULATION HOOK
// ============================================

export function useRentalCostCalculation(
  orderId: string | undefined
): RentalCostCalculation | null {
  const { data: order } = useRentalOrder(orderId);

  return useMemo(() => {
    if (!order) return null;

    const now = new Date();
    const startDate = new Date(order.start_date);
    const expectedReturnDate = order.expected_return_date
      ? new Date(order.expected_return_date)
      : null;

    // Get all returns to calculate proper end dates
    const allReturns = order.returns || [];

    // Check if all items are fully returned
    const allItemsReturned = (order.items || []).every(
      (item) => item.quantity_outstanding === 0
    );

    // Find the last return date if all items are returned
    const lastReturnDate =
      allReturns.length > 0
        ? new Date(
            Math.max(
              ...allReturns.map((r) => new Date(r.return_date).getTime())
            )
          )
        : null;

    // For completed orders, use actual_return_date (set by historical records and normal return flow).
    // Fall back to last return-record date, then today for still-active orders.
    const effectiveEndDate =
      order.status === "completed" && order.actual_return_date
        ? new Date(order.actual_return_date)
        : allItemsReturned && lastReturnDate
        ? lastReturnDate
        : now;

    const daysElapsed = Math.max(
      1,
      Math.ceil(
        (effectiveEndDate.getTime() - startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const expectedTotalDays = expectedReturnDate
      ? Math.ceil(
          (expectedReturnDate.getTime() - startDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : daysElapsed;

    const itemsCost: RentalItemCostBreakdown[] = (order.items || []).map(
      (item) => {
        const itemStartDate = item.item_start_date
          ? new Date(item.item_start_date)
          : startDate;

        // Get returns for this specific item
        const itemReturns = allReturns.filter(
          (r) => r.rental_order_item_id === item.id
        );

        // Find the last return date for this item if fully returned
        const itemLastReturnDate =
          itemReturns.length > 0
            ? new Date(
                Math.max(
                  ...itemReturns.map((r) => new Date(r.return_date).getTime())
                )
              )
            : null;

        // For completed orders, use per-item expected return date if available (set by historical
        // records with custom per-item days), otherwise fall back to the order's actual_return_date.
        const itemEndDate =
          order.status === "completed"
            ? item.item_expected_return_date
              ? new Date(item.item_expected_return_date)
              : new Date(order.actual_return_date!)
            : item.quantity_outstanding === 0 && itemLastReturnDate
            ? itemLastReturnDate
            : now;

        const daysRented = Math.max(
          1,
          Math.ceil(
            (itemEndDate.getTime() - itemStartDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );

        const rateType = item.rate_type || "daily";
        const hoursUsed = item.hours_used || null;

        // Calculate subtotal based on rate type
        // Use full quantity for cost (not quantity_outstanding) since we charge for the rental period
        let subtotal: number;
        if (rateType === "hourly" && hoursUsed) {
          // Hourly items: qty × rate × hours
          subtotal = item.quantity * item.daily_rate_actual * hoursUsed;
        } else {
          // Daily items: qty × rate × days
          subtotal = item.quantity * item.daily_rate_actual * daysRented;
        }

        return {
          itemId: item.id,
          itemName: (item as any).item_name_override || item.rental_item?.name || "Unknown",
          quantity: item.quantity,
          quantityReturned: item.quantity_returned,
          quantityOutstanding: item.quantity_outstanding,
          dailyRate: item.daily_rate_actual,
          rateType,
          daysRented,
          hoursUsed,
          subtotal,
        };
      }
    );

    const subtotal = itemsCost.reduce((sum, item) => sum + item.subtotal, 0);
    const discountAmount =
      (subtotal * order.negotiated_discount_percentage) / 100;

    const transportCostOutward =
      order.transport_cost_outward +
      order.loading_cost_outward +
      order.unloading_cost_outward;
    const transportCostReturn =
      order.transport_cost_return +
      order.loading_cost_return +
      order.unloading_cost_return;
    const totalTransportCost = transportCostOutward + transportCostReturn;

    const damagesCost = (order.returns || []).reduce(
      (sum: number, ret: any) => sum + (ret.damage_cost || 0),
      0
    );

    const grossTotal =
      subtotal - discountAmount + totalTransportCost + damagesCost;
    const advancesPaid = (order.advances || []).reduce(
      (sum: number, adv: any) => sum + adv.amount,
      0
    );
    const balanceDue = grossTotal - advancesPaid;

    const isCompleted = order.status === "completed";
    // Completed orders are never "overdue" — they're done
    const isOverdue = isCompleted ? false : (expectedReturnDate ? now > expectedReturnDate : false);
    const daysOverdue =
      isOverdue && expectedReturnDate
        ? Math.ceil(
            (now.getTime() - expectedReturnDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

    const displayDate = isCompleted && order.actual_return_date
      ? order.actual_return_date
      : now.toISOString().split("T")[0];

    return {
      orderId: order.id,
      startDate: order.start_date,
      currentDate: displayDate,
      expectedReturnDate: order.expected_return_date,
      actualReturnDate: order.actual_return_date ?? null,
      isCompleted,
      daysElapsed,
      expectedTotalDays,
      itemsCost,
      subtotal,
      discountAmount,
      transportCostOutward,
      transportCostReturn,
      totalTransportCost,
      damagesCost,
      grossTotal,
      advancesPaid,
      balanceDue,
      isOverdue,
      daysOverdue,
    } as RentalCostCalculation;
  }, [order]);
}

// ============================================
// RENTAL STORES (Vendors filtered by type)
// ============================================

export function useRentalStores() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["vendors", "rental_stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("vendor_type", "rental_store")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
  });
}

// ============================================
// RENTAL ITEM SIZES
// ============================================

export function useRentalItemSizes(itemId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: itemId
      ? rentalQueryKeys.items.sizes(itemId)
      : ["rentals", "sizes", "disabled"],
    enabled: !!itemId,
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await (supabase as any)
        .from("rental_item_sizes")
        .select("*")
        .eq("rental_item_id", itemId!)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as RentalItemSize[];
    }, { operationName: "useRentalItemSizes" }),
  });
}

export function useRentalInventoryForItem(itemId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: itemId
      ? rentalQueryKeys.storeInventory.byItem(itemId)
      : ["rentals", "storeInventory", "disabled"],
    enabled: !!itemId,
    queryFn: wrapQueryFn(async () => {
      const { data, error } = await supabase
        .from("rental_store_inventory")
        .select(`
          *,
          vendor:vendors(id, name, shop_name, phone),
          rental_item:rental_items(id, name, code, unit)
        `)
        .eq("rental_item_id", itemId!)
        .order("daily_rate");
      if (error) throw error;
      return (data ?? []) as RentalStoreInventoryWithDetails[];
    }, { operationName: "useRentalInventoryForItem" }),
  });
}

export function useCreateRentalItemSize() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalItemSizeFormData) => {
      await ensureFreshSession();

      const { data: result, error } = await (supabase as any)
        .from("rental_item_sizes")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result as RentalItemSize;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.items.sizes(vars.rental_item_id),
      });
    },
  });
}

export function useUpdateStoreInventorySizeRates() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, size_rates }: { id: string; size_rates: SizeRates }) => {
      await ensureFreshSession();

      const { error } = await supabase
        .from("rental_store_inventory")
        .update({ size_rates } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all store inventory queries
      queryClient.invalidateQueries({
        queryKey: rentalQueryKeys.storeInventory.all,
      });
    },
  });
}

// ── Request workflow hooks ──────────────────────────────────────────────────

export function useCreateRentalRequest() {
  const qc = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: { site_id: string; order_date: string; start_date: string; estimated_days: number; notes?: string; items: Array<{ rental_item_id: string; quantity: number; daily_rate_default: number; daily_rate_actual: number; rate_type: "daily" | "weekly" | "monthly" | "hourly" }> }) => {
      await ensureFreshSession();

      const { items, ...orderData } = data;
      const { data: order, error: orderError } = await (supabase as any)
        .from("rental_orders")
        .insert({ ...orderData, vendor_id: null, status: "pending" })
        .select()
        .single();
      if (orderError) throw orderError;

      if (items.length > 0) {
        const { error: itemsError } = await (supabase as any)
          .from("rental_order_items")
          .insert(items.map((i) => ({ ...i, rental_order_id: order.id })));
        if (itemsError) throw itemsError;
      }

      return order as RentalOrder;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.bySite(vars.site_id) });
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

export function useApproveRentalRequest() {
  const qc = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("rental_orders")
        .update({ status: "approved" })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ── Delivery verification hook ──────────────────────────────────────────────

export function useConfirmRentalDelivery() {
  const qc = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      deliveryDate,
      actualTransportCost,
      itemsReceived,
    }: {
      orderId: string;
      deliveryDate: string;
      actualTransportCost: number;
      itemsReceived: { order_item_id: string; qty_received: number }[];
    }) => {
      await ensureFreshSession();

      const { error: orderError } = await (supabase as any)
        .from("rental_orders")
        .update({
          status: "active",
          start_date: deliveryDate,
          transport_cost_outward: actualTransportCost,
        })
        .eq("id", orderId);
      if (orderError) throw orderError;

      for (const item of itemsReceived) {
        await supabase
          .from("rental_order_items")
          .update({ quantity: item.qty_received })
          .eq("id", item.order_item_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ── Date extension hook ─────────────────────────────────────────────────────

export function useExtendRentalReturnDate() {
  const qc = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      newExpectedReturnDate,
      reason,
    }: {
      orderId: string;
      newExpectedReturnDate: string;
      reason: string;
    }) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("rental_orders")
        .update({
          expected_return_date: newExpectedReturnDate,
          internal_notes: `Extended to ${newExpectedReturnDate}: ${reason}`,
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

// ── 3-party settlement mutation ─────────────────────────────────────────────

export function useUpdateRentalSettlement() {
  const qc = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      rental_order_id,
      ...patch
    }: Partial<RentalSettlement> & { id: string; rental_order_id: string }) => {
      await ensureFreshSession();

      const { data: result, error } = await (supabase as any)
        .from("rental_settlements")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result as RentalSettlement;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.byId(vars.rental_order_id) });
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
    },
  });
}

export function useCreateRentalSettlementParty() {
  const qc = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: RentalSettlementFormData) => {
      await ensureFreshSession();

      const { data: result, error } = await (supabase as any)
        .from("rental_settlements")
        .upsert({ ...data }, { onConflict: "rental_order_id,party_type" })
        .select()
        .single();
      if (error) throw error;
      return result as RentalSettlement;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.byId(vars.rental_order_id) });
      qc.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
      // rental_settlements are included in v_all_expenses via UNION — invalidate expenses cache
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

// ============================================
// HISTORICAL RENTAL RECORD
// ============================================

export function useCreateHistoricalRental() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: HistoricalRentalFormData) => {
      await ensureFreshSession();

      const { data: orderNumber, error: numError } = await supabase.rpc(
        "generate_rental_order_number",
        { p_site_id: data.site_id }
      );
      if (numError) throw new Error(`Failed to generate order number: ${numError.message}`);

      const inbound = data.inbound_transport;
      const outbound = data.outbound_transport;
      const inboundAmount = inbound?.amount ?? 0;
      const outboundAmount = outbound?.amount ?? 0;

      const isDraft = data.status === "draft";
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: order, error: orderError } = await supabase
        .from("rental_orders")
        .insert({
          site_id: data.site_id,
          vendor_id: data.vendor_id,
          rental_order_number: orderNumber,
          order_date: data.end_date || todayStr,
          start_date: data.start_date || todayStr,
          expected_return_date: data.end_date || undefined,
          actual_return_date: isDraft ? null : (data.end_date || null),
          status: isDraft ? "draft" : "completed",
          estimated_total: data.rental_total,
          actual_total: isDraft ? null : data.rental_total,
          exclude_start_date: data.exclude_start_date ?? false,
          transport_cost_outward: inboundAmount,
          transport_cost_return: outboundAmount,
          outward_by: inbound?.paid_to === "driver" ? "company" : inbound ? "vendor" : null,
          return_by: outbound?.paid_to === "driver" ? "company" : outbound ? "vendor" : null,
          vendor_slip_url: data.calculation_sheet_url ?? null,
          notes: data.bill_ref ? `Bill/Ref: ${data.bill_ref}` : null,
        })
        .select()
        .single();

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

      // Insert items if provided
      const excludeStart = data.exclude_start_date ?? false;
      const validItemsCreate = data.items.filter((it) => it.item_name.trim());
      if (validItemsCreate.length > 0) {
        const itemsToInsert = validItemsCreate.map((item) => {
          const startMs = data.start_date ? new Date(data.start_date).getTime() : Date.now();
          const itemEndDate = data.end_date
            ? new Date(startMs + (item.days - (excludeStart ? 0 : 1)) * 86400000)
                .toISOString().split("T")[0]
            : null;
          return {
            rental_order_id: order.id,
            rental_item_id: item.rental_item_id ?? null,
            item_name_override: item.item_name,
            quantity: item.quantity,
            daily_rate_default: item.daily_rate,
            daily_rate_actual: item.daily_rate,
            rate_type: "daily" as const,
            item_start_date: data.start_date || null,
            item_expected_return_date: itemEndDate,
            status: isDraft ? ("active" as const) : ("returned" as const),
            quantity_returned: isDraft ? 0 : item.quantity,
          };
        });

        const { error: itemsError } = await supabase
          .from("rental_order_items")
          .insert(itemsToInsert as any);

        if (itemsError) throw new Error(`Failed to create items: ${itemsError.message}`);
      }

      // Insert advances if provided
      if (data.advances.length > 0) {
        const advancesToInsert = data.advances.map((adv) => ({
          rental_order_id: order.id,
          advance_date: adv.advance_date,
          amount: adv.amount,
          payment_mode: adv.payment_mode,
          payment_channel: "direct",
          payer_source: adv.payer_source,
        }));

        const { error: advErr } = await supabase
          .from("rental_advances")
          .insert(advancesToInsert);

        if (advErr) throw new Error(`Failed to create advances: ${advErr.message}`);
      }

      // Insert settlement(s) if provided (skip for drafts)
      if (!isDraft && data.settlement) {
        const sett = data.settlement;
        const totalAdvances = data.advances.reduce((s, a) => s + a.amount, 0);

        // Vendor-paid transport = any inbound/outbound not paid to a separate driver
        const vendorTransport =
          (inbound?.paid_to === "vendor" ? inboundAmount : 0) +
          (outbound?.paid_to === "vendor" ? outboundAmount : 0);

        const { data: settRef } = await supabase.rpc(
          "generate_rental_settlement_reference",
          { p_site_id: data.site_id }
        );

        const { error: settErr } = await supabase
          .from("rental_settlements")
          .insert({
            rental_order_id: order.id,
            party_type: "vendor",
            settlement_date: sett.settlement_date,
            settlement_reference: settRef,
            total_rental_amount: data.rental_total,
            total_transport_amount: vendorTransport,
            total_damage_amount: 0,
            total_advance_paid: totalAdvances,
            balance_amount: sett.final_amount,
            payment_mode: sett.payment_mode,
            payment_channel: "direct",
            payer_source: sett.payer_source,
          });

        if (settErr) throw new Error(`Failed to create settlement: ${settErr.message}`);

        // Separate driver settlement(s) — each uses its own settlement details
        const driverSettlements: Array<{
          transport: HistoricalRentalFormData["inbound_transport"];
          label: string;
          driverSett: HistoricalRentalFormData["inbound_driver_settlement"];
        }> = [];
        if (inbound?.paid_to === "driver")
          driverSettlements.push({ transport: inbound, label: "Inbound", driverSett: data.inbound_driver_settlement });
        if (outbound?.paid_to === "driver")
          driverSettlements.push({ transport: outbound, label: "Outbound", driverSett: data.outbound_driver_settlement });

        for (const { transport, label, driverSett } of driverSettlements) {
          if (!transport || !driverSett) continue;
          const { data: driverRef } = await supabase.rpc(
            "generate_rental_settlement_reference",
            { p_site_id: data.site_id }
          );
          const { error: dErr } = await supabase
            .from("rental_settlements")
            .insert({
              rental_order_id: order.id,
              party_type: "transport",
              party_name: transport.driver_name ?? `${label} Driver`,
              settlement_date: driverSett.settlement_date,
              settlement_reference: driverRef,
              total_rental_amount: 0,
              total_transport_amount: transport.amount,
              total_damage_amount: 0,
              total_advance_paid: 0,
              balance_amount: driverSett.final_amount,
              payment_mode: driverSett.payment_mode,
              payment_channel: "direct",
              payer_source: driverSett.payer_source,
            });
          if (dErr) throw new Error(`Failed to create driver settlement: ${dErr.message}`);
        }
      }

      return order as RentalOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.bySite(data.site_id) });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useUpdateHistoricalRental() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: HistoricalRentalFormData }) => {
      await ensureFreshSession();

      const inbound = data.inbound_transport;
      const outbound = data.outbound_transport;
      const updStatus = data.status ?? "completed";

      const { error: orderError } = await supabase
        .from("rental_orders")
        .update({
          vendor_id: data.vendor_id,
          start_date: data.start_date || undefined,
          expected_return_date: data.end_date || undefined,
          actual_return_date: updStatus === "draft" ? null : (data.end_date || null),
          status: updStatus,
          estimated_total: data.rental_total,
          actual_total: updStatus === "draft" ? null : data.rental_total,
          exclude_start_date: data.exclude_start_date ?? false,
          transport_cost_outward: inbound?.amount ?? 0,
          transport_cost_return: outbound?.amount ?? 0,
          outward_by: inbound?.paid_to === "driver" ? "company" : inbound ? "vendor" : null,
          return_by: outbound?.paid_to === "driver" ? "company" : outbound ? "vendor" : null,
          vendor_slip_url: data.calculation_sheet_url ?? null,
          notes: data.bill_ref ? `Bill/Ref: ${data.bill_ref}` : null,
        })
        .eq("id", orderId);

      if (orderError) throw new Error(`Failed to update order: ${orderError.message}`);

      // Replace items: delete existing, re-insert
      const { error: delErr } = await supabase
        .from("rental_order_items")
        .delete()
        .eq("rental_order_id", orderId);
      if (delErr) throw new Error(`Failed to clear items: ${delErr.message}`);

      const validItemsUpd = data.items.filter((it) => it.item_name.trim());
      if (validItemsUpd.length > 0) {
        const excludeStartUpd = data.exclude_start_date ?? false;
        const itemsToInsert = validItemsUpd.map((item) => {
          const startMsUpd = data.start_date ? new Date(data.start_date).getTime() : Date.now();
          const itemEndDateUpd = data.end_date
            ? new Date(startMsUpd + (item.days - (excludeStartUpd ? 0 : 1)) * 86400000)
                .toISOString().split("T")[0]
            : null;
          return {
            rental_order_id: orderId,
            rental_item_id: item.rental_item_id ?? null,
            item_name_override: item.item_name,
            quantity: item.quantity,
            daily_rate_default: item.daily_rate,
            daily_rate_actual: item.daily_rate,
            rate_type: "daily" as const,
            item_start_date: data.start_date || null,
            item_expected_return_date: itemEndDateUpd,
            status: updStatus === "draft" ? ("active" as const) : ("returned" as const),
            quantity_returned: updStatus === "draft" ? 0 : item.quantity,
          };
        });
        const { error: itemsError } = await supabase
          .from("rental_order_items")
          .insert(itemsToInsert as any);
        if (itemsError) throw new Error(`Failed to update items: ${itemsError.message}`);
      }

      // Insert settlement(s) when completing a draft
      if (updStatus === "completed" && data.settlement) {
        const sett = data.settlement;
        const totalAdvances = data.advances.reduce((s, a) => s + a.amount, 0);
        const inboundAmt = inbound?.amount ?? 0;
        const outboundAmt = outbound?.amount ?? 0;
        const vendorTransport =
          (inbound?.paid_to === "vendor" ? inboundAmt : 0) +
          (outbound?.paid_to === "vendor" ? outboundAmt : 0);

        const { data: settRef } = await supabase.rpc(
          "generate_rental_settlement_reference",
          { p_site_id: data.site_id }
        );
        const { error: settErr } = await supabase
          .from("rental_settlements")
          .insert({
            rental_order_id: orderId,
            party_type: "vendor",
            settlement_date: sett.settlement_date,
            settlement_reference: settRef,
            total_rental_amount: data.rental_total,
            total_transport_amount: vendorTransport,
            total_damage_amount: 0,
            total_advance_paid: totalAdvances,
            balance_amount: sett.final_amount,
            payment_mode: sett.payment_mode,
            payment_channel: "direct",
            payer_source: sett.payer_source,
          });
        if (settErr) throw new Error(`Failed to create settlement: ${settErr.message}`);

        const driverSetts: Array<{
          transport: typeof inbound | typeof outbound;
          driverSett: HistoricalRentalFormData["inbound_driver_settlement"];
        }> = [];
        if (inbound?.paid_to === "driver")
          driverSetts.push({ transport: inbound, driverSett: data.inbound_driver_settlement });
        if (outbound?.paid_to === "driver")
          driverSetts.push({ transport: outbound, driverSett: data.outbound_driver_settlement });

        for (const { transport, driverSett } of driverSetts) {
          if (!transport || !driverSett) continue;
          const { data: driverRef } = await supabase.rpc(
            "generate_rental_settlement_reference",
            { p_site_id: data.site_id }
          );
          const { error: dErr } = await supabase
            .from("rental_settlements")
            .insert({
              rental_order_id: orderId,
              party_type: "transport",
              party_name: transport.driver_name ?? "Driver",
              settlement_date: driverSett.settlement_date,
              settlement_reference: driverRef,
              total_rental_amount: 0,
              total_transport_amount: transport.amount,
              total_damage_amount: 0,
              total_advance_paid: 0,
              balance_amount: driverSett.final_amount,
              payment_mode: driverSett.payment_mode,
              payment_channel: "direct",
              payer_source: driverSett.payer_source,
            });
          if (dErr) throw new Error(`Failed to create driver settlement: ${dErr.message}`);
        }
      }

      return orderId;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: rentalQueryKeys.orders.byId(orderId) });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}
