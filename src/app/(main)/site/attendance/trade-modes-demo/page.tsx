"use client";

import React from "react";
import {
  Box,
  Container,
  Typography,
  Paper,
  Stack,
  Chip,
  Divider,
  Grid,
  TextField,
  Button,
  Tabs,
  Tab,
  IconButton,
  Avatar,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  Groups as PeopleIcon,
  Store as StoreIcon,
  WbSunny as MorningIcon,
  Brightness3 as EveningIcon,
  PhotoCamera as PhotoIcon,
  AccessTime as TimeIcon,
  Save as SaveIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
} from "@mui/icons-material";

/**
 * Visual comparison of the three labor-tracking modes for trade contracts.
 * No live data — these are static drawer mockups so you can pick the right
 * mode for each trade type before we commit to building the real flows.
 *
 *   Detailed  → looks identical to Civil's per-laborer attendance drawer
 *   Mid       → laborer roster + daily total (no per-laborer rates)
 *   Headcount → role units only (existing painting flow)
 */
export default function TradeModesDemoPage() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Trade Attendance Modes — Visual Comparison
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Pick the mode that fits each trade. The drawer mockups below show the
        exact data-entry shape a supervisor sees when they tap{" "}
        <strong>Start Day Attendance</strong> for that trade.
      </Typography>

      <Grid container spacing={3}>
        {/* ===== DETAILED MODE ===== */}
        <Grid size={{ xs: 12, md: 4 }}>
          <ModeCard
            title="Detailed"
            chipColor="#1976d2"
            tagline="Per-laborer hours + pay"
            useCase="Use when you pay each laborer individually and care about who showed up, when, and how many days they worked. Same flow as Civil today."
            bestFor={[
              "Plumbing crews you pay per worker",
              "Electrical with hourly rates",
              "Any trade with daily-wage laborers from your roster",
            ]}
            drawer={<DetailedDrawerMock />}
          />
        </Grid>

        {/* ===== MID MODE ===== */}
        <Grid size={{ xs: 12, md: 4 }}>
          <ModeCard
            title="Mid (Laborer + Crew)"
            chipColor="#7b1fa2"
            tagline="Roster of who came + day total"
            useCase="Use when a mesthri brings a crew. You want to know which laborers worked but you pay one daily total to the crew, not per laborer. Hybrid between detailed and headcount."
            bestFor={[
              "Mesthri-led painting / plastering teams",
              "Tile work where mesthri organizes crew",
              "Carpentry crews with per-day quoted rate",
            ]}
            drawer={<MidDrawerMock />}
          />
        </Grid>

        {/* ===== HEADCOUNT MODE ===== */}
        <Grid size={{ xs: 12, md: 4 }}>
          <ModeCard
            title="Headcount"
            chipColor="#f9a825"
            tagline="Role counts only — no names"
            useCase="Use when you don't track individual laborers — just total people per role per day. Lightest data entry, no laborer roster needed. Existing Painting flow."
            bestFor={[
              "Painting (current Painting · Asis contract)",
              "General labor pools",
              "Anonymous-crew contracts",
            ]}
            drawer={<HeadcountDrawerMock />}
          />
        </Grid>
      </Grid>

      <Divider sx={{ my: 4 }} />

      <Typography variant="h6" fontWeight={600} gutterBottom>
        Which one for which trade?
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Civil already uses <strong>Detailed</strong>. Painting today uses{" "}
        <strong>Headcount</strong>. For a new trade like Tiling or Electrical
        you can pick the mode at contract creation — it determines the data
        entry surface but the page chrome (KPI strip, table layout, week
        groups, color theme) stays identical across all three.
      </Typography>
    </Container>
  );
}

/* ============================================================
   Card wrapper — title, tagline, drawer preview, use cases
   ============================================================ */
interface ModeCardProps {
  title: string;
  chipColor: string;
  tagline: string;
  useCase: string;
  bestFor: string[];
  drawer: React.ReactNode;
}

