"use client";

/**
 * "Raised · awaiting payment" panel for the inter-site settlement page.
 *
 * Net-settle (the page's hero) handles cross-site usage that hasn't been put
 * into a settlement yet. A settlement that was already GENERATED (via the Hub's
 * "Generate settlement") sits as raised-but-unpaid and is excluded from the
 * pending-usage balance — so without this panel it would be stranded on this
 * page. Here it is shown by MATERIAL, netted to match the Hub, and payable:
 *  - each raised settlement → Record payment (cash / UPI / bank / offset).
 *  - a reciprocal pair (debt both ways) → one-click "Net & settle": offset the
 *    smaller into the larger (adjustment payments via the existing mutation),
 *    then record the net remainder on the larger.
 */

import { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Alert,
} from "@mui/material";
import { ArrowForward as ArrowIcon } from "@mui/icons-material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRaisedInterSiteSettlements,
  useRecordSettlementPayment,
  type RaisedInterSiteSettlement,
} from "@/hooks/queries/useInterSiteSettlements";
import {
  summarizeOutstanding,
  type OutstandingLeg,
} from "@/lib/material-hub/interSiteOutstanding";
import {
  reciprocalRaisedPairs,
  type ReciprocalPair,
} from "@/lib/material-hub/raisedNetSettle";
import RecordInterSitePaymentDialog from "@/components/materials/RecordInterSitePaymentDialog";

