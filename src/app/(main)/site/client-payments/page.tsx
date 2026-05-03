"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box, CircularProgress, Tab, Tabs, Alert,
} from "@mui/material";
import PageHeader from "@/components/layout/PageHeader";
import { useSite } from "@/contexts/SiteContext";
import { useSiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";
import { useSiteAdditionalWorks } from "@/hooks/queries/useSiteAdditionalWorks";
import { useClientPayments } from "@/hooks/queries/useClientPayments";
import SiteMoneyOverviewHero from "@/components/client-payments/SiteMoneyOverviewHero";
import ContractTab from "@/components/client-payments/ContractTab";
import AdditionalWorksTab from "@/components/client-payments/AdditionalWorksTab";
import PaymentsReceivedTab from "@/components/client-payments/PaymentsReceivedTab";

type TabKey = "contract" | "additional" | "payments";

const TAB_STORAGE_KEY = "client-payments.activeTab";

export default function ClientPaymentsPage() {
  const { selectedSite } = useSite();
  const siteId = selectedSite?.id;

  // Persisted active tab. Hydrate on mount only — keep server render and
  // first client render aligned to "contract" to avoid hydration drift.
  const [tab, setTab] = useState<TabKey>("contract");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY) as TabKey | null;
    if (stored === "contract" || stored === "additional" || stored === "payments") {
      setTab(stored);
    }
  }, []);

  const setTabPersistent = (next: TabKey) => {
    setTab(next);
    try { window.localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* ignore quota / private mode */ }
  };

  const summaryQ  = useSiteFinancialSummary(siteId);
  const worksQ    = useSiteAdditionalWorks(siteId);
  const paymentsQ = useClientPayments(siteId);

  // v1: phases not fetched. Empty array renders the "no phases" alert in ContractTab.
  const phases: never[] = [];
  const paidByPhaseId = useMemo(() => new Map<string, number>(), []);

  const works    = worksQ.data    ?? [];
  const payments = paymentsQ.data ?? [];

  // Build per-additional-work paid totals (sum of payments tagged to each work).
  const paidByWorkId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) {
      if (p.tagged_additional_work_id) {
        m.set(
          p.tagged_additional_work_id,
          (m.get(p.tagged_additional_work_id) ?? 0) + Number(p.amount ?? 0),
        );
      }
    }
    return m;
  }, [payments]);

  if (!siteId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Select a site from the picker to view client payments.</Alert>
      </Box>
    );
  }

  const loading = summaryQ.isLoading || worksQ.isLoading || paymentsQ.isLoading;
  const errorObj = summaryQ.error ?? worksQ.error ?? paymentsQ.error;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title={`Client Payments — ${selectedSite?.name ?? ""}`} />

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : errorObj ? (
        <Box sx={{ p: 3 }}>
          <Alert severity="error">{(errorObj as Error).message}</Alert>
        </Box>
      ) : (
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {summaryQ.data && (
            <SiteMoneyOverviewHero siteId={siteId} summary={summaryQ.data} />
          )}

          <Tabs
            value={tab}
            onChange={(_, v: TabKey) => setTabPersistent(v)}
            sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
          >
            <Tab value="contract"   label="Contract" />
            <Tab value="additional" label={`Additional Works${works.length ? ` (${works.length})` : ""}`} />
            <Tab value="payments"   label={`Payments Received${payments.length ? ` (${payments.length})` : ""}`} />
          </Tabs>

          {tab === "contract" && (
            <ContractTab
              baseContract={summaryQ.data?.baseContract ?? 0}
              contractDocumentUrl={null}
              phases={phases}
              paidByPhaseId={paidByPhaseId}
            />
          )}
          {tab === "additional" && (
            <AdditionalWorksTab
              siteId={siteId}
              works={works}
              paidByWorkId={paidByWorkId}
            />
          )}
          {tab === "payments" && (
            <PaymentsReceivedTab
              siteId={siteId}
              payments={payments}
              phases={phases}
              additionalWorks={works}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
