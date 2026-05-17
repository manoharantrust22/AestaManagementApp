"use client";

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import CalculatorWorkspace from './CalculatorWorkspace';
import SitePickerForMR from './SitePickerForMR';

export default function CalculatorPageContent() {
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [, setSelectedSiteId] = useState<string | null>(null);

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Material Cost Calculator
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Estimate material costs and compare vendor prices before creating a request.
      </Typography>
      <CalculatorWorkspace
        onConvertToRequest={() => setSitePickerOpen(true)}
      />
      <SitePickerForMR
        open={sitePickerOpen}
        onClose={() => setSitePickerOpen(false)}
        onSiteSelected={(siteId) => {
          setSelectedSiteId(siteId);
          setSitePickerOpen(false);
          // TODO Task 15: open MaterialRequestDialog with basket items
        }}
      />
    </Box>
  );
}
