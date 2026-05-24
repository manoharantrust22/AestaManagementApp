"use client";

/**
 * Per-site % split panel used inside BackfillManualDialog and the AI preview
 * editor when kind='group'. Shows one row per cluster site:
 *   [site short chip] [site name] [% input] [₹ value]
 * Validates the sum to 100 (±0.01 tolerance). Mirrors the split UI in the
 * spot-purchase allocator + the prototype's BackfillManualModal.
 */

import { Box, Typography } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";

export interface GroupSite {
  id: string;
  name: string;
  short?: string;
  accent?: string;
}

export interface GroupSplitRow {
  site_id: string;
  pct: number;
}

export interface GroupSplitInputProps {
  sites: GroupSite[];
  split: GroupSplitRow[];
  amount: number;
  onChange: (next: GroupSplitRow[]) => void;
}

function shortFor(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

export default function GroupSplitInput({
  sites,
  split,
  amount,
  onChange,
}: GroupSplitInputProps) {
  const sum = split.reduce((a, s) => a + (s.pct || 0), 0);
  const ok = Math.abs(sum - 100) < 0.01;

  return (
    <Box
      sx={{
        background: hubTokens.bg,
        borderRadius: "10px",
        padding: "12px 14px",
        border: `1px solid ${hubTokens.hairline}`,
      }}
    >
      {split.map((s, i) => {
        const site = sites.find((x) => x.id === s.site_id);
        const accent = site?.accent ?? hubTokens.primary;
        const sh = site?.short ?? shortFor(site?.name ?? "—");
        const value = (amount || 0) * (s.pct / 100);
        return (
          <Box
            key={s.site_id || i}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: i < split.length - 1 ? "8px" : "4px",
            }}
          >
            <Box
              component="span"
              sx={{
                padding: "4px 9px",
                borderRadius: "5px",
                background: `${accent}1a`,
                color: accent,
                fontSize: 11,
                fontWeight: 800,
                minWidth: 42,
                textAlign: "center",
              }}
            >
              {sh}
            </Box>
            <Typography sx={{ fontSize: 12, color: hubTokens.muted, flex: 1 }}>
              {site?.name ?? s.site_id}
            </Typography>
            <Box
              component="input"
              type="number"
              value={s.pct}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(
                  split.map((x, j) =>
                    j === i ? { ...x, pct: parseFloat(e.target.value) || 0 } : x
                  )
                )
              }
              sx={{
                width: 64,
                padding: "5px 8px",
                background: "#fff",
                border: `1px solid ${hubTokens.border}`,
                borderRadius: "6px",
                fontSize: 12,
                fontFamily: hubTokens.mono,
                fontWeight: 700,
                color: hubTokens.text,
                outline: "none",
                textAlign: "right",
              }}
            />
            <Typography
              component="span"
              sx={{ fontSize: 11, color: hubTokens.muted, fontWeight: 600 }}
            >
              %
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: 11,
                fontFamily: hubTokens.mono,
                fontWeight: 700,
                color: hubTokens.text,
                minWidth: 74,
                textAlign: "right",
              }}
            >
              {inr(value)}
            </Typography>
          </Box>
        );
      })}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: "8px",
          borderTop: `1px dashed ${hubTokens.border}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: ok ? hubTokens.success : hubTokens.danger,
          }}
        >
          Total {sum}%
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
          {ok ? "Inter-site debt will compute on save." : "Must total 100%."}
        </Typography>
      </Box>
    </Box>
  );
}
