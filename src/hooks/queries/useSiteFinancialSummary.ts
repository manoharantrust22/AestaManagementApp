"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SiteFinancialSummary {
  baseContract: number;
  additionalWorksConfirmed: number;
  totalContract: number;
  clientPaid: number;
  remainingFromClient: number;
  supervisorCost: number;
  netInHand: number;
  progressPct: number;
}

export function useSiteFinancialSummary(siteId: string | undefined) {
  return useQuery({
    queryKey: ["site-financial-summary", siteId],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async (): Promise<SiteFinancialSummary> => {
      const supabase = createClient();

      const [siteRes, paymentsRes, worksRes, supervisorRes] = await Promise.all([
        supabase.from("sites").select("project_contract_value").eq("id", siteId!).single(),
        supabase.from("client_payments").select("amount").eq("site_id", siteId!),
        supabase.from("site_additional_works").select("confirmed_amount, status").eq("site_id", siteId!),
        supabase.rpc("get_site_supervisor_cost", { p_site_id: siteId! }),
      ]);

      if (siteRes.error) throw siteRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (worksRes.error) throw worksRes.error;
      if (supervisorRes.error) throw supervisorRes.error;

      const baseContract = Number(siteRes.data?.project_contract_value ?? 0);

      const additionalWorksConfirmed = (worksRes.data ?? [])
        .filter((w) => w.status !== "cancelled" && w.confirmed_amount != null)
        .reduce((sum, w) => sum + Number(w.confirmed_amount), 0);

      const totalContract = baseContract + additionalWorksConfirmed;

      const clientPaid = (paymentsRes.data ?? [])
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

      const remainingFromClient = Math.max(0, totalContract - clientPaid);

      const supervisorCost = Number(supervisorRes.data ?? 0);
      const netInHand = clientPaid - supervisorCost;

      const progressPct = totalContract > 0
        ? Math.min(100, Math.round((clientPaid / totalContract) * 100))
        : 0;

      return {
        baseContract,
        additionalWorksConfirmed,
        totalContract,
        clientPaid,
        remainingFromClient,
        supervisorCost,
        netInHand,
        progressPct,
      };
    },
  });
}
