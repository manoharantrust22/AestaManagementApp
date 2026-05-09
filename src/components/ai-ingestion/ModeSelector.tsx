/**
 * Three-card mode picker (Purchase / Quotation / Warranty). Rendered as the
 * first step of the AI ingestion dialog when no mode is locked.
 */

"use client";

import { Box, Card, CardActionArea, Stack, Typography } from "@mui/material";
import {
  Receipt as ReceiptIcon,
  RequestQuote as QuoteIcon,
  Verified as WarrantyIcon,
} from "@mui/icons-material";

import type { IngestionMode } from "@/lib/ai-ingestion/types";

interface ModeSelectorProps {
  selected: IngestionMode | null;
  onSelect: (mode: IngestionMode) => void;
}

const OPTIONS: Array<{
  mode: IngestionMode;
  title: string;
  blurb: string;
  Icon: typeof ReceiptIcon;
}> = [
  {
    mode: "purchase",
    title: "Purchase Bill",
    blurb: "Record an actual buy. Creates a purchase row, expense items, price history.",
    Icon: ReceiptIcon,
  },
  {
    mode: "quotation",
    title: "Quotation",
    blurb: "Record a quote you got while researching. Lands in price history; no purchase row.",
    Icon: QuoteIcon,
  },
  {
    mode: "warranty",
    title: "Warranty Card",
    blurb: "Attach warranty months + serial numbers to an existing purchase row.",
    Icon: WarrantyIcon,
  },
];

export default function ModeSelector({ selected, onSelect }: ModeSelectorProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Pick what you&apos;re ingesting. Each mode generates a different prompt for ChatGPT/Gemini.
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {OPTIONS.map(({ mode, title, blurb, Icon }) => {
          const isSelected = selected === mode;
          return (
            <Card
              key={mode}
              variant="outlined"
              sx={{
                flex: 1,
                borderColor: isSelected ? "primary.main" : "divider",
                borderWidth: isSelected ? 2 : 1,
                bgcolor: isSelected ? "primary.50" : "background.paper",
                transition: "border-color 0.15s, background-color 0.15s",
              }}
            >
              <CardActionArea
                onClick={() => onSelect(mode)}
                sx={{ p: 2, height: "100%", alignItems: "stretch" }}
              >
                <Stack spacing={1.5} sx={{ height: "100%" }}>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 40,
                      height: 40,
                      borderRadius: 1,
                      bgcolor: isSelected ? "primary.main" : "primary.50",
                      color: isSelected ? "primary.contrastText" : "primary.main",
                    }}
                  >
                    <Icon fontSize="small" />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {blurb}
                  </Typography>
                </Stack>
              </CardActionArea>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
