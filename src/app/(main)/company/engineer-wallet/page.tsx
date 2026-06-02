"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ArrowBack, Person } from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import {
  useCompanyWalletLedger,
  useEngineerSiteBalances,
  useEngineerWalletLedger,
  useEngineerWalletPools,
  useWalletEnabledEngineers,
} from "@/hooks/queries/useEngineerWalletV2";
import WalletLedgerList from "@/components/wallet-v2/WalletLedgerList";
import WalletSourcePoolsCard from "@/components/wallet-v2/WalletSourcePoolsCard";
import AddFundsDialog from "@/components/wallet-v2/AddFundsDialog";
import EditDepositDialog from "@/components/wallet-v2/EditDepositDialog";
import type {
  EngineerSiteBalance,
  WalletEnabledEngineer,
  WalletLedgerEntry,
  WalletLedgerFilters,
} from "@/types/engineer-wallet-v2.types";

import SummaryMetricsRow, { type SummaryMetrics } from "./_components/SummaryMetricsRow";
import AllocationAcrossSitesTable from "./_components/AllocationAcrossSitesTable";
import DateRangeChip from "./_components/DateRangeChip";
import FilterChipBar from "./_components/FilterChipBar";
import EngineerRail from "./_components/EngineerRail";
import {
  dateRangePreset,
  presetLabel,
  type DateRangePreset,
} from "./_utils/dateRangePreset";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

type LedgerTab = "all" | "deposit" | "spend" | "return";

const VALID_RANGES: DateRangePreset[] = ["all", "today", "week", "month"];
const VALID_TABS: LedgerTab[] = ["all", "deposit", "spend", "return"];

