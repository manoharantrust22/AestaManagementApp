"use client";

import React, { useMemo, useState } from "react";
import { Box, Chip, Stack } from "@mui/material";
import { LinkOff } from "@mui/icons-material";
import WalletLedgerList from "./WalletLedgerList";
import { useUnlinkedWalletSpends } from "@/hooks/queries/useEngineerWalletV2";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";

interface WalletLedgerWithUnlinkedProps {
  /** Normal paginated ledger (from useEngineerWalletLedger / useCompanyWalletLedger). */
  pages: { rows: WalletLedgerEntry[] }[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onRowClick?: (entry: WalletLedgerEntry) => void;
  onSpendClick?: (entry: WalletLedgerEntry) => void;
  engineerNameByUserId?: Map<string, string>;
  siteNameBySiteId?: Map<string, string>;
  /** Scope for the orphan lookup. siteId null/omitted = across all of these engineers' sites. */
  unlinkedScope: { userIds: string[]; siteId?: string | null };
}

/**
 * Wraps WalletLedgerList with orphan-spend awareness:
 * - badges spend rows that aren't linked to any expense/settlement ("Not linked"), and
 * - offers a "show only unlinked" toggle that swaps the feed for the full (rare) set
 *   of orphan spends in scope — independent of the normal ledger's pagination.
 *
 * Keeps WalletLedgerList presentational; the data fetch + filter state live here so
 * the per-engineer, all-engineers, and my-wallet call sites stay simple.
 */
export default function WalletLedgerWithUnlinked({
  pages,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRowClick,
  onSpendClick,
  engineerNameByUserId,
  siteNameBySiteId,
  unlinkedScope,
}: WalletLedgerWithUnlinkedProps) {
  const unlinkedQuery = useUnlinkedWalletSpends(
    unlinkedScope.userIds,
    unlinkedScope.siteId ?? null
  );
  const unlinkedRows = useMemo(() => unlinkedQuery.data ?? [], [unlinkedQuery.data]);
  const unlinkedIdSet = useMemo(
    () => new Set(unlinkedRows.map((r) => r.id)),
    [unlinkedRows]
  );
  const count = unlinkedIdSet.size;

  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  // Never get stuck "filtered to nothing": only honour the filter while orphans exist.
  const showOnlyUnlinked = unlinkedOnly && count > 0;

  return (
    <Box>
      {count > 0 && (
        <Stack direction="row" sx={{ mb: 1 }}>
          <Chip
            size="small"
            icon={<LinkOff sx={{ fontSize: "0.9rem" }} />}
            color="error"
            variant={showOnlyUnlinked ? "filled" : "outlined"}
            label={
              showOnlyUnlinked
                ? `Showing ${count} unlinked · show all`
                : `${count} not linked — show only`
            }
            onClick={() => setUnlinkedOnly((v) => !v)}
            {...(showOnlyUnlinked
              ? { onDelete: () => setUnlinkedOnly(false) }
              : {})}
          />
        </Stack>
      )}

      <WalletLedgerList
        pages={showOnlyUnlinked ? [{ rows: unlinkedRows }] : pages}
        isLoading={showOnlyUnlinked ? unlinkedQuery.isLoading : isLoading}
        hasNextPage={showOnlyUnlinked ? false : hasNextPage}
        isFetchingNextPage={showOnlyUnlinked ? false : isFetchingNextPage}
        onLoadMore={showOnlyUnlinked ? () => {} : onLoadMore}
        onRowClick={onRowClick}
        onSpendClick={onSpendClick}
        engineerNameByUserId={engineerNameByUserId}
        siteNameBySiteId={siteNameBySiteId}
        unlinkedSpendIds={unlinkedIdSet}
      />
    </Box>
  );
}
