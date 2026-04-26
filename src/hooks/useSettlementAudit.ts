/**
 * useSettlementAudit
 *
 * Powers the AuditTab in the InspectPane. Synthesizes a chronological list
 * of audit events for a settlement from `settlement_groups` columns.
 *
 * Schema discovery (2026-04-26): the project has a generic `audit_log` table
 * keyed by `(table_name, record_id)`, but it currently has 0 rows for
 * `settlement_groups`, and a `settlement_creation_audit` table that only
 * tracks failed-creation attempts. Neither is suitable as a primary source.
 *
 * Therefore we use **path 2** from the design doc: derive 1–3 events directly
 * from the row's lifecycle columns:
 *   - `created`   — always present (uses `created_at` + `created_by_name`)
 *   - `edited`    — emitted when `updated_at` differs from `created_at`
 *   - `cancelled` — emitted when `is_cancelled = true` and `cancelled_at` set;
 *                   `cancellation_reason` (if any) is surfaced as `note`
 *
 * Note: the actual cancel-actor column on `settlement_groups` is `cancelled_by`
 * (text — holds a display name, not an id), NOT `cancelled_by_name` as the
 * plan's draft assumed. This file uses the real column name.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AuditEvent {
  timestamp: string;
  actorName: string;
  action: "created" | "edited" | "cancelled";
  note?: string;
}

export function useSettlementAudit(settlementRef: string | null) {
  const supabase = createClient();
  return useQuery<AuditEvent[]>({
    queryKey: ["settlement-audit", settlementRef],
    enabled: Boolean(settlementRef),
    staleTime: 60_000,
    queryFn: async (): Promise<AuditEvent[]> => {
      if (!settlementRef) return [];
      const { data, error } = await (supabase.from("settlement_groups") as any)
        .select(
          "created_at, updated_at, created_by_name, cancelled_at, cancelled_by, is_cancelled, cancellation_reason"
        )
        .eq("settlement_reference", settlementRef)
        .single();

      if (error) {
        // Not-found (e.g. ref not yet propagated) shouldn't crash the tab.
        if ((error as any).code === "PGRST116") return [];
        throw error;
      }
      if (!data) return [];

      const r: any = data;
      const events: AuditEvent[] = [];

      if (r.created_at) {
        events.push({
          timestamp: r.created_at,
          actorName: r.created_by_name ?? "Unknown",
          action: "created",
        });
      }

      if (r.updated_at && r.updated_at !== r.created_at) {
        events.push({
          timestamp: r.updated_at,
          actorName: r.created_by_name ?? "Unknown",
          action: "edited",
        });
      }

      if (r.is_cancelled && r.cancelled_at) {
        events.push({
          timestamp: r.cancelled_at,
          actorName: r.cancelled_by ?? "Unknown",
          action: "cancelled",
          note: r.cancellation_reason ?? undefined,
        });
      }

      // Ascending: oldest first, so the UI renders chronologically top-to-bottom.
      return events.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
    },
  });
}
