"use client";

import { Box, Stack, Typography, Radio } from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import Payments from "@mui/icons-material/Payments";
import Groups from "@mui/icons-material/Groups";
import FactCheck from "@mui/icons-material/FactCheck";
import type { LaborTrackingMode } from "@/types/trade.types";

/**
 * A labour-tracking mode. Three clear choices, in order of how much daily work they ask of you.
 * (Fixed-price maistry packages are created through their own handoff, not as a mode here.)
 */
export type TrackingChoice = LaborTrackingMode;

interface OptionDef {
  key: TrackingChoice;
  icon: SvgIconComponent;
  title: string;
  /** Small recognizer badge (e.g. "Most used", "Like Barun's"). */
  badge?: string;
  /** What the supervisor does each day. */
  daily: string;
  /** A concrete sample of the daily entry (monospace). */
  sample: string;
  /** What the app computes / tells the owner back. */
  tells: string;
  /** Plain "best for" line. */
  bestFor: string;
}

// The three ways to handle a job, lightest → fullest. Available for every trade —
// not just Civil — so Electrical / Painting / Tiling / Fabrication can run the same
// machinery when they need it.
const OPTIONS: OptionDef[] = [
  {
    key: "mesthri_only",
    icon: Payments,
    title: "Just record payments",
    daily: "Nothing daily — log a payment whenever you pay him.",
    sample: "Paid ₹20,000 · advance · 12 Jun",
    tells: "Quoted vs Paid only (won't flag if the price was unfair).",
    bestFor: "A fixed price you trust.",
  },
  {
    key: "headcount",
    icon: Groups,
    badge: "Most used",
    title: "Count labourers by role",
    daily: "Tap how many came, by role.",
    sample: "Mason ×3    Helper ×2",
    tells: "“Today ≈ ₹4,100 of work” → at the end: over- or under-paid?",
    bestFor: "You pay per head, with set roles.",
  },
  {
    key: "detailed",
    icon: FactCheck,
    badge: "Like Civil",
    title: "Full workspace (attendance + salary)",
    daily: "Mark each labourer's day, then run salary settlements, holidays & tea — the full Civil flow.",
    sample: "Ravi 9:00–17:30 · settle wages weekly",
    tells: "Exact labour cost, and you pay & settle wages right here.",
    bestFor: "Any trade you run day-to-day on your own books.",
  },
];

/**
 * "How will you handle this work?" — three selectable cards (lightest → fullest), each
 * showing a concrete SAMPLE of the daily entry + what the app tells you back, so the
 * choice is obvious. Every mode is offered for every trade.
 */
export function TrackingModeChooser({
  value,
  onChange,
}: {
  value: TrackingChoice | null;
  onChange: (v: TrackingChoice) => void;
}) {
  return (
    <Stack spacing={1}>
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const selected = value === o.key;
        return (
          <Box
            key={o.key}
            tabIndex={0}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(o.key);
              }
            }}
            sx={{
              display: "flex",
              gap: 1.25,
              p: 1.25,
              borderRadius: 2,
              cursor: "pointer",
              border: "1px solid",
              borderColor: selected ? "primary.main" : "divider",
              bgcolor: selected ? "action.selected" : "background.paper",
              transition: "border-color .12s, background-color .12s",
              outline: "none",
              "&:hover": { borderColor: selected ? "primary.main" : "text.disabled" },
              "&:focus-visible": { borderColor: "primary.main" },
            }}
          >
            <Box sx={{ pt: 0.25 }}>
              <Icon fontSize="small" color={selected ? "primary" : "action"} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                <Typography variant="body2" fontWeight={700}>
                  {o.title}
                </Typography>
                {o.badge && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: 10,
                      fontWeight: 800,
                      px: 0.7,
                      py: 0.1,
                      borderRadius: 999,
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.badge}
                  </Box>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                <strong>Each day:</strong> {o.daily}
              </Typography>
              <Box
                sx={{
                  my: 0.5,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  fontFamily: "monospace",
                  fontSize: 11.5,
                  color: "text.primary",
                  whiteSpace: "pre-wrap",
                }}
              >
                {o.sample}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                <strong>The app tells you:</strong> {o.tells}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                <strong>Best for:</strong> {o.bestFor}
              </Typography>
            </Box>
            <Radio
              checked={selected}
              tabIndex={-1}
              size="small"
              sx={{ alignSelf: "flex-start", mt: -0.5, mr: -0.5 }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}
