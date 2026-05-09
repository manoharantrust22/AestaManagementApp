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
  return (
    <Stack spacing={2}>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {isError ? "Commit failed" : state.message}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={PHASE_PERCENT[state.phase]}
        color={isError ? "error" : "primary"}
      />
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
