"use client";

import { useState } from "react";
import { Alert, Box, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import ChecklistDayView from "@/components/checklist/ChecklistDayView";
import { todayISO } from "@/types/checklist.types";

export default function SiteChecklistPage() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const [date, setDate] = useState<string>(todayISO());

  const companyId = selectedSite?.company_id ?? undefined;
  const siteId = selectedSite?.id;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 4 }}>
      <Box sx={{ p: 2.5, pt: 3, maxWidth: 760, mx: "auto" }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          Daily checklist
        </Typography>
        <Typography variant="h5" fontWeight={600} sx={{ mt: 0.5, mb: 2 }}>
          {selectedSite?.name || "My duties"}
        </Typography>

        {!siteId ? (
          <Alert severity="warning">Pick a site from the menu to see your checklist.</Alert>
        ) : (
          <ChecklistDayView
            userId={userProfile?.id}
            companyId={companyId}
            siteId={siteId}
            date={date}
            onDateChange={setDate}
          />
        )}
      </Box>
    </Box>
  );
}
