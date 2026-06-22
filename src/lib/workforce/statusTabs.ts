/**
 * Future / Active / Completed tabs for the Workforce Workspace.
 *
 * Maps the existing `contract_status` (and the structurally-identical task-work
 * status) enum onto three review buckets so the active workspace stays clean,
 * completed work is reviewable in one place, and not-yet-started work can be
 * *planned* ("Future") then promoted to Active. `cancelled` belongs to no tab —
 * it returns null and is filtered out everywhere.
 *
 * Pure (no React) so it stays unit-testable and importable from the model.
 */
import type { ContractStatus } from "@/types/trade.types";
import type { TaskWorkStatus } from "@/types/taskWork.types";

export type StatusTab = "future" | "active" | "completed";

export const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "future", label: "Future" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

/** The tab shown on first load — the live workspace. */
export const DEFAULT_STATUS_TAB: StatusTab = "active";

/**
 * Bucket a contract / package status into its tab.
 *  - `draft`              → "future" (planned, not yet agreed/started)
 *  - `active` | `on_hold` → "active" (the live workspace)
 *  - `completed`          → "completed"
 *  - `cancelled`          → null (shown in no tab)
 */
export function statusBucket(
  status: ContractStatus | TaskWorkStatus
): StatusTab | null {
  switch (status) {
    case "draft":
      return "future";
    case "active":
    case "on_hold":
      return "active";
    case "completed":
      return "completed";
    default:
      return null; // cancelled
  }
}

/** Empty-state copy when a tab has nothing to show. */
export const EMPTY_TAB_COPY: Record<StatusTab, string> = {
  future: "Nothing planned yet",
  active: "No active work yet",
  completed: "Nothing completed yet",
};
