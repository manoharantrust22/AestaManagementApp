"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Grid,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  ArrowBack,
  KeyboardReturn,
  Person,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import {
  useEngineerSiteBalances,
  useEngineerWalletLedger,
  useWalletEnabledEngineers,
} from "@/hooks/queries/useEngineerWalletV2";
import WalletBalanceCard from "@/components/wallet-v2/WalletBalanceCard";
import WalletLedgerList from "@/components/wallet-v2/WalletLedgerList";
import AddFundsDialog from "@/components/wallet-v2/AddFundsDialog";
import type { WalletLedgerFilters } from "@/types/engineer-wallet-v2.types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

type LedgerTab = "all" | "deposit" | "spend" | "return";

export default function CompanyEngineerWalletPage() {
  const { userProfile } = useAuth();
  const { selectedCompany } = useSelectedCompany();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const companyId = selectedCompany?.id ?? undefined;

  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  // Per-site dialog state — siteId-scoped so each card opens locked to that site.
  const [addState, setAddState] = useState<{ open: boolean; siteId: string }>({
    open: false,
    siteId: "",
  });
  const [returnState, setReturnState] = useState<{ open: boolean; siteId: string }>({
    open: false,
    siteId: "",
  });
  const [tab, setTab] = useState<LedgerTab>("all");

  const engineersQuery = useWalletEnabledEngineers(companyId);
  const engineers = engineersQuery.data ?? [];

  // Auto-select first engineer when loaded (desktop only).
  useEffect(() => {
    if (!isMobile && !selectedEngineerId && engineers.length > 0) {
      setSelectedEngineerId(engineers[0].user_id);
    }
  }, [engineers, isMobile, selectedEngineerId]);

  if (!userProfile) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">Not signed in</Alert>
      </Container>
    );
  }

  const showDetail = !isMobile || selectedEngineerId !== null;
  const showList = !isMobile || selectedEngineerId === null;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Engineer Wallets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {engineers.length} active wallet{engineers.length === 1 ? "" : "s"} • Total balance ₹
            {fmt(engineers.reduce((s, e) => s + e.total_balance, 0))}
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        {showList && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={1.5}>
              {engineersQuery.isLoading && (
                <>
                  <Skeleton variant="rounded" height={84} />
                  <Skeleton variant="rounded" height={84} />
                </>
              )}
              {engineers.map((eng) => (
                <Card
                  key={eng.user_id}
                  elevation={0}
                  sx={{
                    border: "1px solid",
                    borderColor:
                      selectedEngineerId === eng.user_id ? "primary.main" : "divider",
                    borderRadius: 2,
                    transition: "border-color 0.15s",
                  }}
                >
                  <CardActionArea onClick={() => setSelectedEngineerId(eng.user_id)}>
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5 }}>
                      <Avatar src={eng.avatar_url ?? undefined} sx={{ bgcolor: "primary.light" }}>
                        {eng.name?.[0] ?? <Person />}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {eng.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {eng.last_txn_at
                            ? `Last: ${dayjs(eng.last_txn_at).format("D MMM")}`
                            : "No activity"}
                        </Typography>
                      </Box>
                      <Stack alignItems="flex-end">
                        <Typography variant="body2" fontWeight={700}>
                          ₹ {fmt(eng.total_balance)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {eng.sites.length} site{eng.sites.length === 1 ? "" : "s"}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
              {!engineersQuery.isLoading && engineers.length === 0 && (
                <Alert severity="info">
                  No wallet-enabled members yet. Set <code>wallet_enabled = true</code>
                  {" "}on a company_members row to opt them in.
                </Alert>
              )}
            </Stack>
          </Grid>
        )}

        {showDetail && selectedEngineerId && (
          <Grid size={{ xs: 12, md: 8 }}>
            <EngineerDetailPanel
              engineerId={selectedEngineerId}
              engineerName={
                engineers.find((e) => e.user_id === selectedEngineerId)?.name ?? "Engineer"
              }
              companyId={companyId as string}
              tab={tab}
              setTab={setTab}
              onBack={isMobile ? () => setSelectedEngineerId(null) : undefined}
              onAdd={(siteId) => setAddState({ open: true, siteId })}
              onReturn={(siteId) => setReturnState({ open: true, siteId })}
            />
          </Grid>
        )}
      </Grid>

      {selectedEngineerId && (
        <>
          <AddFundsDialog
            open={addState.open}
            onClose={() => setAddState({ open: false, siteId: "" })}
            engineerId={selectedEngineerId}
            engineerName={
              engineers.find((e) => e.user_id === selectedEngineerId)?.name ?? "Engineer"
            }
            recordedBy={userProfile.name ?? "Office"}
            recordedByUserId={userProfile.id}
            lockedSiteId={addState.siteId || undefined}
          />
          <AddFundsDialog
            open={returnState.open}
            onClose={() => setReturnState({ open: false, siteId: "" })}
            mode="return"
            engineerId={selectedEngineerId}
            engineerName={
              engineers.find((e) => e.user_id === selectedEngineerId)?.name ?? "Engineer"
            }
            recordedBy={userProfile.name ?? "Office"}
            recordedByUserId={userProfile.id}
            lockedSiteId={returnState.siteId || undefined}
          />
        </>
      )}
    </Container>
  );
}

