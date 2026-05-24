/**
 * useRentalThreads — hub-shaped data hook for /site/rentals/v2.
 *
 * Wraps useRentalOrders (single Supabase query joining vendor + items +
 * advances + settlements) and applies mapRentalOrderToThread to produce
 * RentalThread[]. Also returns a Map keyed by RentalOrder.id so dialogs
 * triggered from a thread row can hand off the original prod row to existing
 * v1 dialogs without an extra fetch.
 *
 * No new Supabase round-trip — this hook is pure compose.
 *
 * Note: the underlying useRentalOrders query does NOT join rental_returns.
 * That's intentional — row-level UI only needs `quantity_returned` per item
 * (on rental_order_items, which IS joined). The return-event log is fetched
 * on demand by useRentalOrder (singular) when the user opens RecordReturn or
 * an expanded view.
 */

import { useMemo } from "react";
import { useRentalOrders } from "@/hooks/queries/useRentals";
import type { RentalOrderWithDetails } from "@/types/rental.types";
import { mapRentalOrderToThread } from "@/lib/rental-hub/threadAdapter";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

export interface UseRentalThreadsResult {
  threads: RentalThread[];
  rentalOrderById: Map<string, RentalOrderWithDetails>;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useRentalThreads(
  siteId: string | undefined,
): UseRentalThreadsResult {
  const {
    data: orders = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRentalOrders(siteId ?? "", undefined, { enabled: !!siteId });

  const threads = useMemo(() => orders.map(mapRentalOrderToThread), [orders]);

  const rentalOrderById = useMemo(
    () => new Map(orders.map((o) => [o.id, o])),
    [orders],
  );

  return {
    threads,
    rentalOrderById,
    isLoading,
    isError,
    error,
    refetch: () => {
      void refetch();
    },
  };
}
