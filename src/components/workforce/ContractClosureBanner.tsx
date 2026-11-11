"use client";

import { useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import DoNotDisturbOnRounded from "@mui/icons-material/DoNotDisturbOnRounded";
import dayjs from "dayjs";
import type { ContractClosure } from "@/types/trade.types";
import { closureReasonLabel } from "@/lib/workforce/earlyClosure";
import { useReopenContract } from "@/hooks/queries/useContractClosure";
import { formatCurrencyFull } from "@/lib/formatters";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";

/**
 * Replaces the "Remaining to pay" strip on a contract (or section) that was ended early.
 * Says plainly what happened: when, why, what was written off, and where the unfinished
 * work went. The root contract offers Reopen (the exact reverse).
 */
export function ContractClosureBanner({
  closure,
  contractId,
  siteId,
  isRoot,
  canEdit,
  onOpenNode,
}: {
  closure: ContractClosure;
  contractId: string;
  siteId: string | undefined;
  /** Only the top-level contract can be reopened. */
  isRoot: boolean;
  canEdit: boolean;
  /** Jump to another node (the in-house section that took over). */
  onOpenNode?: (id: string) => void;
}) {
  const reopen = useReopenContract(siteId);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const when = closure.endDate ? dayjs(closure.endDate).format("D MMM YYYY") : null;
  const handed = closure.handedOverTotal ?? 0;
  const written = closure.writtenOff ?? 0;

  const doReopen = async () => {
    setError("");
    try {
      await reopen.mutateAsync(contractId);
      setConfirm(false);
    } catch (e) {
      setError((e as Error)?.message || "Could not reopen.");
    }
  };

  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        borderRadius: `${wsRadius.card}px`,
        bgcolor: wsColors.amberBg,
        border: `1px solid #f3dcb4`,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <DoNotDisturbOnRounded sx={{ fontSize: 20, color: wsColors.amber, mt: 0.1 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: "#8a5306" }}>
            Ended early{when ? ` on ${when}` : ""} · {closureReasonLabel(closure.reason)}
          </Typography>
          <Typography component="div" sx={{ fontSize: 12, color: wsColors.ink2, mt: 0.25 }}>
            {closure.originalValue != null && (
              <>
                Agreed {formatCurrencyFull(closure.originalValue)} → closed at what was paid. Nothing owed either way.
              </>
            )}
            {isRoot && written > 0 && <> {formatCurrencyFull(written)} of unfinished scope came off this contract.</>}
            {isRoot && handed > 0 && <> {formatCurrencyFull(handed)} of it was handed to the In-house crew.</>}
          </Typography>
          {closure.note && (
            <Typography sx={{ fontSize: 12, color: wsColors.muted, mt: 0.25, fontStyle: "italic" }}>
              &ldquo;{closure.note}&rdquo;
            </Typography>
          )}
        </Box>
      </Box>

      {(closure.handedOverToId || (isRoot && closure.handovers.length > 0)) && onOpenNode && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, pl: 3.5 }}>
          {closure.handedOverToId ? (
            <Button size="small" variant="text" onClick={() => onOpenNode(closure.handedOverToId!)} sx={{ textTransform: "none", fontWeight: 700, px: 0.75 }}>
              Open the In-house section that took over →
            </Button>
          ) : (
            closure.handovers.map((h) => (
              <Button
                key={h.to}
                size="small"
                variant="outlined"
                onClick={() => onOpenNode(h.to)}
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 999, py: 0.1 }}
              >
                {h.title} · {formatCurrencyFull(h.amount)}
              </Button>
            ))
          )}
        </Box>
      )}

      {isRoot && canEdit && (
        <Box sx={{ pl: 3.5 }}>
          {confirm ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: 12, color: wsColors.ink2, flex: "1 1 220px" }}>
                Restore the original value and remove the empty In-house sections?
              </Typography>
              <Button size="small" onClick={() => setConfirm(false)} disabled={reopen.isPending}>
                Keep ended
              </Button>
              <Button size="small" variant="contained" onClick={doReopen} disabled={reopen.isPending}>
                {reopen.isPending ? "Reopening…" : "Reopen"}
              </Button>
            </Box>
          ) : (
            <Button size="small" onClick={() => setConfirm(true)} sx={{ textTransform: "none", px: 0.75 }}>
              Reopen contract
            </Button>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 0.75, fontSize: 12 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