function ModeCard({ title, chipColor, tagline, useCase, bestFor, drawer }: ModeCardProps) {
  return (
    <Paper sx={{ overflow: "hidden", height: "100%" }}>
      {/* Header band */}
      <Box sx={{ bgcolor: chipColor, color: "#fff", px: 2.5, py: 2 }}>
        <Typography variant="overline" sx={{ opacity: 0.85, letterSpacing: 1.2 }}>
          Mode
        </Typography>
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.9 }}>
          {tagline}
        </Typography>
      </Box>

      {/* Drawer preview */}
      <Box sx={{ p: 2, bgcolor: "grey.50", borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Supervisor sees:
        </Typography>
        <Box sx={{ mt: 1 }}>{drawer}</Box>
      </Box>

      {/* Use case */}
      <Box sx={{ p: 2.5 }}>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {useCase}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Best for:
        </Typography>
        <Box component="ul" sx={{ pl: 2, m: 0, mt: 0.5 }}>
          {bestFor.map((b) => (
            <Typography key={b} component="li" variant="caption" color="text.secondary">
              {b}
            </Typography>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}

/* ============================================================
   Detailed mode drawer — clones Civil's drawer visual structure
   ============================================================ */
function DetailedDrawerMock() {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      {/* Drawer header (Civil-style orange header) */}
      <Box sx={{ bgcolor: "warning.main", color: "warning.contrastText", px: 2, py: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle2" fontWeight={700}>
          🌅 Start Day — 09 May 2026 (Sat)
        </Typography>
        <CloseIcon fontSize="small" />
      </Box>

      <Box sx={{ p: 1.5 }}>
        {/* Date + Section */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <TextField size="small" label="Date" value="09-05-2026" disabled fullWidth />
          <TextField size="small" label="Section" value="⭐ Plumbing block A" disabled fullWidth />
        </Stack>

        {/* Work Laborers section */}
        <Box sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <PeopleIcon fontSize="small" />
            <Typography variant="caption" fontWeight={600}>Work Laborers</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TimeIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">09:00</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>•</Typography>
            <Typography variant="caption" color="text.secondary">Planned: 1.0 day</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <LaborerChip name="Varun" />
            <LaborerChip name="Prabhakar" />
            <LaborerChip name="Jithin" />
            <LaborerChip name="+3 more" muted />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" startIcon={<PeopleIcon />} sx={{ fontSize: "0.65rem", py: 0.25 }}>
              Add Laborers
            </Button>
            <Button size="small" variant="outlined" startIcon={<StoreIcon />} sx={{ fontSize: "0.65rem", py: 0.25 }}>
              Add Market
            </Button>
          </Stack>
        </Box>

        {/* Work Updates */}
        <SectionStub icon="📝" label="Work Updates" body="What work is planned for today?" />

        {/* Task Photos */}
        <SectionStub icon="📷" label="Task Photos (3)" body="Task 1 · Task 2 · Task 3" />

        {/* Footer */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">
            6 Workers · ₹4,500
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" variant="outlined" sx={{ fontSize: "0.65rem", py: 0.25 }}>Draft</Button>
            <Button size="small" variant="contained" sx={{ fontSize: "0.65rem", py: 0.25 }}>Save Morning</Button>
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

/* ============================================================
   Mid mode drawer — laborer roster + daily total (proposed new)
   ============================================================ */
function MidDrawerMock() {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ bgcolor: "#7b1fa2", color: "#fff", px: 2, py: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle2" fontWeight={700}>
          🎨 Day Entry — 09 May 2026 (Sat)
        </Typography>
        <CloseIcon fontSize="small" />
      </Box>

      <Box sx={{ p: 1.5 }}>
        {/* Date + Mesthri */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <TextField size="small" label="Date" value="09-05-2026" disabled fullWidth />
          <TextField size="small" label="Mesthri" value="Asis" disabled fullWidth />
        </Stack>

        {/* Crew that worked today (multi-select chips from roster) */}
        <Box sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, mb: 1.5 }}>
          <Typography variant="caption" fontWeight={600} sx={{ display: "block", mb: 1 }}>
            Who came today? <Typography component="span" variant="caption" color="text.secondary">(tap to toggle)</Typography>
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <PresenceChip name="Asis (mesthri)" present />
            <PresenceChip name="Ravi" present />
            <PresenceChip name="Suresh" present />
            <PresenceChip name="Karthik" />
            <PresenceChip name="Babu" present />
            <PresenceChip name="+ Add laborer" addAction />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            4 of 5 present
          </Typography>
        </Box>

        {/* Day total amount + work plan */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <TextField size="small" label="Day total ₹" value="3,500" fullWidth />
          <TextField size="small" label="Work done" value="0.5 day" fullWidth />
        </Stack>

        {/* Work Updates */}
        <SectionStub icon="📝" label="Work Updates" body="What work was done today?" />

        {/* Task Photos */}
        <SectionStub icon="📷" label="Task Photos (2)" body="Morning + evening photo" />

        {/* Footer */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">
            4 of 5 came · ₹3,500
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" variant="outlined" sx={{ fontSize: "0.65rem", py: 0.25 }}>Draft</Button>
            <Button size="small" variant="contained" sx={{ fontSize: "0.65rem", py: 0.25, bgcolor: "#7b1fa2", "&:hover": { bgcolor: "#4a148c" } }}>
              Save Day
            </Button>
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

/* ============================================================
   Headcount mode drawer — current Painting flow
   ============================================================ */
function HeadcountDrawerMock() {
  const [tab, setTab] = React.useState(0);
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ bgcolor: "#f9a825", color: "rgba(0,0,0,0.87)", px: 2, py: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle2" fontWeight={700}>
          ⚡ Saturday, 9 May 2026
        </Typography>
        <CloseIcon fontSize="small" />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ minHeight: 32, "& .MuiTab-root": { minHeight: 32, fontSize: "0.7rem", py: 0 } }}>
        <Tab icon={<PeopleIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Headcount" />
        <Tab icon={<MorningIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Morning" />
        <Tab icon={<EveningIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Evening" />
      </Tabs>

      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary" }}>
          How many of each role came today?
        </Typography>

        <Box sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1, mb: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="caption" fontWeight={600}>Helper Electrician</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.6rem" }}>₹400/day</Typography>
          </Box>
          <TextField size="small" value="3" sx={{ width: 60 }} />
        </Box>

        <Box sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1, mb: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="caption" fontWeight={600}>Electrician</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.6rem" }}>₹650/day</Typography>
          </Box>
          <TextField size="small" value="2" sx={{ width: 60 }} />
        </Box>

        <TextField size="small" placeholder="Note (optional)" fullWidth sx={{ mb: 1.5 }} />

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.6rem" }}>Implied labor today</Typography>
            <Typography variant="caption" fontWeight={700}>₹2,500</Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" variant="outlined" sx={{ fontSize: "0.65rem", py: 0.25 }}>Cancel</Button>
            <Button size="small" variant="contained" sx={{ fontSize: "0.65rem", py: 0.25, bgcolor: "#f9a825", color: "rgba(0,0,0,0.87)", "&:hover": { bgcolor: "#f57f17" } }}>
              Save day
            </Button>
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

/* ============================================================
   Small atoms
   ============================================================ */
function LaborerChip({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <Chip
      label={name}
      size="small"
      avatar={<Avatar sx={{ width: 20, height: 20, fontSize: "0.6rem" }}>{name[0]}</Avatar>}
      sx={{
        height: 24,
        fontSize: "0.65rem",
        bgcolor: muted ? "grey.200" : "primary.50",
        color: muted ? "text.secondary" : "primary.dark",
      }}
    />
  );
}

function PresenceChip({ name, present, addAction }: { name: string; present?: boolean; addAction?: boolean }) {
  if (addAction) {
    return (
      <Chip
        label={name}
        size="small"
        icon={<AddIcon sx={{ fontSize: 14 }} />}
        variant="outlined"
        sx={{ height: 24, fontSize: "0.65rem", borderStyle: "dashed" }}
      />
    );
  }
  return (
    <Chip
      label={name}
      size="small"
      icon={present ? <CheckIcon sx={{ fontSize: 14 }} /> : <CancelIcon sx={{ fontSize: 14 }} />}
      sx={{
        height: 24,
        fontSize: "0.65rem",
        bgcolor: present ? "success.50" : "grey.100",
        color: present ? "success.dark" : "text.disabled",
        "& .MuiChip-icon": {
          color: present ? "success.main" : "text.disabled",
        },
      }}
    />
  );
}

function SectionStub({ icon, label, body }: { icon: string; label: string; body: string }) {
  return (
    <Box sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1, mb: 1 }}>
      <Typography variant="caption" fontWeight={600} sx={{ display: "block" }}>
        {icon} {label}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
        {body}
      </Typography>
    </Box>
  );
}
