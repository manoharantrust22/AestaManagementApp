"use client";

import { Box, Chip, CircularProgress, Typography, alpha, useTheme } from "@mui/material";
import { formatDistanceToNow } from "date-fns";
import { formatINR } from "@/lib/calculatorMath";
import type { VendorQuote } from "@/lib/category-calculator-templates";

interface VendorQuoteListProps {
  quotes: VendorQuote[];
  isLoading: boolean;
  computedOutput: number;
  outputUnit: string;
  selectedVendorId: string | null;
  onSelectVendor: (vendorId: string) => void;
}

export default function VendorQuoteList({
  quotes,
  isLoading,
  computedOutput,
  outputUnit,
  selectedVendorId,
  onSelectVendor,
}: VendorQuoteListProps) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (quotes.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No vendor prices on record — add prices in the Vendors section
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {quotes.map((quote, index) => {
        const isCheapest = index === 0;
        const isSelected = selectedVendorId === quote.vendorId;
        const totalCost = computedOutput * quote.unitPrice;

        return (
          <Box
            key={quote.vendorId}
            onClick={() => onSelectVendor(quote.vendorId)}
            sx={{
              borderRadius: 2,
              border: isSelected
                ? `1px solid ${theme.palette.primary.main}`
                : "1px solid",
              borderColor: isSelected
                ? theme.palette.primary.main
                : "divider",
              backgroundColor: isCheapest
                ? alpha(theme.palette.success.main, 0.08)
                : "background.paper",
              px: 2,
              py: 1.5,
              cursor: "pointer",
              transition: "border-color 0.15s, background-color 0.15s",
              "&:hover": {
                borderColor: isSelected
                  ? theme.palette.primary.main
                  : theme.palette.action.active,
              },
            }}
          >
            {/* Top row: vendor name + best price chip + total */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body1" fontWeight={700}>
                  {quote.vendorName}
                </Typography>
                {isCheapest && (
                  <Chip
                    label="Best price"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }}
                  />
                )}
              </Box>
              <Typography variant="body1" fontWeight={600} color="text.primary">
                {formatINR(totalCost)}
              </Typography>
            </Box>

            {/* Bottom row: unit price + last updated */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mt: 0.5,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {formatINR(quote.unitPrice)}/{outputUnit}
                {quote.priceIncludesGst && (
                  <Box component="span" sx={{ ml: 0.5 }}>
                    (incl. GST)
                  </Box>
                )}
              </Typography>
              {quote.updatedAt && (
                <Typography variant="caption" color="text.disabled">
                  last quoted{" "}
                  {formatDistanceToNow(new Date(quote.updatedAt), {
                    addSuffix: true,
                  })}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