export default function CompanyEngineerWalletPage() {
  const { userProfile } = useAuth();
  const { selectedCompany } = useSelectedCompany();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const companyId = selectedCompany?.id ?? undefined;

  const router = useRouter();
  const searchParams = useSearchParams();

  const engineerId = searchParams.get("engineerId");
  const siteId = searchParams.get("siteId");
  const range = (VALID_RANGES.includes(searchParams.get("range") as DateRangePreset)
    ? searchParams.get("range")
    : "all") as DateRangePreset;
  const tab = (VALID_TABS.includes(searchParams.get("type") as LedgerTab)
    ? searchParams.get("type")
    : "all") as LedgerTab;

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const [addState, setAddState] = useState<{
    open: boolean;
    siteId: string;
    engineerId: string;
  }>({ open: false, siteId: "", engineerId: "" });
  const [returnState, setReturnState] = useState<{
    open: boolean;
    siteId: string;
    engineerId: string;
  }>({ open: false, siteId: "", engineerId: "" });
  const [editingDeposit, setEditingDeposit] = useState<WalletLedgerEntry | null>(null);

  const canEditDeposits = userProfile?.role !== "site_engineer";

  const engineersQuery = useWalletEnabledEngineers(companyId);
  const engineers = engineersQuery.data ?? [];

  // With exactly one wallet-enabled engineer, the "all engineers" overview is
  // just that engineer's data behind an extra click — so default straight into
  // their wallet. An explicit ?engineerId in the URL always wins.
  const soleEngineerId = engineers.length === 1 ? engineers[0].user_id : null;
  const effectiveEngineerId = engineerId ?? soleEngineerId;
  const selectedEngineer =
    engineers.find((e) => e.user_id === effectiveEngineerId) ?? null;

  // Mode: A = all engineers overview, B = per-engineer drill.
  const isModeB = !!selectedEngineer;

  if (!userProfile) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">Not signed in</Alert>
      </Container>
    );
  }

  const dialogEngineer =
    addState.engineerId
      ? engineers.find((e) => e.user_id === addState.engineerId)
      : returnState.engineerId
      ? engineers.find((e) => e.user_id === returnState.engineerId)
      : selectedEngineer;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Engineer Wallets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {engineers.length} active wallet{engineers.length === 1 ? "" : "s"} · Total held ₹
            {fmt(engineers.reduce((s, e) => s + e.total_balance, 0))}
            {range !== "all" && ` · Activity scoped to ${presetLabel(range).toLowerCase()}`}
          </Typography>
        </Box>
        <DateRangeChip
          value={range}
          onChange={(next) => setParam({ range: next === "all" ? null : next })}
        />
      </Stack>

      {/* Engineer rail: a chooser across engineers. Hidden entirely when there's
          only one engineer (nothing to choose — they're auto-selected), and
          hidden in Mode B on mobile to save space. */}
      {!soleEngineerId && (!isMobile || !isModeB) && (
        <Box sx={{ mb: 2 }}>
          <EngineerRail
            engineers={engineers}
            isLoading={engineersQuery.isLoading}
            selectedId={effectiveEngineerId}
            onSelect={(id) =>
              setParam({
                engineerId: id,
                // Drop site filter on engineer switch (different engineers have same
                // site set today, but keeping the filter across switches is surprising).
                siteId: null,
              })
            }
          />
        </Box>
      )}

      {isModeB && selectedEngineer ? (
        <EngineerDetailPanel
          engineer={selectedEngineer}
          companyId={companyId as string}
          siteId={siteId}
          range={range}
          tab={tab}
          hideBack={!!soleEngineerId}
          onBack={() => setParam({ engineerId: null, siteId: null })}
          onSelectSite={(s) => setParam({ siteId: s })}
          onChangeTab={(t) => setParam({ type: t === "all" ? null : t })}
          onAdd={(s) =>
            setAddState({ open: true, siteId: s, engineerId: selectedEngineer.user_id })
          }
          onReturn={(s) =>
            setReturnState({ open: true, siteId: s, engineerId: selectedEngineer.user_id })
          }
          onEditDeposit={canEditDeposits ? (row) => setEditingDeposit(row) : undefined}
        />
      ) : (
        <AllEngineersOverview
          engineers={engineers}
          engineersLoading={engineersQuery.isLoading}
          companyId={companyId as string}
          siteId={siteId}
          range={range}
          tab={tab}
          onSelectSite={(s) => setParam({ siteId: s })}
          onChangeTab={(t) => setParam({ type: t === "all" ? null : t })}
          onEditDeposit={canEditDeposits ? (row) => setEditingDeposit(row) : undefined}
        />
      )}

      {addState.open && addState.engineerId && (
        <AddFundsDialog
          open={addState.open}
          onClose={() =>
            setAddState({ open: false, siteId: "", engineerId: "" })
          }
          engineerId={addState.engineerId}
          engineerName={dialogEngineer?.name ?? "Engineer"}
          recordedBy={userProfile.name ?? "Office"}
          recordedByUserId={userProfile.id}
          lockedSiteId={addState.siteId || undefined}
        />
      )}
      {returnState.open && returnState.engineerId && (
        <AddFundsDialog
          open={returnState.open}
          onClose={() =>
            setReturnState({ open: false, siteId: "", engineerId: "" })
          }
          mode="return"
          engineerId={returnState.engineerId}
          engineerName={dialogEngineer?.name ?? "Engineer"}
          recordedBy={userProfile.name ?? "Office"}
          recordedByUserId={userProfile.id}
          lockedSiteId={returnState.siteId || undefined}
        />
      )}
      <EditDepositDialog
        open={editingDeposit !== null}
        onClose={() => setEditingDeposit(null)}
        deposit={editingDeposit}
        engineerName={
          editingDeposit
            ? engineers.find((e) => e.user_id === editingDeposit.user_id)?.name ?? "Engineer"
            : "Engineer"
        }
        editorName={userProfile.name ?? "Office"}
        editorUserId={userProfile.id}
      />
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Mode A — All Engineers overview
// ---------------------------------------------------------------------------

