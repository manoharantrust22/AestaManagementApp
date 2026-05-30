"use client";

/**
 * "How this nets · worked example" panel.
 *
 * Two direction panels side-by-side + dashed-border equation block + an
 * inline action row offering Net Settle.
 *
 * Mirrors `NettingMath` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { Box, Button, Chip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import DirectionPanel from "./DirectionPanel";
import type { InterSiteDebt } from "@/lib/material-hub/nextAction";

export interface NettingMathPanelProps {
  debt: InterSiteDebt;
  /** The current site's short label (e.g., "SHS") */
  mySiteShort: string;
  mySiteName: string;
  mySiteAccent?: string;
  /** Other primary cluster site's short label (e.g., "PA") */
  otherSiteShort: string;
  otherSiteName: string;
  otherSiteAccent?: string;
  mySiteId: string;
  onNetSettle?: (fromSiteId: string, toSiteId: string, amount: number) => void;
}

export default function NettingMathPanel({
  debt,
  mySiteShort,
  mySiteName,
  mySiteAccent = hubTokens.primary,
  otherSiteShort,
  otherSiteName,
  otherSiteAccent = hubTokens.pink,
  mySiteId,
  onNetSettle,
}: NettingMathPanelProps) {
  const owedToMe = debt.detail.filter((d) => d.to_site === mySiteId);
  const owedByMe = debt.detail.filter((d) => d.from_site === mySiteId);
  const totalOwedToMe = owedToMe.reduce((s, d) => s + d.value, 0);
  const totalOwedByMe = owedByMe.reduce((s, d) => s + d.value, 0);
  const netAmount = Math.abs(totalOwedByMe - totalOwedToMe);
  const owesMore = totalOwedByMe > totalOwedToMe;
  const netPayerShort = owesMore ? mySiteShort : otherSiteShort;
  const netPayerName = owesMore ? mySiteName : otherSiteName;
  const netPayerId = owesMore ? mySiteId : "";
  const netReceiverShort = owesMore ? otherSiteShort : mySiteShort;
  const netReceiverName = owesMore ? otherSiteName : mySiteName;
  const netReceiverAccent = owesMore ? otherSiteAccent : mySiteAccent;
  const netPayerAccent = owesMore ? mySiteAccent : otherSiteAccent;

  if (totalOwedToMe === 0 && totalOwedByMe === 0) {
    // Nothing to net — return a stub message rather than rendering empty.
    return (
      <Box
        sx={{
          background: hubTokens.card,
          border: `1px solid ${hubTokens.border}`,
          borderRadius: "12px",
          padding: "16px 20px",
          marginBottom: "16px",
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text }}>
          How this nets · worked example
        </Typography>
        <Typography sx={{ fontSize: 12, color: hubTokens.muted, marginTop: "4px" }}>
          No cross-site usage logged yet. Spot batches show up here once their split is finalized.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
        overflow: "hidden",
        marginBottom: "16px",
      }}
    >
      <Box
        sx={{
          padding: "14px 18px",
          borderBottom: `1px solid ${hubTokens.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.text }}>
            How this nets · worked example
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginTop: "2px" }}>
            Smaller debt cancels into the larger. Settle once for the difference instead of two separate transfers.
          </Typography>
        </Box>
        <Chip
          label="Auto-computed"
          size="small"
          sx={{
            background: hubTokens.primarySoft,
            color: hubTokens.primary,
            fontWeight: 600,
            fontSize: 11,
            height: 22,
          }}
        />
      </Box>

      <Box sx={{ padding: { xs: "16px", md: "20px 22px" } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <DirectionPanel
            fromShort={otherSiteShort}
            fromAccent={otherSiteAccent}
            toShort={mySiteShort}
            toAccent={mySiteAccent}
            amount={totalOwedToMe}
            records={owedToMe.map((d) => ({
              materialName: d.materialName ?? d.thread?.material_name ?? "—",
              batchCode: d.batchCode ?? d.thread?.inventory?.batch,
              value: d.value,
            }))}
            color={hubTokens.success}
            reasonShort="used your batches"
            emptyReason="No batches you paid for that others used yet."
          />
          <DirectionPanel
            fromShort={mySiteShort}
            fromAccent={mySiteAccent}
            toShort={otherSiteShort}
            toAccent={otherSiteAccent}
            amount={totalOwedByMe}
            records={owedByMe.map((d) => ({
              materialName: d.materialName ?? d.thread?.material_name ?? "—",
              batchCode: d.batchCode ?? d.thread?.inventory?.batch,
              value: d.value,
            }))}
            color={hubTokens.danger}
            reasonShort="used their batches"
            emptyReason="No batches they paid for that you used yet."
          />
        </Box>

        {/* Equation */}
        <Box
          sx={{
            background: hubTokens.bg,
            border: `1px dashed ${hubTokens.border}`,
            borderRadius: "10px",
            padding: { xs: "12px 14px", md: "14px 18px" },
          }}
        >
          <Box
            sx={{
              fontSize: 10.5,
              fontWeight: 700,
              color: hubTokens.subtle,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            The math
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              fontFamily: hubTokens.mono,
              fontSize: 13.5,
              color: hubTokens.text,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <Box
                component="span"
                sx={{ color: totalOwedToMe > 0 ? hubTokens.success : hubTokens.subtle }}
              >
                + {inr(totalOwedToMe)}
              </Box>
              <Box
                component="span"
                sx={{
                  color: hubTokens.subtle,
                  fontFamily: hubTokens.font,
                  fontWeight: 500,
                  fontSize: 11.5,
                }}
              >
                ({otherSiteShort} owes {mySiteShort})
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <Box
                component="span"
                sx={{ color: totalOwedByMe > 0 ? hubTokens.danger : hubTokens.subtle }}
              >
                − {inr(totalOwedByMe)}
              </Box>
              <Box
                component="span"
                sx={{
                  color: hubTokens.subtle,
                  fontFamily: hubTokens.font,
                  fontWeight: 500,
                  fontSize: 11.5,
                }}
              >
                ({mySiteShort} owes {otherSiteShort})
              </Box>
            </Box>
            <Box sx={{ height: 1, background: hubTokens.border, margin: "4px 0" }} />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              ={" "}
              <Box
                component="span"
                sx={{ color: netAmount === 0 ? hubTokens.success : hubTokens.text }}
              >
                {netAmount === 0 ? "₹0" : inr(netAmount)}
              </Box>
              {netAmount > 0 && (
                <Box
                  component="span"
                  sx={{
                    fontFamily: hubTokens.font,
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: hubTokens.muted,
                  }}
                >
                  →{" "}
                  <Box
                    component="span"
                    sx={{ color: netPayerAccent, fontWeight: 800 }}
                  >
                    {netPayerShort}
                  </Box>{" "}
                  pays{" "}
                  <Box
                    component="span"
                    sx={{ color: netReceiverAccent, fontWeight: 800 }}
                  >
                    {netReceiverShort}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Inline action */}
        {netAmount > 0 && onNetSettle && (
          <Box
            sx={{
              marginTop: "12px",
              padding: "12px 14px",
              background: hubTokens.primarySoft,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: { xs: "wrap", md: "nowrap" },
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: hubTokens.primary }} />
            <Typography
              sx={{
                flex: 1,
                fontSize: 12,
                color: hubTokens.primary,
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              <Box component="span" sx={{ fontWeight: 700 }}>
                {netPayerName}
              </Box>{" "}
              will transfer{" "}
              <Box
                component="span"
                sx={{ fontFamily: hubTokens.mono, fontWeight: 800 }}
              >
                {inr(netAmount)}
              </Box>{" "}
              to{" "}
              <Box component="span" sx={{ fontWeight: 700 }}>
                {netReceiverName}
              </Box>
              . Both sites&apos; material-expense ledgers update automatically.
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
              onClick={() => onNetSettle(netPayerId, "", netAmount)}
              sx={{
                textTransform: "none",
                background: hubTokens.primary,
                fontWeight: 700,
                fontSize: 11.5,
                whiteSpace: "nowrap",
                "&:hover": { background: hubTokens.primaryHover },
              }}
            >
              Settle now
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
