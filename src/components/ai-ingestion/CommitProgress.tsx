/**
 * Linear progress shown while the commit RPC runs. Phases match the steps the
 * mode config emits via `onPhaseChange`.
 */

"use client";

import { Alert, Box, LinearProgress, Stack, Typography } from "@mui/material";

import type { CommitState } from "@/lib/ai-ingestion/types";

const PHASE_PERCENT: Record<CommitState["phase"], number> = {
  uploading: 25,
  rpc: 70,
  invalidating: 90,
  complete: 100,
  failed: 100,
};

interface CommitProgressProps {
  state: CommitState;
}

export default function CommitProgress({ state }: CommitProgressProps) {
  const isError = state.phase === "failed";
  const items = state.items;
  const isBatch = !!items && items.length > 0;
  const batchValue = isBatch
    ? Math.round(
        (items.filter((i) => i.status === "done" || i.status === "failed").length / items.length) *
          100,
      )
    : PHASE_PERCENT[state.phase];

  return (
    <Stack spacing={2}>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {isError ? "Commit failed" : state.message}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={batchValue}
        color={isError ? "error" : "primary"}
      />

      {isBatch ? (
        <Stack spacing={0.5}>
          {items.map((it, idx) => (
            <Stack key={idx} direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ flexGrow: 1 }} noWrap>
                {it.label}
              </Typography>
              <Typography
                variant="caption"
                color={
                  it.status === "failed"
                    ? "error.main"
                    : it.status === "done"
                      ? "success.main"
                      : "text.secondary"
                }
              >
                {it.status === "done"
                  ? "✓ saved"
                  : it.status === "failed"
                    ? "✕ failed"
                    : it.status === "saving"
                      ? "saving…"
                      : "queued"}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}

      {state.error ? (
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
          {state.error}
        </Alert>
      ) : (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Don&apos;t close the dialog until this finishes.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}
