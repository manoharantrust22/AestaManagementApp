"use client";

export const dynamic = "force-dynamic";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { KeyboardReturn, LocationOff } from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import {
  useEngineerWalletBalance,
  useEngineerWalletLedger,
} from "@/hooks/queries/useEngineerWalletV2";
import WalletBalanceCard from "@/components/wallet-v2/WalletBalanceCard";
import WalletLedgerList from "@/components/wallet-v2/WalletLedgerList";
import AddFundsDialog from "@/components/wallet-v2/AddFundsDialog";
import type { WalletLedgerFilters } from "@/types/engineer-wallet-v2.types";

type LedgerTab = "all" | "deposit" | "spend" | "return";

export default function MyWalletPage() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const [tab, setTab] = useState<LedgerTab>("all");
  const [returnOpen, setReturnOpen] = useState(false);

  const filters: Omit<WalletLedgerFilters, "cursor"> = {
    type: tab === "all" ? "all" : tab,
    site_id: selectedSite?.id ?? null,
  };

  const balanceQuery = useEngineerWalletBalance(userProfile?.id, selectedSite?.id);
  const ledgerQuery = useEngineerWalletLedger(userProfile?.id, filters);

  if (!userProfile) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="warning">Not signed in</Alert>
      </Container>
    );
  }

  if (!selectedSite) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert
          severity="info"
          icon={<LocationOff />}
          sx={{ "& .MuiAlert-icon": { alignItems: "center" } }}
        >
          Pick a site from the header to see your wallet for that site.
        </Alert>
      </Container>
    );
  }

  return (
    <Container
      maxWidth="sm"
      sx={{
        py: { xs: 2, sm: 3 },
        px: { xs: 1.5, sm: 2 },
      }}
    >
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          backgroundColor: "background.default",
          pb: 1.5,
          mx: { xs: -1.5, sm: -2 },
          px: { xs: 1.5, sm: 2 },
        }}
      >
        <WalletBalanceCard
          engineerName={userProfile.name ?? "Your"}
          siteName={selectedSite.name}
          balance={balanceQuery.data}
          isLoading={balanceQuery.isLoading}
          actions={
            <Button
              fullWidth
              size="small"
              variant="contained"
              onClick={() => setReturnOpen(true)}
              disabled={(balanceQuery.data?.balance ?? 0) <= 0}
              startIcon={<KeyboardReturn />}
              sx={{
                bgcolor: "rgba(255,255,255,0.18)",
                color: "common.white",
                "&:hover": { bgcolor: "rgba(255,255,255,0.28)" },
                "&.Mui-disabled": { bgcolor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" },
              }}
            >
              Record return
            </Button>
          }
        />
      </Box>

      <Stack spacing={2} sx={{ mt: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v: LedgerTab) => setTab(v)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: "divider", minHeight: 40 }}
        >
          <Tab label="All" value="all" sx={{ minHeight: 40 }} />
          <Tab label="Deposits" value="deposit" sx={{ minHeight: 40 }} />
          <Tab label="Spends" value="spend" sx={{ minHeight: 40 }} />
          <Tab label="Returns" value="return" sx={{ minHeight: 40 }} />
        </Tabs>

        <WalletLedgerList
          pages={ledgerQuery.data?.pages ?? []}
          isLoading={ledgerQuery.isLoading}
          hasNextPage={!!ledgerQuery.hasNextPage}
          isFetchingNextPage={ledgerQuery.isFetchingNextPage}
          onLoadMore={() => ledgerQuery.fetchNextPage()}
        />
      </Stack>

      <AddFundsDialog
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        mode="return"
        engineerId={userProfile.id}
        engineerName={userProfile.name ?? "You"}
        recordedBy={userProfile.name ?? "Engineer"}
        recordedByUserId={userProfile.id}
        lockedSiteId={selectedSite.id}
      />
    </Container>
  );
}
