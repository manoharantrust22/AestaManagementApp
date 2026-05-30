"use client";

/**
 * /site/materials/inter-site — Inter-Site Settlement (Material Hub v2)
 *
 * How material costs reconcile between sites that share group purchases. A debt
 * ledger between cluster sites: You-owe / NET / Others-owe-you hero, a worked
 * netting example, the cluster chips strip, and the running shared-batches grid.
 *
 * Numbers are sourced from the settlement engine's source of truth
 * (batch_usage_records, via useClusterInterSiteDebt) so the displayed net equals
 * what actually settles. "Net settle" drives the existing NetSettlementDialog /
 * useNetSettlement write (records the settlement, posts both ledgers, flips usage
 * rows). Mirrors `ProtoInterSite` in docs/design_handoff_intersite/proto-screens.jsx.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckIcon from "@mui/icons-material/Check";
import { useSelectedSite } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { useClusterInterSiteDebt } from "@/hooks/queries/useClusterInterSiteDebt";
import { useClusterSharedBatches } from "@/hooks/queries/useClusterSharedBatches";
import InterSiteBalanceCard from "@/components/inter-site/InterSiteBalanceCard";
import NettingMathPanel from "@/components/inter-site/NettingMathPanel";
import SiteChipsStrip from "@/components/inter-site/SiteChipsStrip";
import SharedBatchCard from "@/components/inter-site/SharedBatchCard";
import NetSettlementDialog from "@/components/materials/NetSettlementDialog";

export default function InterSiteSettlementV2Page() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;

  const cluster = useClusterInterSiteDebt(siteId);
  const sharedBatchesQ = useClusterSharedBatches(cluster.groupId);

  const [settleOpen, setSettleOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canSettle =
    cluster.netAmount > 0 &&
    !!cluster.groupId &&
    !!cluster.otherSite &&
    !!cluster.balanceOthersOweMe &&
    !!cluster.balanceIOweOthers;

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Select a site to view inter-site settlement.</Alert>
      </Box>
    );
  }

  const shell = (children: React.ReactNode) => (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        padding: { xs: "14px 14px 80px", md: "18px 22px 80px" },
        minHeight: 0,
      }}
    >
      {/* Back to Hub */}
      <Button
        onClick={() => router.push("/site/materials/hub")}
        startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
        sx={{
          textTransform: "none",
          color: hubTokens.muted,
          fontWeight: 600,
          fontSize: 12.5,
          mb: 1,
          minWidth: 0,
          px: 1,
        }}
      >
        Back to Hub
      </Button>
      {children}
    </Box>
  );

  if (cluster.isLoading) {
    return shell(
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!cluster.isInGroup) {
    return shell(
      <Alert severity="info">
        This site isn&apos;t part of a cluster, so there are no inter-site material
        debts to settle. Sites that share group purchases will show up here.
      </Alert>
    );
  }

  if (cluster.isError) {
    return shell(
      <Alert severity="error">
        Failed to load inter-site balances. Please retry.
      </Alert>
    );
  }

  const mySite = cluster.mySite!;
  const batches = sharedBatchesQ.data ?? [];

  return shell(
    <>
      <PageHeader
        title="Inter-Site Settlement"
        subtitle="How material costs reconcile between sites that share group purchases."
        showBack={false}
        titleChip={
          <Chip
            size="small"
            label={cluster.groupName ?? "Cluster"}
            icon={
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: hubTokens.pink,
                  ml: "8px !important",
                }}
              />
            }
            sx={{
              background: hubTokens.pinkSoft,
              color: hubTokens.pink,
              fontWeight: 600,
              fontSize: 11,
              height: 22,
            }}
          />
        }
        actions={
          canSettle ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckIcon sx={{ fontSize: 16 }} />}
              onClick={() => setSettleOpen(true)}
              sx={{
                textTransform: "none",
                background: hubTokens.primary,
                fontWeight: 700,
                fontSize: 13,
                "&:hover": { background: hubTokens.primaryHover },
              }}
            >
              Net settle {inr(cluster.netAmount)}
            </Button>
          ) : undefined
        }
      />

      <InterSiteBalanceCard
        debt={cluster.debt}
        youOweCount={cluster.youOweCount}
        owedToYouCount={cluster.owedToYouCount}
      />

      <NettingMathPanel
        debt={cluster.debt}
        mySiteId={mySite.id}
        mySiteName={mySite.name}
        mySiteShort={mySite.short}
        mySiteAccent={mySite.accent}
        otherSiteName={cluster.otherSite?.name ?? "Cluster"}
        otherSiteShort={cluster.otherSite?.short ?? "—"}
        otherSiteAccent={cluster.otherSite?.accent ?? hubTokens.pink}
        onNetSettle={canSettle ? () => setSettleOpen(true) : undefined}
      />

      <SiteChipsStrip
        mySite={mySite}
        otherSite={cluster.otherSite}
        netAmount={cluster.netAmount}
        netPayer={cluster.netPayer}
        netReceiver={cluster.netReceiver}
      />

      {/* Shared batches · the running record */}
      <Box
        sx={{
          background: hubTokens.card,
          border: `1px solid ${hubTokens.border}`,
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <Box sx={{ padding: "14px 18px", borderBottom: `1px solid ${hubTokens.border}` }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.text }}>
            Shared batches · in use
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginTop: "2px" }}>
            Each batch tracks who paid for it and which sites consumed it. Debt accrues
            automatically as usage is logged.
          </Typography>
        </Box>

        {sharedBatchesQ.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : batches.length === 0 ? (
          <Box sx={{ padding: "30px 20px", textAlign: "center" }}>
            <Typography sx={{ fontSize: 12.5, color: hubTokens.muted }}>
              No active group batches with cross-site usage. Batches show up here while
              they&apos;re still in use and have been consumed by more than one site.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: "12px",
              padding: "14px 16px",
            }}
          >
            {batches.map((b) => (
              <SharedBatchCard
                key={b.batchCode}
                batch={b}
                siteMetaById={cluster.siteMetaById}
              />
            ))}
          </Box>
        )}
      </Box>

      {canSettle && (
        <NetSettlementDialog
          open={settleOpen}
          onClose={() => setSettleOpen(false)}
          balanceA={cluster.balanceOthersOweMe!}
          balanceB={cluster.balanceIOweOthers!}
          groupId={cluster.groupId!}
          debtorSiteId={cluster.netPayer?.id}
          onSuccess={() => {
            setSettleOpen(false);
            setToast("Inter-site settlement recorded.");
          }}
        />
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setToast(null)} sx={{ width: "100%" }}>
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
}
