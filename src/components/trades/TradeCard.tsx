"use client";

import React from "react";
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Stack,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import type { Trade, TradeContract } from "@/types/trade.types";

interface TradeCardProps {
  trade: Trade;
  onContractClick: (contractId: string) => void;
  onAddClick: (tradeCategoryId: string) => void;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    amount
  );
}

function contractLabel(c: TradeContract): string {
  if (c.isInHouse) return "In-house";
  return c.mesthriOrSpecialistName ?? c.title;
}

export function TradeCard({
  trade,
  onContractClick,
  onAddClick,
}: TradeCardProps) {
  const { category, contracts } = trade;
  const hasContracts = contracts.length > 0;

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardContent
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            {category.name}
          </Typography>
          {!category.isActive && (
            <Chip
              label="Inactive"
              size="small"
              variant="outlined"
              color="default"
            />
          )}
        </Box>

        {hasContracts ? (
          <Stack spacing={1}>
            {contracts.map((c) => (
              <Button
                key={c.id}
                onClick={() => onContractClick(c.id)}
                variant="outlined"
                endIcon={<ChevronRightIcon />}
                sx={{
                  justifyContent: "space-between",
                  textAlign: "left",
                  py: 1.25,
                  px: 1.5,
                  textTransform: "none",
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {contractLabel(c)}
                  </Typography>
                  {c.totalValue > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Quoted ₹{formatINR(c.totalValue)}
                    </Typography>
                  )}
                </Box>
              </Button>
            ))}
          </Stack>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              py: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No contracts yet
            </Typography>
          </Box>
        )}

        <Button
          startIcon={<AddIcon />}
          size="small"
          onClick={() => onAddClick(category.id)}
          sx={{ alignSelf: "flex-start", mt: "auto" }}
        >
          Add contract
        </Button>
      </CardContent>
    </Card>
  );
}
