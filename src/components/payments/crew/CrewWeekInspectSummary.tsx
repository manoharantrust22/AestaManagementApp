"use client";

import { Box, Chip, Typography, useTheme, alpha } from "@mui/material";
import { useSalaryCrewLedger } from "@/hooks/queries/useSalaryCrewLedger";
import { formatCurrencyFull } from "@/lib/formatters";

const num = { fontVariantNumeric: "tabular-nums" as const };

/**
 * Per-laborer earned/paid summary for ONE week inside the InspectPane drawer
 * (weekly-aggregate). Renders nothing on sites without crew-pay mode, so it is
 * safe to mount unconditionally.
 */
export default function CrewWeekInspectSummary({
  siteId,
  weekStart,
}: {
  siteId: string;
  weekStart: string;
}) {
  const theme = useTheme();
  const { data } = useSalaryCrewLedger({ siteId, subcontractId: null });
  if (!data || !data.enabled) return null;
  const week = data.weeks.find((w) => w.weekStart === weekStart);
  if (!week) return null;

  return (
    <Box
      sx={{
        mt: 2,
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        p: 1.25,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: ".04em" }}>
          Crew earnings this week
        </Typography>
        {!week.isPostCutover && (
          <Chip size="small" label="Paid via waterfall" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} />
        )}
      </Box>

      {week.rows.map((r) => {
        const settled = r.unpaid <= 0.5 && r.earned > 0;
        return (
          <Box
            key={r.laborerId}
            sx={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 1, py: 0.5, fontSize: 12.5,
              borderRadius: 1,
              px: 0.5,
              bgcolor: r.isMesthri ? alpha(theme.palette.primary.main, 0.06) : "transparent",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600 }} noWrap>
                {r.name}
                {r.isMesthri && (
                  <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary" }}> · MESTHRI</Box>
                )}
              </Typography>
              <Typography sx={{ fontSize: 11, color: "text.secondary", ...num }} noWrap>
                {r.days} day{r.days === 1 ? "" : "s"}
                {r.commission > 0 && <> · −{formatCurrencyFull(r.commission)} comm</>}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "right", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, ...num }}>
                {formatCurrencyFull(r.earned)}
              </Typography>
              <Typography
                sx={{
                  fontSize: 10.5, ...num,
                  color: settled ? theme.palette.success.dark : theme.palette.warning.dark,
                }}
              >
                {settled
                  ? week.isPostCutover ? "paid" : "via waterfall"
                  : `${formatCurrencyFull(r.unpaid)} owed`}
              </Typography>
            </Box>
          </Box>
        );
      })}

      <Box sx={{ display: "flex", justifyContent: "space-between", pt: 0.75, mt: 0.5, borderTop: `1px dashed ${theme.palette.divider}`, fontSize: 12 }}>
        <span style={{ color: theme.palette.text.secondary }}>
          Commission to {data.config.mesthriName}
        </span>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {formatCurrencyFull(week.commissionTotal)}
        </span>
      </Box>
    </Box>
  );
}
