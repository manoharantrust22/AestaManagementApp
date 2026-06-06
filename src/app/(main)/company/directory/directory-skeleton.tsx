"use client";

import { Box, Skeleton, Stack } from "@mui/material";

export default function DirectorySkeleton() {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Box>
          <Skeleton variant="text" width={160} height={36} />
          <Skeleton variant="text" width={260} height={20} />
        </Box>
        <Skeleton variant="rounded" width={140} height={36} />
      </Box>

      {/* Search + filters */}
      <Skeleton variant="rounded" width="100%" height={44} sx={{ mb: 1 }} />
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[90, 80, 80, 80, 110].map((w, i) => (
          <Skeleton key={i} variant="rounded" width={w} height={26} />
        ))}
      </Box>

      {/* Cards */}
      <Stack spacing={1}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" width="100%" height={76} />
        ))}
      </Stack>
    </Box>
  );
}
