"use client";

import { Box, Skeleton, Typography } from "@mui/material";
import { useSectionSpendBreakdown } from "@/hooks/queries/useSectionSpendBreakdown";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

interface SubRow {
  label: string;
  value: number;
}

/**
 * "Where the money went" — every rupee linked to this section (or contract) and
 * its attached fixed-price packages, grouped by kind. Labor is the money that
 * counts toward the contract balance; materials / rentals / other expenses are
 * linked spend shown for the full picture but never part of paid-vs-agreed.
 */
export function SectionSpendBreakdown({
  sectionId,
  packageIds,
  selfWord = "section",
}: {
  sectionId: string;
  packageIds: string[];
  /** What this node is called in copy — "section" or "contract". */
  selfWord?: string;
}) {
  const { data, isLoading } = useSectionSpendBreakdown(sectionId, packageIds);

  if (isLoading) {
    return <Skeleton variant="rounded" height={96} sx={{ borderRadius: `${wsRadius.card}px` }} />;
  }
  if (!data || data.grandTotal <= 0) return null;

  const groups: Array<{
    key: string;
    label: string;
    total: number;
    caption: string;
    color: string;
    rows: SubRow[];
  }> = [
    {
      key: "labor",
      label: "Labor",
      total: data.labor.total,
      caption: "counts toward the contract balance",
      color: wsColors.primary,
      rows: [
        { label: "Package crew wages", value: data.labor.packageCrewWages },
        { label: "Package payments", value: data.labor.packagePayments },
        { label: "Contract payments", value: data.labor.contractPayments },
        { label: "Salary settlements", value: data.labor.salarySettlements },
        { label: "Contract wages", value: data.labor.contractWages },
      ],
    },
    {
      key: "materials",
      label: "Materials",
      total: data.materials.total,
      caption: "not counted in the balance",
      color: "#0d9488",
      rows: [
        { label: "Purchases", value: data.materials.purchases },
        { label: "Misc entries", value: data.materials.misc },
      ],
    },
    {
      key: "rentals",
      label: "Rentals",
      total: data.rentals.total,
      caption: "not counted in the balance",
      color: "#7c3aed",
      rows: [
        { label: "Rental settlements", value: data.rentals.settlements },
        { label: "Misc entries", value: data.rentals.misc },
      ],
    },
    {
      key: "other",
      label: "Other expenses",
      total: data.other.total,
      caption: "not counted in the balance",
      color: wsColors.amber,
      rows: [
        { label: "Tea shop", value: data.other.teaShop },
        { label: "Misc entries", value: data.other.misc },
      ],
    },
  ].filter((g) => g.total > 0);

  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        borderRadius: `${wsRadius.card}px`,
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        boxShadow: wsShadow.card,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: wsColors.muted,
          mb: 0.75,
        }}
      >
        Where the money went
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.875 }}>
        {groups.map((g) => {
          const rows = g.rows.filter((r) => r.value > 0);
          return (
            <Box key={g.key}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.625 }}>
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    bgcolor: g.color,
                    flexShrink: 0,
                    alignSelf: "center",
                  }}
                />
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: wsColors.ink }}>
                  {g.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: wsColors.ink,
                    fontVariantNumeric: "tabular-nums",
                    ml: "auto",
                  }}
                >
                  {formatCurrencyFull(g.total)}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 10.5, color: wsColors.muted, ml: 1.9 }}>
                {g.caption}
              </Typography>
              {rows.length > 1 &&
                rows.map((r) => (
                  <Box
                    key={r.label}
                    sx={{ display: "flex", alignItems: "center", ml: 1.9, mt: 0.25 }}
                  >
                    <Typography sx={{ fontSize: 11.5, color: wsColors.ink2 }}>{r.label}</Typography>
                    <Typography
                      sx={{
                        fontSize: 11.5,
                        color: wsColors.ink2,
                        fontVariantNumeric: "tabular-nums",
                        ml: "auto",
                      }}
                    >
                      {formatCurrencyFull(r.value)}
                    </Typography>
                  </Box>
                ))}
            </Box>
          );
        })}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mt: 1,
          pt: 0.875,
          borderTop: `1px solid ${wsColors.hairline2}`,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: wsColors.ink2 }}>
          All spend on this {selfWord}
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 800,
            color: wsColors.ink,
            fontVariantNumeric: "tabular-nums",
            ml: "auto",
          }}
        >
          {formatCurrencyFull(data.grandTotal)}
        </Typography>
      </Box>
    </Box>
  );
}
