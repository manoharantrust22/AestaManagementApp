import { useMemo } from "react";
import { useSelectedSite } from "@/contexts/SiteContext/SelectedSiteContext";

export type LegacyStatus = "none" | "auditing" | "reconciled";
export type AuditPeriod = "all" | "legacy" | "current";

export interface SiteAuditState {
  /** Current lifecycle stage of the selected site. */
  legacyStatus: LegacyStatus;
  /** ISO date string (YYYY-MM-DD) — the cutoff between legacy and current. NULL when status='none'. */
  dataStartedAt: string | null;
  /** True when status='auditing' AND a cutoff is set — UI should render the two-band layout. */
  isAuditing: boolean;
  /** True when status='reconciled' — audit done, but the cutoff date may still be useful for showing
   *  an "Opening balance as of <date>" row when laborer_opening_balances has rows for this site. */
  isReconciled: boolean;
}

/**
 * Derives the per-site audit lifecycle from the SelectedSiteContext.
 * No new RPC needed — sites.legacy_status + sites.data_started_at are returned as
 * part of the standard site row (added in 20260504100000_add_site_audit_lifecycle).
 *
 * Note: TypeScript types from `Database["public"]["Tables"]["sites"]["Row"]` may not
 * yet include the new columns until `npx supabase gen types` is re-run, so we read
 * via `as any` here. Runtime data from PostgREST always includes all columns.
 */
export function useSiteAuditState(): SiteAuditState {
  const { selectedSite } = useSelectedSite();
  return useMemo<SiteAuditState>(() => {
    const site = selectedSite as any;
    const legacyStatus = (site?.legacy_status ?? "none") as LegacyStatus;
    const dataStartedAt = (site?.data_started_at ?? null) as string | null;
    return {
      legacyStatus,
      dataStartedAt,
      isAuditing: legacyStatus === "auditing" && Boolean(dataStartedAt),
      isReconciled: legacyStatus === "reconciled",
    };
  }, [selectedSite]);
}
