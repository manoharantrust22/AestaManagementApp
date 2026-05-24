"use client";

/**
 * Yellow warn panel that appears above the filter chips when there are
 * unfinalized group spot batches that need their % split confirmed.
 *
 * Mirrors `AllocationsQueue` in docs/MaterialHub_Redesign/proto-spot.jsx.
 */

import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { useUnallocatedSpotBatches } from "@/hooks/queries/useSpotPurchases";
import { SpotPurchaseAllocatorDialog } from "@/components/materials/SpotPurchaseAllocatorDialog";

export interface AllocationsQueueProps {
  siteGroupId: string | null;
}

export default function AllocationsQueue({ siteGroupId }: AllocationsQueueProps) {
  const { data: batches = [], isLoading } = useUnallocatedSpotBatches(siteGroupId);

  const [selected, setSelected] = useState<{
    batch_id: string;
    ref_code: string;
    total_amount: number;
  } | null>(null);

  // Don't render if there's nothing to allocate (or while loading the first time).
  if (isLoading || batches.length === 0 || !siteGroupId) return null;

  return (
    <>
      <Box
        sx={{
          background: hubTokens.warnSoft,
          border: `1px solid ${hubTokens.warn}`,
          borderRadius: "12px",
          padding: "12px 16px",
          marginTop: "16px",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <NotificationsActiveIcon
            sx={{ color: hubTokens.warn, fontSize: 16 }}
          />
          <Box>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: hubTokens.text,
              }}
            >
              {batches.length} batch{batches.length !== 1 ? "es" : ""} need
              {batches.length !== 1 ? "" : "s"} allocation
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
              Group spot purchases waiting for a final % split between sites.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {batches.map((b) => (
            <Box
              key={b.batch_id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "8px 12px",
                background: hubTokens.card,
                borderRadius: "8px",
                border: `1px solid ${hubTokens.warnSoft}`,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: hubTokens.mono,
                    fontSize: 10.5,
                    color: hubTokens.subtle,
                    fontWeight: 600,
                  }}
                >
                  {b.ref_code}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: hubTokens.mono,
                    fontSize: 12.5,
                    color: hubTokens.text,
                    fontWeight: 700,
                  }}
                >
                  {inr(b.total_amount)}
                </Typography>
                <Box
                  component="span"
                  sx={{
                    padding: "2px 7px",
                    background:
                      b.age_days >= 14 ? hubTokens.dangerSoft : hubTokens.warnSoft,
                    color: b.age_days >= 14 ? hubTokens.danger : hubTokens.warn,
                    borderRadius: "5px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {b.age_days}d old
                </Box>
                {(b.remaining_qty ?? 0) <= 0 && (
                  <Box
                    component="span"
                    sx={{
                      padding: "2px 7px",
                      background: hubTokens.dangerSoft,
                      color: hubTokens.danger,
                      borderRadius: "5px",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    Consumed
                  </Box>
                )}
              </Box>
              <Button
                size="small"
                variant="contained"
                onClick={() =>
                  setSelected({
                    batch_id: b.batch_id,
                    ref_code: b.ref_code,
                    total_amount: b.total_amount,
                  })
                }
                sx={{
                  textTransform: "none",
                  background: hubTokens.warn,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11.5,
                  padding: "5px 12px",
                  minWidth: "auto",
                  "&:hover": { background: hubTokens.warn, filter: "brightness(0.92)" },
                }}
              >
                Finalize
              </Button>
            </Box>
          ))}
        </Box>
      </Box>

      <SpotPurchaseAllocatorDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        batchId={selected?.batch_id ?? null}
        siteGroupId={siteGroupId}
        refCode={selected?.ref_code ?? null}
        totalAmount={selected?.total_amount ?? null}
      />
    </>
  );
}
