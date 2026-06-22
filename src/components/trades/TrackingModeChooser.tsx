"use client";

import { Box, Stack, Typography, Radio } from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import Payments from "@mui/icons-material/Payments";
import Groups from "@mui/icons-material/Groups";
import Diversity3 from "@mui/icons-material/Diversity3";
import FactCheck from "@mui/icons-material/FactCheck";
import Inventory2Rounded from "@mui/icons-material/Inventory2Rounded";
import type { LaborTrackingMode } from "@/types/trade.types";

/** A real tracking mode, or the "package" handoff (a different object — a fixed-price package). */
export type TrackingChoice = LaborTrackingMode | "package";

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

// Civil/structural trades are the only ones whose per-laborer ("detailed") attendance
// screen is built — so we hide that card elsewhere to avoid sending users to a dead end.
const CIVIL_RE = /civil|concret|found|struct|masonry/i;

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
    title: "Daily headcount by role",
    daily: "Tap how many came, by role.",
    sample: "Mason ×3    Helper ×2",
    tells: "“Today ≈ ₹4,100 of work” → at the end: over- or under-paid?",
    bestFor: "You pay per head, with set roles.",
  },
  {
    key: "mid",
    icon: Diversity3,
    title: "Crew roster + one day total",
    daily: "Tick who came, type one ₹ total + how much got done.",
    sample: "5 present · ₹8,000 · 1½ days’ work",
    tells: "The day’s work value vs what you’ve paid.",
    bestFor: "Mesthri quotes one daily price for the crew.",
  },
  {
    key: "package",
    icon: Inventory2Rounded,
    badge: "Like Barun’s",
    title: "Fixed price + man-day log",
    daily: "Quick crew log in a drawer: 1 Mason + 2 Helpers.",
    sample: "Day log → “company saving ₹12,000”",
    tells: "Your margin — paid vs man-day value; was the price a good deal?",
    bestFor: "A maistry job at a fixed price. Opens its own setup + day-log drawer.",
  },
  {
    key: "detailed",
    icon: FactCheck,
    title: "Per-laborer attendance",
    daily: "In/out time for each laborer (the Civil flow).",
    sample: "Ravi 9:00–17:30 · Kumar 9:15–18:00",
    tells: "Exact labour cost from each person’s pay.",
    bestFor: "Labourers on your own books (you pay them direct).",
  },
];

/**
 * "How will you handle this work?" — selectable cards, each showing a concrete SAMPLE of
 * the daily entry + what the app tells you back, so the choice is obvious. Replaces the
 * old four cryptic radios. Optionally surfaces the fixed-price "package" as a first-class
 * option (it routes to its own setup, not a tracking mode).
 */
export function TrackingModeChooser({
  value,
  onChange,
  tradeName,
  includePackage = false,
}: {
  value: TrackingChoice | null;
  onChange: (v: TrackingChoice) => void;
  tradeName?: string;
  includePackage?: boolean;
}) {
  const isCivil = CIVIL_RE.test(tradeName ?? "");
  const options = OPTIONS.filter((o) => {
    if (o.key === "package") return includePackage;
    // Only offer per-laborer "detailed" where its screen exists (Civil), or when the
    // contract is already on that mode (so a change-dialog can show the current state).
    if (o.key === "detailed") return isCivil || value === "detailed";
    return true;
  });

  return (
    <Stack spacing={1}>
      {options.map((o) => {
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
