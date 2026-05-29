"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

/**
 * Uniform error/retry fallback for InspectPane tab queries.
 *
 * Every InspectPane tab used to render ONLY an `isLoading` skeleton with no
 * error branch — so when a query failed (or got stuck in the post-idle
 * connection-pool timeout loop), the skeleton showed forever. This component
 * is the escape hatch: render it on `isError` so a failed query always ends in
 * a tappable "Retry" instead of an endless skeleton.
 *
 * `onRetry` should be the `refetch` returned by the tab's useQuery hook.
 */
export default function InspectPaneError({
  onRetry,
  message = "Couldn't load this.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={1.5} alignItems="center" sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon fontSize="small" />}
          onClick={onRetry}
        >
          Retry
        </Button>
      </Stack>
    </Box>
  );
}
