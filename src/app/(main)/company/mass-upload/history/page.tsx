"use client";

import NextLink from "next/link";
import {
  Box,
  Typography,
  Paper,
  Alert,
  Stack,
  Button,
} from "@mui/material";
import {
  History as HistoryIcon,
  ArrowBack as BackIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { canPerformMassUpload } from "@/lib/permissions";
import { ImportHistoryList } from "@/components/mass-upload/ImportHistoryList";

export const dynamic = "force-dynamic";

export default function ImportHistoryPage() {
  const { userProfile, loading: authLoading } = useAuth();

  if (!authLoading && !canPerformMassUpload(userProfile?.role)) {
    return (
      <Box p={3}>
        <Alert severity="error">
          You do not have permission to access this page. Import history is only
          available to Admin and Office staff.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: "linear-gradient(135deg, #5e35b1 0%, #7e57c2 100%)",
          color: "white",
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <HistoryIcon sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h4" fontWeight="bold">
                Import History
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                Review, revoke, restore or purge bulk uploads
              </Typography>
            </Box>
          </Stack>
          <Button
            component={NextLink}
            href="/company/mass-upload"
            startIcon={<BackIcon />}
            variant="contained"
            color="inherit"
            sx={{ color: "#5e35b1", bgcolor: "white" }}
          >
            New Upload
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3, bgcolor: "info.50" }}>
        <Typography variant="body2" color="info.main">
          <strong>Revoke</strong> hides a whole batch instantly (recoverable).{" "}
          <strong>Restore</strong> brings it back. <strong>Purge</strong> permanently
          deletes the batch&apos;s records and cannot be undone.
        </Typography>
      </Paper>

      <ImportHistoryList />
    </Box>
  );
}
