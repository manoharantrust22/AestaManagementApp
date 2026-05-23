"use client";

import React, { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import { useWeekContractSubcontracts } from "@/hooks/queries/useWeekContractSubcontracts";
import { processContractPayment } from "@/lib/services/settlementService";
import SettleViaWalletDialog from "./SettleViaWalletDialog";

interface ContractSettleViaWalletProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  siteId: string;
  engineerId: string;
  /** Pre-selected subcontract (e.g. the contract scope from TradeSettlementView). */
  subcontractId?: string | null;
  /** Outstanding wages for the week — pre-fills the amount field. */
  suggestedAmount?: number;
  /** ISO week start date — narrows subcontract auto-pick to candidates with attendance this week. */
  weekStart?: string;
  /** ISO week end date. */
  weekEnd?: string;
}

/**
 * Thin contract-payment glue around SettleViaWalletDialog. Owns the week
 * subcontract auto-pick, laborer_id lookup, processContractPayment call,
 * and the salary-waterfall cache invalidations so contract-wallet callers
 * (payments page, TradeSettlementView, MestriSettleDialog → wallet
 * affordance) share the same orchestration.
 */
export default function ContractSettleViaWallet({
  open,
  onClose,
  onSuccess,
  siteId,
  engineerId,
  subcontractId: initialSubcontractId,
  suggestedAmount = 0,
  weekStart,
  weekEnd,
}: ContractSettleViaWalletProps) {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const { data: subcontracts } = useSiteSubcontracts(siteId);
  const { data: weekSubcontractIds } = useWeekContractSubcontracts(
    siteId,
    weekStart,
    weekEnd,
  );

  const autoPickedId = useMemo(() => {
    if (initialSubcontractId) return initialSubcontractId;
    if (!subcontracts || subcontracts.length === 0) return null;
    const candidates = weekSubcontractIds?.length
      ? subcontracts.filter((s) => weekSubcontractIds.includes(s.id))
      : subcontracts;
    return candidates.length === 1 ? candidates[0].id : null;
  }, [initialSubcontractId, subcontracts, weekSubcontractIds]);

  const weekLabel =
    weekStart && weekEnd
      ? `${dayjs(weekStart).format("D MMM")} – ${dayjs(weekEnd).format("D MMM")}`
      : undefined;

  return (
    <SettleViaWalletDialog
      open={open}
      onClose={onClose}
      onSuccess={() => {
        void queryClient.invalidateQueries({ queryKey: ["salary-settlements"] });
        void queryClient.invalidateQueries({ queryKey: ["contract-payments"] });
        void queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
        void queryClient.invalidateQueries({ queryKey: ["salary-slice-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
        void queryClient.invalidateQueries({ queryKey: ["payment-summary"] });
        onSuccess?.();
      }}
      siteId={siteId}
      engineerId={engineerId}
      amount={suggestedAmount}
      editableAmount
      enableSubcontractLink
      initialSubcontractId={autoPickedId}
      summary={weekLabel}
      onConfirm={async (payload) => {
        if (!userProfile) throw new Error("Not signed in");
        if (!payload.subcontractId) {
          throw new Error("Pick a subcontract / mestri to settle.");
        }
        const { data: subRow, error: subErr } = await supabase
          .from("subcontracts")
          .select("laborer_id")
          .eq("id", payload.subcontractId)
          .single();
        if (subErr) throw subErr;
        const laborerId = (subRow as { laborer_id: string | null })?.laborer_id;
        if (!laborerId) {
          throw new Error(
            "This subcontract has no laborer (mestri) attached — ask admin to assign one.",
          );
        }
        const sc = subcontracts?.find((s) => s.id === payload.subcontractId);
        const result = await processContractPayment(supabase, {
          siteId: payload.siteId,
          laborerId,
          laborerName: sc?.laborer_name ?? "Mestri",
          amount: payload.amount,
          paymentType: "salary",
          actualPaymentDate: payload.paymentDate,
          paymentForDate: payload.paymentDate,
          paymentMode: "cash",
          paymentChannel: "engineer_wallet",
          payer: {
            mode: "single",
            source: payload.payerSource,
            name: payload.customPayerName || undefined,
          },
          engineerId: payload.engineerId,
          notes: payload.notes,
          subcontractId: payload.subcontractId,
          userId: userProfile.id,
          userName: userProfile.name || userProfile.email || "Unknown",
        });
        if (!result.success) throw new Error(result.error || "Settlement failed");
      }}
    />
  );
}
