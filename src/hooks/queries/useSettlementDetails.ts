/**
 * useSettlementDetails
 *
 * Powers the SettlementTab in the InspectPane. Fetches a single settlement
 * group by its `settlement_reference` and projects only the fields the
 * InspectPane needs (read-only summary rows + an optional linked-expense
 * callout).
 *
 * Schema source: settlement_groups (see SettlementRefDetailDialog for the
 * canonical full read).
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SettlementDetailsData {
  settledOn: string | null; // settlement_date (YYYY-MM-DD)
  payerName: string | null;
  paymentMode: string | null; // raw enum value, formatted at the view layer
  channel: string | null; // payment_channel (raw enum value)
  recordedByName: string | null;
  linkedExpenseRef: string | null; // subcontract_id or similar reference
}

function getPaymentModeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null;
  switch (mode) {
    case "upi":
      return "UPI";
    case "cash":
      return "Cash";
    case "net_banking":
      return "Net Banking";
    case "company_direct_online":
      return "Direct (Online)";
    case "via_site_engineer":
      return "Via Engineer";
    default:
      return mode;
  }
}

function getPaymentChannelLabel(channel: string | null | undefined): string | null {
  if (!channel) return null;
  switch (channel) {
    case "direct":
      return "Direct Payment";
    case "engineer_wallet":
      return "Via Engineer Wallet";
    default:
      return channel;
  }
}

function getPayerSourceLabel(
  source: string | null | undefined,
  customName: string | null | undefined
): string | null {
  if (!source) return customName ?? null;
  switch (source) {
    case "own_money":
      return "Own Money";
    case "amma_money":
    case "mothers_money":
      return "Amma Money";
    case "client_money":
      return "Client Money";
    case "trust_account":
      return "Trust Account";
    case "other_site_money":
      return customName || "Other Site Money";
    case "custom":
      return customName || "Custom";
    default:
      return customName || source;
  }
}

export function useSettlementDetails(
  settlementRef: string | null,
  siteId: string
) {
  const supabase = createClient();
  return useQuery<SettlementDetailsData | null>({
    queryKey: ["inspect-settlement-details", settlementRef, siteId],
    enabled: Boolean(settlementRef),
    staleTime: 60_000,
    queryFn: async (): Promise<SettlementDetailsData | null> => {
      if (!settlementRef) return null;
      const { data, error } = await (supabase.from("settlement_groups") as any)
        .select(
          "settlement_date, payer_source, payer_name, payment_mode, payment_channel, created_by_name, subcontract_id"
        )
        .eq("settlement_reference", settlementRef)
        .single();
      if (error) {
        // Not-found shouldn't crash the tab — return null and let the view
        // render placeholders.
        if ((error as any).code === "PGRST116") return null;
        throw error;
      }
      if (!data) return null;
      const r: any = data;
      return {
        settledOn: r.settlement_date ?? null,
        payerName: getPayerSourceLabel(r.payer_source, r.payer_name),
        paymentMode: getPaymentModeLabel(r.payment_mode),
        channel: getPaymentChannelLabel(r.payment_channel),
        recordedByName: r.created_by_name ?? null,
        linkedExpenseRef: r.subcontract_id ?? null,
      };
    },
  });
}