function AllEngineersOverview({
  engineers,
  engineersLoading,
  companyId,
  siteId,
  range,
  tab,
  onSelectSite,
  onChangeTab,
  onEditDeposit,
}: {
  engineers: WalletEnabledEngineer[];
  engineersLoading: boolean;
  companyId: string;
  siteId: string | null;
  range: DateRangePreset;
  tab: LedgerTab;
  onSelectSite: (siteId: string | null) => void;
  onChangeTab: (t: LedgerTab) => void;
  onEditDeposit?: (row: WalletLedgerEntry) => void;
}) {
  const dateRange = useMemo(() => dateRangePreset(range), [range]);
  const userIds = useMemo(() => engineers.map((e) => e.user_id), [engineers]);

  const filters: Omit<WalletLedgerFilters, "cursor"> = useMemo(
    () => ({
      type: tab,
      date_from: dateRange.date_from,
      date_to: dateRange.date_to,
      site_id: siteId,
    }),
    [tab, dateRange.date_from, dateRange.date_to, siteId]
  );
  const ledger = useCompanyWalletLedger(companyId, userIds, filters);

  // Aggregate per-site allocation by merging each engineer's sites[] into a
  // single map keyed by site_id. All engineers share the same site set today,
  // but the merge tolerates any divergence.
  const aggregatedAllocation: EngineerSiteBalance[] = useMemo(() => {
    const map = new Map<string, EngineerSiteBalance>();
    for (const eng of engineers) {
      for (const s of eng.sites) {
        const existing = map.get(s.site_id);
        if (existing) {
          existing.balance += s.balance;
          existing.total_deposited = (existing.total_deposited ?? 0) + (s.total_deposited ?? 0);
          existing.total_spent = (existing.total_spent ?? 0) + (s.total_spent ?? 0);
          existing.total_returned = (existing.total_returned ?? 0) + (s.total_returned ?? 0);
          if (
            s.last_txn_at &&
            (!existing.last_txn_at || s.last_txn_at > existing.last_txn_at)
          ) {
            existing.last_txn_at = s.last_txn_at;
          }
        } else {
          map.set(s.site_id, { ...s });
        }
      }
    }
    return [...map.values()];
  }, [engineers]);

  const metrics: SummaryMetrics = useMemo(() => {
    const scope = siteId
      ? aggregatedAllocation.filter((b) => b.site_id === siteId)
      : aggregatedAllocation;
    return {
      held: scope.reduce((s, b) => s + b.balance, 0),
      deposited: scope.reduce((s, b) => s + (b.total_deposited ?? 0), 0),
      spent: scope.reduce((s, b) => s + (b.total_spent ?? 0), 0),
      returned: scope.reduce((s, b) => s + (b.total_returned ?? 0), 0),
    };
  }, [aggregatedAllocation, siteId]);

  const selectedSite = aggregatedAllocation.find((b) => b.site_id === siteId) ?? null;

  const engineerNameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    engineers.forEach((e) => m.set(e.user_id, e.name));
    return m;
  }, [engineers]);

  const siteNameBySiteId = useMemo(() => {
    const m = new Map<string, string>();
    aggregatedAllocation.forEach((s) => m.set(s.site_id, s.site_name));
    return m;
  }, [aggregatedAllocation]);

  const activeFilters = siteId && selectedSite
    ? [
        {
          key: "site",
          label: `Site: ${selectedSite.site_name}`,
          onRemove: () => onSelectSite(null),
        },
      ]
    : [];

  // In Mode A we don't expose per-row Add/Return (no engineer scope on a row).
  // Office picks an engineer card first to make a deposit.
  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <SummaryMetricsRow
          metrics={metrics}
          isLoading={engineersLoading}
          caption={
            siteId && selectedSite
              ? {
                  held: `On ${selectedSite.site_name}`,
                  deposited: `Into ${selectedSite.site_name}`,
                  spent: `From ${selectedSite.site_name}`,
                  returned: `From ${selectedSite.site_name}`,
                }
              : {
                  held: "Across all sites · all engineers",
                  deposited: "All-time total",
                  spent: "All-time total",
                  returned: "All-time total",
                }
          }
        />
      </Box>

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontWeight: 600,
          }}
        >
          Allocation across sites
        </Typography>
        <AllocationAcrossSitesTable
          rows={aggregatedAllocation}
          isLoading={engineersLoading}
          selectedSiteId={siteId}
          onSelect={onSelectSite}
          emptyMessage="No active sites for this company."
        />
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Activity across engineers
        </Typography>
        <FilterChipBar filters={activeFilters} />
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v: LedgerTab) => onChangeTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: "divider", minHeight: 40 }}
      >
        <Tab label="All" value="all" sx={{ minHeight: 40, textTransform: "none" }} />
        <Tab label="Deposits" value="deposit" sx={{ minHeight: 40, textTransform: "none" }} />
        <Tab label="Spends" value="spend" sx={{ minHeight: 40, textTransform: "none" }} />
        <Tab label="Returns" value="return" sx={{ minHeight: 40, textTransform: "none" }} />
      </Tabs>

      <Box sx={{ mt: 1 }}>
        <WalletLedgerList
          pages={ledger.data?.pages ?? []}
          isLoading={ledger.isLoading}
          hasNextPage={!!ledger.hasNextPage}
          isFetchingNextPage={ledger.isFetchingNextPage}
          onLoadMore={() => ledger.fetchNextPage()}
          engineerNameByUserId={engineerNameByUserId}
          siteNameBySiteId={siteId ? undefined : siteNameBySiteId}
          onRowClick={
            onEditDeposit
              ? (row) => {
                  if (row.transaction_type === "deposit") onEditDeposit(row);
                }
              : undefined
          }
        />
      </Box>

    </Box>
  );
}

