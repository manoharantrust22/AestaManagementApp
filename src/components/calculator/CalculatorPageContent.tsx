"use client";

import { useState } from "react";
import { Box, Grid, Typography } from "@mui/material";
import CalculatorWorkspace from "./CalculatorWorkspace";
import { EstimateBasketPanel } from "./EstimateBasketPanel";
import SitePickerForMR from "./SitePickerForMR";
import MaterialRequestDialog, {
  MRInitialItem,
} from "@/components/materials/MaterialRequestDialog";
import { useEstimateBasket } from "@/contexts/EstimateBasketContext";

export default function CalculatorPageContent() {
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [mrDialogOpen, setMrDialogOpen] = useState(false);
  const { items, clearBasket } = useEstimateBasket();

  const basketItems: MRInitialItem[] = items
    .map((item) => ({
      materialId: item.materialId ?? "",
      qty: Math.ceil(item.computedOutput),
      notes: item.pricingDimensionValue
        ? `From calculator — ${item.outputLabel}: ${item.computedOutput.toFixed(3)} ${item.outputUnit} · ${item.pricingDimensionValue}`
        : `From calculator — ${item.outputLabel}: ${item.computedOutput.toFixed(3)} ${item.outputUnit}`,
    }))
    .filter((i) => i.materialId !== "");

  function handleConvertToRequest() {
    setSitePickerOpen(true);
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, sm: 3 } }}>
      {/* Page header */}
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Material Cost Calculator
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Estimate material costs and compare vendor prices before creating a
        request.
      </Typography>

      {/* Split-pane: calculator left, basket right */}
      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 7 }}>
          <CalculatorWorkspace
            hideBasketControls
            onConvertToRequest={handleConvertToRequest}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <EstimateBasketPanel onConvertToRequest={handleConvertToRequest} />
        </Grid>
      </Grid>

      {/* Site picker + MR dialog */}
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
          onClose={() => {
            setMrDialogOpen(false);
            clearBasket();
          }}
          request={null}
          siteId={selectedSiteId}
          initialItems={basketItems}
        />
      )}
    </Box>
  );
}