function EngineerDetailPanel({
  engineerId,
  engineerName,
  companyId,
  tab,
  setTab,
  onBack,
  onAdd,
  onReturn,
}: {
  engineerId: string;
  engineerName: string;
  companyId: string;
  tab: LedgerTab;
  setTab: (t: LedgerTab) => void;
  onBack?: () => void;
  onAdd: (siteId: string) => void;
  onReturn: (siteId: string) => void;
}) {
  const filters: Omit<WalletLedgerFilters, "cursor"> = {
    type: tab === "all" ? "all" : tab,
  };
  const siteBalances = useEngineerSiteBalances(engineerId, companyId);
  const ledger = useEngineerWalletLedger(engineerId, filters);

  return (
    <Box>
      {onBack && (
        <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 1 }} size="small">
          Back to list
        </Button>
      )}

      <Stack spacing={2}>
        {siteBalances.isLoading && (
          <>
            <Skeleton variant="rounded" height={180} />
            <Skeleton variant="rounded" height={180} />
          </>
        )}
        {(siteBalances.data ?? []).map((siteBal) => (
          <WalletBalanceCard
            key={siteBal.site_id}
            engineerName={engineerName}
            siteName={siteBal.site_name}
            balance={siteBal}
            isLoading={false}
            actions={
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  variant="contained"
                  size="small"
                  onClick={() => onAdd(siteBal.site_id)}
                  startIcon={<AddIcon />}
                  sx={{
                    bgcolor: "common.white",
                    color: "primary.dark",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.9)" },
                  }}
                >
                  Add funds
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  onClick={() => onReturn(siteBal.site_id)}
                  startIcon={<KeyboardReturn />}
                  disabled={siteBal.balance <= 0}
                  sx={{
                    color: "common.white",
                    borderColor: "rgba(255,255,255,0.5)",
                    "&:hover": { borderColor: "common.white", bgcolor: "rgba(255,255,255,0.08)" },
                    "&.Mui-disabled": { color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.2)" },
                  }}
                >
                  Return
                </Button>
              </Stack>
            }
          />
        ))}
        {!siteBalances.isLoading && (siteBalances.data?.length ?? 0) === 0 && (
          <Alert severity="info">No active sites for this company.</Alert>
        )}
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v: LedgerTab) => setTab(v)}
        variant="fullWidth"
        sx={{ mt: 3, borderBottom: 1, borderColor: "divider", minHeight: 40 }}
      >
        <Tab label="All" value="all" sx={{ minHeight: 40 }} />
        <Tab label="Deposits" value="deposit" sx={{ minHeight: 40 }} />
        <Tab label="Spends" value="spend" sx={{ minHeight: 40 }} />
        <Tab label="Returns" value="return" sx={{ minHeight: 40 }} />
      </Tabs>

      <Box sx={{ mt: 1 }}>
        <WalletLedgerList
          pages={ledger.data?.pages ?? []}
          isLoading={ledger.isLoading}
          hasNextPage={!!ledger.hasNextPage}
          isFetchingNextPage={ledger.isFetchingNextPage}
          onLoadMore={() => ledger.fetchNextPage()}
        />
      </Box>
    </Box>
  );
}
