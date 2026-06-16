"use client";

/**
 * "Raised · awaiting payment" panel for the inter-site settlement page.
 *
 * Net-settle (the page's hero) handles cross-site usage that hasn't been put
 * into a settlement yet. But a settlement that was already GENERATED (via the
 * Hub's "Generate settlement") sits as raised-but-unpaid and is excluded from
 * the pending-usage balance — so without this panel it would be stranded and
 * unpayable on this page. Here each raised settlement is listed with a
 * Record-payment action (cash, UPI, bank, or offset-against-a-purchase), reusing
 * the existing RecordInterSitePaymentDialog.
 */

import { useState } from "react";
import { Box, Typography, Button } from "@mui/material";
import { ArrowForward as ArrowIcon } from "@mui/icons-material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import {
  useRaisedInterSiteSettlements,
  type RaisedInterSiteSettlement,
} from "@/hooks/queries/useInterSiteSettlements";
import RecordInterSitePaymentDialog from "@/components/materials/RecordInterSitePaymentDialog";

export default function RaisedSettlementsPanel({ groupId }: { groupId: string | null }) {
  const { data: raised = [] } = useRaisedInterSiteSettlements(groupId ?? undefined);
  const [active, setActive] = useState<RaisedInterSiteSettlement | null>(null);

  if (raised.length === 0) return null;

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
          Already generated but not yet paid. No money has moved and the per-site material
          expense isn&apos;t posted until you record the payment (cash, UPI, bank, or offset
          against a purchase).
        </Typography>
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
                <Typography sx={{ fontSize: 13, color: hubTokens.text, fontWeight: 600 }}>
                  <strong>{s.debtor_site_name}</strong> owes <strong>{s.creditor_site_name}</strong>{" "}
                  <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 800 }}>
                    {inr(s.pending_amount)}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
                  <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
                    {s.settlement_code}
                  </Box>
                  {partlyPaid ? ` · ${inr(s.paid_amount)} of ${inr(s.total_amount)} paid` : ""}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
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
