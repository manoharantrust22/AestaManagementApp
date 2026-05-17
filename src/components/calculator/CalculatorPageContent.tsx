"use client";

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import CalculatorWorkspace from './CalculatorWorkspace';
import SitePickerForMR from './SitePickerForMR';
import MaterialRequestDialog, { MRInitialItem } from '@/components/materials/MaterialRequestDialog';
import { useEstimateBasket } from '@/contexts/EstimateBasketContext';

export default function CalculatorPageContent() {
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [mrDialogOpen, setMrDialogOpen] = useState(false);
  const { items, clearBasket } = useEstimateBasket();

  const basketItems: MRInitialItem[] = items
    .map((item) => ({
      materialId: item.materialId ?? '',
      qty: Math.ceil(item.computedOutput),
      notes: item.pricingDimensionValue
        ? `From calculator — ${item.outputLabel}: ${item.computedOutput.toFixed(3)} ${item.outputUnit} · ${item.pricingDimensionValue}`
        : `From calculator — ${item.outputLabel}: ${item.computedOutput.toFixed(3)} ${item.outputUnit}`,
    }))
    .filter((i) => i.materialId !== '');

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
          setMrDialogOpen(true);
        }}
      />
      {selectedSiteId && (
        <MaterialRequestDialog
          open={mrDialogOpen}
          onClose={() => { setMrDialogOpen(false); clearBasket(); }}
          request={null}
          siteId={selectedSiteId}
          initialItems={basketItems}
        />
      )}
    </Box>
  );
}
