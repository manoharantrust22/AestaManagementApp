"use client";

/**
 * /site/spot-purchase — supervisor-facing "Bought at shop" surface.
 *
 * Two tabs:
 *  - "New purchase" → renders <SpotPurchaseForm /> (Task E)
 *  - "Allocations"  → lists unallocated group-purchase batches (older than
 *    7 days or fully consumed) and lets the office open
 *    <SpotPurchaseAllocatorDialog /> (Task I Step 1) to finalize the split.
 *
 * The active tab is driven by the `?tab=new|allocations` query param so deep
 * links from /site/today and /company/dashboard land directly on the right
 * surface.
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";

import SpotPurchaseForm from "@/components/materials/SpotPurchaseForm";
import { SpotPurchaseAllocatorDialog } from "@/components/materials/SpotPurchaseAllocatorDialog";
import { useUnallocatedSpotBatches } from "@/hooks/queries/useSpotPurchases";
import { useSelectedSite } from "@/contexts/SiteContext";

type TabKey = "new" | "allocations";

function isTabKey(value: string | null): value is TabKey {
  return value === "new" || value === "allocations";
}

export default function SpotPurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedSite } = useSelectedSite();
  const siteGroupId = selectedSite?.site_group_id ?? null;

  const tabParam = searchParams.get("tab");
  const initialTab: TabKey = isTabKey(tabParam) ? tabParam : "new";
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [selectedBatch, setSelectedBatch] = useState<{
    batch_id: string;
    ref_code: string;
    total_amount: number;
  } | null>(null);

  const { data: unallocated = [], isLoading } =
    useUnallocatedSpotBatches(siteGroupId);

  const handleTabChange = (_: unknown, next: TabKey) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/site/spot-purchase?${params.toString()}`);
  };

  const sortedBatches = useMemo(
    () => [...unallocated].sort((a, b) => b.age_days - a.age_days),
    [unallocated],
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: "auto" }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Spot purchase
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Record a &ldquo;bought at shop&rdquo; purchase or finalize older group splits.
          </Typography>
        </Box>

        <Paper variant="outlined">
          <Tabs
            value={tab}
            onChange={handleTabChange}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab value="new" label="New purchase" />
            <Tab
              value="allocations"
              label={
                unallocated.length > 0
                  ? `Allocations (${unallocated.length})`
                  : "Allocations"
              }
            />
          </Tabs>
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            {tab === "new" ? (
              <SpotPurchaseForm />
            ) : (
              <AllocationsList
                isLoading={isLoading}
                batches={sortedBatches}
                hasGroup={!!siteGroupId}
                onOpenBatch={(b) =>
                  setSelectedBatch({
                    batch_id: b.batch_id,
                    ref_code: b.ref_code,
                    total_amount: b.total_amount,
                  })
                }
              />
            )}
          </Box>
        </Paper>
      </Stack>

      <SpotPurchaseAllocatorDialog
        open={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        batchId={selectedBatch?.batch_id ?? null}
        siteGroupId={siteGroupId}
        refCode={selectedBatch?.ref_code ?? null}
        totalAmount={selectedBatch?.total_amount ?? null}
      />
    </Box>
  );
}

interface AllocationsListProps {
  isLoading: boolean;
  batches: Array<{
    batch_id: string;
    ref_code: string;
    purchase_date: string;
    total_amount: number;
    age_days: number;
  }>;
  hasGroup: boolean;
  onOpenBatch: (b: {
    batch_id: string;
    ref_code: string;
    total_amount: number;
  }) => void;
}

function AllocationsList({
  isLoading,
  batches,
  hasGroup,
  onOpenBatch,
}: AllocationsListProps) {
  if (!hasGroup) {
    return (
      <Alert severity="info">
        This site is not part of a site group. Group allocations only apply to
        grouped sites.
      </Alert>
    );
  }
  if (isLoading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading batches…
      </Typography>
    );
  }
  if (batches.length === 0) {
    return (
      <Alert severity="success">
        No batches waiting to be finalized. All group purchases are settled.
      </Alert>
    );
  }
  return (
    <Stack spacing={1}>
      {batches.map((b) => (
        <Paper
          key={b.batch_id}
          variant="outlined"
          sx={{
            p: 1.5,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
          onClick={() =>
            onOpenBatch({
              batch_id: b.batch_id,
              ref_code: b.ref_code,
              total_amount: b.total_amount,
            })
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenBatch({
                batch_id: b.batch_id,
                ref_code: b.ref_code,
                total_amount: b.total_amount,
              });
            }
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {b.ref_code}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {b.purchase_date} · ₹{Number(b.total_amount).toFixed(2)}
              </Typography>
            </Box>
            <Chip
              size="small"
              color={b.age_days >= 14 ? "error" : "warning"}
              label={`${b.age_days}d old`}
            />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
