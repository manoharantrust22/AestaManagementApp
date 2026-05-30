"use client";

/**
 * Dark gradient balance card for the Inter-Site Settlement page.
 * Three-column layout: You owe (red) · NET (centered) · Others owe you (green).
 *
 * Mirrors the balance card block in `ProtoInterSite`
 * (docs/MaterialHub_Redesign/proto-screens.jsx).
 */

import { Box } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr, inrK } from "@/lib/material-hub/formatters";
import type { InterSiteDebt } from "@/lib/material-hub/nextAction";

export interface InterSiteBalanceCardProps {
  debt: InterSiteDebt;
  /** # of unsettled records where this site owes others (the "You owe" side). */
  youOweCount?: number;
  /** # of unsettled records where others owe this site (the "Others owe you" side). */
  owedToYouCount?: number;
}

export default function InterSiteBalanceCard({
  debt,
  youOweCount,
  owedToYouCount,
}: InterSiteBalanceCardProps) {
  const owesNet = debt.net < 0;
  const recordLabel = (n: number | undefined) =>
    n == null ? null : `${n} record${n === 1 ? "" : "s"} · `;

  return (
    <Box
      sx={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        color: "#fff",
        padding: { xs: "20px", md: "24px 28px" },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr auto 1fr" },
        alignItems: "center",
        gap: { xs: "16px", md: "24px" },
        borderRadius: "12px",
        marginBottom: "16px",
        overflow: "hidden",
      }}
    >
      <Box sx={{ textAlign: { xs: "left", md: "right" } }}>
        <Box
          sx={{
            fontSize: 11,
            opacity: 0.6,
            letterSpacing: "0.5px",
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          You owe
        </Box>
        <Box
          sx={{
            fontSize: { xs: 26, md: 30 },
            fontWeight: 800,
            fontFamily: hubTokens.mono,
            letterSpacing: "-0.6px",
            color: "#f87171",
          }}
        >
          {inr(debt.iOwe)}
        </Box>
        <Box sx={{ fontSize: 11, opacity: 0.7, marginTop: "3px" }}>
          {recordLabel(youOweCount)}for using their batches
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "row", md: "column" },
          alignItems: "center",
          gap: { xs: "12px", md: "6px" },
          justifyContent: { xs: "center", md: undefined },
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LinkIcon sx={{ fontSize: 16, color: "#fff" }} />
        </Box>
        <Box
          sx={{
            fontSize: 9.5,
            opacity: 0.5,
            letterSpacing: "0.6px",
            fontWeight: 700,
            textTransform: "uppercase",
            display: { xs: "none", md: "block" },
          }}
        >
          net
        </Box>
        <Box
          sx={{
            fontSize: { xs: 18, md: 16 },
            fontWeight: 800,
            fontFamily: hubTokens.mono,
            color: owesNet ? "#f87171" : "#34d399",
          }}
        >
          {owesNet ? "−" : "+"}
          {inrK(Math.abs(debt.net))}
        </Box>
      </Box>

      <Box>
        <Box
          sx={{
            fontSize: 11,
            opacity: 0.6,
            letterSpacing: "0.5px",
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          Others owe you
        </Box>
        <Box
          sx={{
            fontSize: { xs: 26, md: 30 },
            fontWeight: 800,
            fontFamily: hubTokens.mono,
            letterSpacing: "-0.6px",
            color: "#34d399",
          }}
        >
          {inr(debt.othersOwe)}
        </Box>
        <Box sx={{ fontSize: 11, opacity: 0.7, marginTop: "3px" }}>
          {recordLabel(owedToYouCount)}for using your batches
        </Box>
      </Box>
    </Box>
  );
}
