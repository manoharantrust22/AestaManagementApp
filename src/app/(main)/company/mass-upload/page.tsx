"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import {
  Box,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Stack,
  Button,
} from "@mui/material";
import {
  UploadFile as UploadIcon,
  History as HistoryIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { canPerformMassUpload } from "@/lib/permissions";
import { MassUploadWizard } from "@/components/mass-upload/MassUploadWizard";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

interface Site {
  id: string;
  name: string;
}

export default function MassUploadPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch sites for the selector
  useEffect(() => {
    async function fetchSites() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("sites")
          .select("id, name")
          .eq("status", "active")
          .order("name");

        if (error) throw error;
        setSites(data || []);
      } catch (err) {
        console.error("Error fetching sites:", err);
        setError("Failed to load sites");
      } finally {
        setIsLoading(false);
      }
    }

    if (!authLoading) {
      fetchSites();
    }
  }, [authLoading]);

  // Check permissions
  if (authLoading || isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="50vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!canPerformMassUpload(userProfile?.role)) {
    return (
      <Box p={3}>
        <Alert severity="error">
          You do not have permission to access this page. Mass upload is only
          available to Admin and Office staff.
        </Alert>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Page Header */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
          color: "white",
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <UploadIcon sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h4" fontWeight="bold">
                Mass Upload
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                Bulk import data using CSV files
              </Typography>
            </Box>
          </Stack>
          <Button
            component={NextLink}
            href="/company/mass-upload/history"
            startIcon={<HistoryIcon />}
            variant="contained"
            color="inherit"
            sx={{ color: "#1976d2", bgcolor: "white" }}
          >
            Import History
          </Button>
        </Stack>
      </Paper>

      {/* Instructions */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: "info.50" }}>
        <Typography variant="subtitle2" color="info.main" gutterBottom>
          How it works:
        </Typography>
        <Stack component="ol" sx={{ m: 0, pl: 2.5 }} spacing={0.5}>
          <li>
            <Typography variant="body2">
              Select the type of data you want to upload (Attendance, Expenses, etc.)
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Download the CSV template for that data type
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Fill in your data in the CSV file and upload it
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Review and edit the data in the preview table
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Import the validated data to the database
            </Typography>
          </li>
        </Stack>
      </Paper>

      {/* Main Wizard */}
      <Paper sx={{ p: 3 }}>
        <MassUploadWizard
          sites={sites}
          userId={userProfile?.id || ""}
          userName={userProfile?.name || ""}
        />
      </Paper>
    </Box>
  );
}
