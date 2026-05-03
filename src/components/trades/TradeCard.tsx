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
import { Add as AddIcon } from "@mui/icons-material";
import type {
  ContractActivity,
  ContractReconciliation,
  Trade,
} from "@/types/trade.types";
import { ExpandableContractRow } from "./ExpandableContractRow";

interface TradeCardProps {
  trade: Trade;
  /** Map<subcontractId, ContractReconciliation> from useSiteTradeReconciliations. */
  reconciliations?: Map<string, ContractReconciliation>;
  /** Map<subcontractId, ContractActivity> from useSiteTradeActivity. */
  activity?: Map<string, ContractActivity>;
  /** Currently-expanded contract id (single-expanded across all cards). */
  expandedContractId?: string | null;
  onContractClick?: (contractId: string) => void;
  onAddClick: (tradeCategoryId: string) => void;
  onContractView?: (contractId: string) => void;
  onContractDelete?: (contractId: string) => void;
}

export function TradeCard({
  trade,
  reconciliations,
  activity,
  expandedContractId,
  onContractClick,
  onAddClick,
  onContractView,
  onContractDelete,
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
          gap: 1.25,
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
              <ExpandableContractRow
                key={c.id}
                contract={c}
                reconciliation={reconciliations?.get(c.id)}
                activity={activity?.get(c.id)}
                expanded={expandedContractId === c.id}
                onToggleExpand={() => onContractClick?.(c.id)}
                onView={onContractView ? () => onContractView(c.id) : undefined}
                onDelete={
                  onContractDelete && !c.isInHouse
                    ? () => onContractDelete(c.id)
                    : undefined
                }
              />
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
