"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Container,
  Paper,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PaymentsIcon from "@mui/icons-material/Payments";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useSitesData } from "@/contexts/SiteContext";
import { useWeeklyPayoutConsole } from "@/hooks/queries/useWeeklyPayoutConsole";
import PayoutWeekNavigator from "@/components/payouts/PayoutWeekNavigator";
import PayoutLaborerCard from "@/components/payouts/PayoutLaborerCard";
import PayLaborerDrawer from "@/components/payouts/PayLaborerDrawer";
import PayoutBatchReceipt from "@/components/payouts/PayoutBatchReceipt";
import { formatCurrencyFull } from "@/lib/formatters";
import { weekStartOf, weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import type { PayoutBatch, PayoutLaborer } from "@/types/payout.types";

const money = { fontVariantNumeric: "tabular-nums" } as const;

type StatusFilter = "unpaid" | "settled" | "all";

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, flex: 1, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, whiteSpace: "nowrap", ...money }}>
        {value}
      </Typography>
    </Paper>
  );
}

/**
 * Weekly Payouts ("Payday") — one consolidated owed amount per company laborer
 * across all selected sites (company salary + direct-pay contract buckets),
 * with one Pay action that fans out into per-site settlement rows.
 */
export default function PayoutsContent() {
  const { userProfile } = useAuth();
  const { sites, isInitialized } = useSitesData();

  const activeSites = useMemo(
    () => sites.filter((s: any) => s.status === "active"),
    [sites]
  );

  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  useEffect(() => {
    if (isInitialized && selectedSiteIds.length === 0 && activeSites.length > 0) {
      setSelectedSiteIds(activeSites.map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, activeSites.length]);

  // Payday convention: default to the last CLOSED week (Sun–Sat); Saturday
  // evening payers can step forward one week with the navigator.
  const [weekStart, setWeekStart] = useState(() =>
    weekStartStr(weekStartOf(dayjs()).subtract(7, "day"))
  );
  const weekEnd = weekEndStr(weekStart);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [payTarget, setPayTarget] = useState<PayoutLaborer | null>(null);
  const [receipt, setReceipt] = useState<{ laborer: PayoutLaborer; batch: PayoutBatch } | null>(null);

  const consoleQuery = useWeeklyPayoutConsole({
    siteIds: selectedSiteIds,
    weekStart,
    weekEnd,
  });

  const laborers = consoleQuery.data?.laborers ?? [];

  const kpis = useMemo(() => {
    const cashNeeded = laborers.reduce((s, l) => s + l.totalUnpaid, 0);
    const alreadyPaid = laborers.reduce(
      (s, l) => s + l.batches.reduce((x, b) => x + b.totalAmount, 0),
      0
    );
    const unpaidCount = laborers.filter((l) => l.totalUnpaid > 0.005).length;
    return { cashNeeded, alreadyPaid, unpaidCount, total: laborers.length };
  }, [laborers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return laborers
      .filter((l) => {
        if (q && !l.name.toLowerCase().includes(q)) return false;
        if (statusFilter === "unpaid") return l.totalUnpaid > 0.005;
        if (statusFilter === "settled") return l.totalUnpaid <= 0.005;
        return true;
      })
      .sort((a, b) => b.totalUnpaid - a.totalUnpaid || a.name.localeCompare(b.name));
  }, [laborers, search, statusFilter]);

  const siteNameById = useMemo(
    () => Object.fromEntries(sites.map((s) => [s.id, s.name])),
    [sites]
  );

  if (userProfile && !["admin", "office"].includes(userProfile.role ?? "")) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">
          Weekly Payouts is available to admin and office users only.
        </Alert>
      </Container>
    );
  }

  const toggleSite = (siteId: string) => {
    setSelectedSiteIds((prev) => {
      if (prev.includes(siteId)) {
        if (prev.length === 1) return prev; // keep at least one site
        return prev.filter((id) => id !== siteId);
      }
      return [...prev, siteId];
    });
  };

  // Keep the drawer's laborer fresh across refetches (clamp warnings aside,
  // the drawer re-opens on the updated row after invalidation).
  const drawerLaborer =
    payTarget != null
      ? laborers.find((l) => l.laborerId === payTarget.laborerId) ?? payTarget
      : null;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PaymentsIcon color="primary" />
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Weekly Payouts
          </Typography>
        </Box>
        <PayoutWeekNavigator weekStart={weekStart} onChange={setWeekStart} />
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.5 }}>
        {activeSites.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            color={selectedSiteIds.includes(s.id) ? "primary" : "default"}
            variant={selectedSiteIds.includes(s.id) ? "filled" : "outlined"}
            onClick={() => toggleSite(s.id)}
            size="small"
          />
        ))}
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <KpiTile label="Cash needed" value={formatCurrencyFull(kpis.cashNeeded)} />
        <KpiTile label="Paid this week" value={formatCurrencyFull(kpis.alreadyPaid)} />
        <KpiTile label="Laborers to pay" value={`${kpis.unpaidCount} of ${kpis.total}`} />
      </Stack>

      <Box sx={{ display: "flex", gap: 1, mb: 2, alignItems: "center" }}>
        <TextField
          placeholder="Search laborer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          fullWidth
          slotProps={{
            input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: "text.disabled" }} /> },
          }}
        />
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          size="small"
          onChange={(_e, v) => v && setStatusFilter(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="unpaid">Owed</ToggleButton>
          <ToggleButton value="settled">Settled</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {consoleQuery.isLoading ? (
        <Stack spacing={1.5}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={76} />
          ))}
        </Stack>
      ) : consoleQuery.isError ? (
        <Alert
          severity="error"
          action={
            <Chip label="Retry" size="small" onClick={() => consoleQuery.refetch()} />
          }
        >
          Could not load the payout console.{" "}
          {(consoleQuery.error as Error | undefined)?.message}
        </Alert>
      ) : visible.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {statusFilter === "unpaid" ? "No one left to pay this week" : "Nothing to show"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {statusFilter === "unpaid"
              ? "Every company laborer with work in this week is settled."
              : "No company-laborer activity for this week on the selected sites."}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {visible.map((l) => (
            <PayoutLaborerCard
              key={l.laborerId}
              laborer={l}
              onPay={setPayTarget}
              onOpenReceipt={(laborer, batch) => setReceipt({ laborer, batch })}
            />
          ))}
        </Stack>
      )}

      <PayLaborerDrawer
        open={payTarget != null}
        laborer={drawerLaborer}
        weekStart={weekStart}
        weekEnd={weekEnd}
        onClose={() => setPayTarget(null)}
      />

      <PayoutBatchReceipt
        open={receipt != null}
        laborer={receipt?.laborer ?? null}
        batch={receipt?.batch ?? null}
        siteNameById={siteNameById}
        onClose={() => setReceipt(null)}
      />
    </Container>
  );
}