// ---------------------------------------------------------------------------
// Mode B — Per-engineer drill
// ---------------------------------------------------------------------------

function EngineerDetailPanel({
  engineer,
  companyId,
  siteId,
  range,
  tab,
  hideBack,
  onBack,
  onSelectSite,
  onChangeTab,
  onAdd,
  onReturn,
  onEditDeposit,
}: {
  engineer: WalletEnabledEngineer;
  companyId: string;
  siteId: string | null;
  range: DateRangePreset;
  tab: LedgerTab;
  hideBack?: boolean;
  onBack: () => void;
  onSelectSite: (siteId: string | null) => void;
  onChangeTab: (t: LedgerTab) => void;
  onAdd: (siteId: string) => void;
  onReturn: (siteId: string) => void;
  onEditDeposit?: (row: WalletLedgerEntry) => void;
}) {
  const engineerId = engineer.user_id;
  const engineerName = engineer.name;

  const siteBalancesQuery = useEngineerSiteBalances(engineerId, companyId);
  const siteBalances = siteBalancesQuery.data ?? [];

  const dateRange = useMemo(() => dateRangePreset(range), [range]);

  const filters: Omit<WalletLedgerFilters, "cursor"> = useMemo(
    () => ({
      type: tab,
      date_from: dateRange.date_from,
      date_to: dateRange.date_to,
      site_id: siteId,
    }),
    [tab, dateRange.date_from, dateRange.date_to, siteId]
  );
  const ledger = useEngineerWalletLedger(engineerId, filters);

  const poolsQuery = useEngineerWalletPools(engineerId, siteId ?? undefined);

  const metrics: SummaryMetrics = useMemo(() => {
    const scope = siteId
      ? siteBalances.filter((b) => b.site_id === siteId)
      : siteBalances;
    return {
      held: scope.reduce((s, b) => s + b.balance, 0),
      deposited: scope.reduce((s, b) => s + (b.total_deposited ?? 0), 0),
      spent: scope.reduce((s, b) => s + (b.total_spent ?? 0), 0),
      returned: scope.reduce((s, b) => s + (b.total_returned ?? 0), 0),
    };
  }, [siteBalances, siteId]);

  const selectedSite = siteBalances.find((b) => b.site_id === siteId) ?? null;

  const siteNameBySiteId = useMemo(() => {
    const m = new Map<string, string>();
    siteBalances.forEach((s) => m.set(s.site_id, s.site_name));
    return m;
  }, [siteBalances]);

  const activeFilters = siteId && selectedSite
    ? [
        {
          key: "site",
          label: `Site: ${selectedSite.site_name}`,
          onRemove: () => onSelectSite(null),
        },
      ]
    : [];

  return (
    <Box>
      {!hideBack && (
        <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 1 }} size="small">
          All engineers
        </Button>
      )}

      <Card
        elevation={0}
        sx={{ border: 1, borderColor: "divider", borderRadius: 2, mb: 2 }}
      >
        <CardContent sx={{ "&:last-child": { pb: 2 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={1.5}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar
                src={engineer.avatar_url ?? undefined}
                sx={{ bgcolor: "primary.main", width: 44, height: 44 }}
              >
                {engineerName?.[0] ?? <Person />}
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {engineerName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ₹{fmt(metrics.held)} held across {siteBalances.length} site
                  {siteBalances.length === 1 ? "" : "s"}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ mb: 2 }}>
        {siteBalancesQuery.isLoading ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <SummaryMetricsRow
            metrics={metrics}
            caption={
              siteId && selectedSite
                ? {
                    held: `On ${selectedSite.site_name}`,
                    deposited: `Into ${selectedSite.site_name}`,
                    spent: `From ${selectedSite.site_name}`,
                    returned: `From ${selectedSite.site_name}`,
                  }
                : {
                    held: "Across all sites",
                    deposited: "All-time total",
                    spent: "All-time total",
                    returned: "All-time total",
                  }
            }
          />
        )}
      </Box>

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontWeight: 600,
          }}
        >
          Allocation across sites
        </Typography>
        <AllocationAcrossSitesTable
          rows={siteBalances}
          isLoading={siteBalancesQuery.isLoading}
          selectedSiteId={siteId}
          onSelect={onSelectSite}
          onAdd={onAdd}
          onReturn={onReturn}
          emptyMessage="No active sites for this company."
        />
      </Stack>

      {siteId && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
              display: "block",
              mb: 0.5,
            }}
          >
            Funding source breakdown
            {selectedSite ? ` — ${selectedSite.site_name}` : ""}
          </Typography>
          <WalletSourcePoolsCard pools={poolsQuery.data} isLoading={poolsQuery.isLoading} />
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Activity
        </Typography>
        <FilterChipBar filters={activeFilters} />
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v: LedgerTab) => onChangeTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: "divider", minHeight: 40 }}
      >
        <Tab label="All" value="all" sx={{ minHeight: 40, textTransform: "none" }} />
        <Tab label="Deposits" value="deposit" sx={{ minHeight: 40, textTransform: "none" }} />
        <Tab label="Spends" value="spend" sx={{ minHeight: 40, textTransform: "none" }} />
        <Tab label="Returns" value="return" sx={{ minHeight: 40, textTransform: "none" }} />
      </Tabs>

      <Box sx={{ mt: 1 }}>
        <WalletLedgerList
          pages={ledger.data?.pages ?? []}
          isLoading={ledger.isLoading}
          hasNextPage={!!ledger.hasNextPage}
          isFetchingNextPage={ledger.isFetchingNextPage}
          onLoadMore={() => ledger.fetchNextPage()}
          siteNameBySiteId={siteId ? undefined : siteNameBySiteId}
          onRowClick={
            onEditDeposit
              ? (row) => {
                  if (row.transaction_type === "deposit") onEditDeposit(row);
                }
              : undefined
          }
        />
      </Box>
    </Box>
  );
}