export default function RaisedSettlementsPanel({ groupId }: { groupId: string | null }) {
  const { userProfile } = useAuth();
  const { data: raised = [] } = useRaisedInterSiteSettlements(groupId ?? undefined);
  const recordPayment = useRecordSettlementPayment();
  const [active, setActive] = useState<RaisedInterSiteSettlement | null>(null);
  const [confirmPair, setConfirmPair] =
    useState<ReciprocalPair<RaisedInterSiteSettlement> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (raised.length === 0) return null;

  // Net summary — same netting the Hub strip uses, so the numbers match.
  const legs: OutstandingLeg[] = raised.map((s) => ({
    creditorSiteId: s.creditor_site_id,
    creditorName: s.creditor_site_name,
    debtorSiteId: s.debtor_site_id,
    debtorName: s.debtor_site_name,
    materialId: "",
    materialName: s.materials,
    amount: s.pending_amount,
    raised: true,
  }));
  const netLines = summarizeOutstanding(legs).netLines;
  const pairs = reciprocalRaisedPairs(raised);

  const runOffset = async () => {
    if (!confirmPair) return;
    setBusy(true);
    setErr(null);
    try {
      const { larger, smaller, offsetAmount, netAmount } = confirmPair;
      const today = new Date().toISOString().slice(0, 10);
      // Cancel the reciprocal: an adjustment offset on BOTH (settles the smaller
      // in full; the larger keeps the net remainder). Reuses the proven payment
      // mutation — no new settle engine.
      await recordPayment.mutateAsync({
        settlement_id: smaller.id,
        amount: offsetAmount,
        payment_date: today,
        payment_mode: "adjustment" as never,
        reference_number: `NET-${larger.settlement_code}`,
        notes: `Reciprocal offset against ${larger.settlement_code}.`,
        userId: userProfile?.id,
      });
      await recordPayment.mutateAsync({
        settlement_id: larger.id,
        amount: offsetAmount,
        payment_date: today,
        payment_mode: "adjustment" as never,
        reference_number: `NET-${smaller.settlement_code}`,
        notes: `Reciprocal offset against ${smaller.settlement_code}.`,
        userId: userProfile?.id,
      });
      setConfirmPair(null);
      // Pay the net remainder on the larger (skip when equal → already settled).
      if (netAmount > 0.005) setActive(larger);
    } catch (e) {
      setErr((e as Error)?.message ?? "Couldn't offset the settlements");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        background: hubTokens.card,
        border: `1px solid ${hubTokens.warn}`,
        borderRadius: "12px",
        overflow: "hidden",
        mb: 2,
      }}
    >
      <Box sx={{ padding: "14px 18px", borderBottom: `1px solid ${hubTokens.border}` }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.warn }}>
          Raised · awaiting payment ({raised.length})
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginTop: "2px" }}>
          Already generated but not yet paid — separate from the net-settle above (which covers
          usage not yet raised). No money has moved and the per-site material expense isn&apos;t
          posted until you record the payment.
        </Typography>
        {netLines.map((n) => (
          <Box
            key={`${n.owerSiteId}-${n.owedSiteId}`}
            sx={{
              mt: 1,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <Typography sx={{ fontSize: 13, color: hubTokens.text, fontWeight: 600 }}>
              Net: <strong>{n.owerName}</strong> owes <strong>{n.owedName}</strong>{" "}
              <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 800 }}>
                {inr(n.amount)}
              </Box>
            </Typography>
            {pairs
              .filter((p) => p.owerSiteId === n.owerSiteId && p.owedSiteId === n.owedSiteId)
              .map((p) => (
                <Button
                  key={p.larger.id}
                  size="small"
                  variant="contained"
                  color="warning"
                  onClick={() => setConfirmPair(p)}
                  sx={{ textTransform: "none", flexShrink: 0 }}
                >
                  {p.netAmount > 0.005
                    ? `Net & settle ${inr(p.netAmount)}`
                    : `Cancel reciprocal ${inr(p.offsetAmount)}`}
                </Button>
              ))}
          </Box>
        ))}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {raised.map((s) => {
          const partlyPaid = s.paid_amount > 0;
          return (
            <Box
              key={s.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                padding: "12px 18px",
                borderBottom: `1px solid ${hubTokens.hairline}`,
                "&:last-of-type": { borderBottom: 0 },
              }}
            >
              <Box sx={{ minWidth: 0, mr: "auto" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13, color: hubTokens.text, fontWeight: 600 }}>
                    <strong>{s.debtor_site_name}</strong> owes{" "}
                    <strong>{s.creditor_site_name}</strong>{" "}
                    <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 800 }}>
                      {inr(s.pending_amount)}
                    </Box>
                  </Typography>
                  {s.materials && (
                    <Chip
                      size="small"
                      label={s.materials}
                      sx={{ height: 18, fontSize: 10.5, fontWeight: 600 }}
                    />
                  )}
                </Box>
                <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
                  <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
                    {s.settlement_code}
                  </Box>
                  {partlyPaid ? ` · ${inr(s.paid_amount)} of ${inr(s.total_amount)} paid` : ""}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                endIcon={<ArrowIcon fontSize="small" />}
                onClick={() => setActive(s)}
                sx={{ textTransform: "none", flexShrink: 0 }}
              >
                Record payment
              </Button>
            </Box>
          );
        })}
      </Box>

      {/* Net & settle confirmation */}
      <Dialog open={!!confirmPair} onClose={() => (busy ? null : setConfirmPair(null))} maxWidth="xs" fullWidth>
        <DialogTitle>Net & settle</DialogTitle>
        <DialogContent>
          {confirmPair && (
            <DialogContentText component="div" sx={{ fontSize: 13 }}>
              <Box sx={{ mb: 1 }}>
                <strong>{confirmPair.smaller.debtor_site_name}</strong> owes{" "}
                {confirmPair.smaller.creditor_site_name}{" "}
                <strong>{inr(confirmPair.smaller.pending_amount)}</strong> cancels into{" "}
                <strong>{confirmPair.larger.debtor_site_name}</strong> owes{" "}
                {confirmPair.larger.creditor_site_name}{" "}
                <strong>{inr(confirmPair.larger.pending_amount)}</strong>.
              </Box>
              <Box>
                Offset <strong>{inr(confirmPair.offsetAmount)}</strong> on both
                {confirmPair.netAmount > 0.005 ? (
                  <>
                    , then record the net <strong>{inr(confirmPair.netAmount)}</strong> (
                    {confirmPair.owerName} → {confirmPair.owedName}) on the next screen.
                  </>
                ) : (
                  <> — the debts are equal, so this settles both.</>
                )}
              </Box>
              {err && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  {err}
                </Alert>
              )}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPair(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" color="warning" onClick={runOffset} disabled={busy}>
            {busy ? <CircularProgress size={18} /> : "Offset & continue"}
          </Button>
        </DialogActions>
      </Dialog>

      {active && (
        <RecordInterSitePaymentDialog
          open={!!active}
          onClose={() => setActive(null)}
          settlementId={active.id}
          debtorSiteId={active.debtor_site_id}
          debtorSiteName={active.debtor_site_name}
          creditorSiteId={active.creditor_site_id}
          creditorSiteName={active.creditor_site_name}
          amount={active.total_amount}
        />
      )}
    </Box>
  );
}
