/**
 * Site domain types
 *
 * Site-level types beyond what database.types.ts gives us. Currently
 * focused on Site Additional Works (variation orders) — used by the
 * client-payments page redesign and the Site Money Overview hero.
 */
import type { Database } from "./database.types";

// ============================================
// SITE ADDITIONAL WORKS (variation orders)
// ============================================

export type SiteAdditionalWork =
  Database["public"]["Tables"]["site_additional_works"]["Row"];

export type SiteAdditionalWorkInsert =
  Database["public"]["Tables"]["site_additional_works"]["Insert"];

export type SiteAdditionalWorkUpdate =
  Database["public"]["Tables"]["site_additional_works"]["Update"];

export type AdditionalWorkStatus =
  Database["public"]["Enums"]["additional_work_status"];

export const ADDITIONAL_WORK_STATUS_LABELS: Record<AdditionalWorkStatus, string> = {
  quoted: "Quoted",
  confirmed: "Confirmed",
  paid: "Paid",
  cancelled: "Cancelled",
};
