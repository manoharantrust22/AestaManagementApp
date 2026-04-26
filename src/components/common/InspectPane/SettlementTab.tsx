"use client";

import React from "react";
import {
  Box,
  Button,
  Skeleton,
  Stack,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import dayjs from "dayjs";
import type { InspectEntity } from "./types";
import { useSettlementDetails } from "@/hooks/queries/useSettlementDetails";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: 0.75,
        gap: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right" }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function SettlementTab({
  entity,
  onSettleClick,
}: {
  entity: InspectEntity;
  onSettleClick?: (entity: InspectEntity) => void;
}) {
  const theme = useTheme();
  const isPending = !entity.settlementRef;

  const { data, isLoading } = useSettlementDetails(
    entity.settlementRef ?? null,
    entity.siteId
  );

  if (isLoading && !isPending) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={120} />
      </Box>
    );
  }

  if (isPending) {
    return (
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.warning.main, 0.12),
            border: `1px solid ${theme.palette.warning.main}`,
            mb: 1.5,
          }}
        >
          <Typography variant="body2" fontWeight={600} color="warning.dark">
            Not yet settled
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click below to settle this{" "}
            {entity.kind === "daily-date" ? "date" : "week"} now.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="success"
          fullWidth
          onClick={() => onSettleClick?.(entity)}
          disabled={!onSettleClick}
        >
          Settle now
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        divider={
          <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />
        }
      >
        <Row
          label="Reference"
          value={
            <Typography
              variant="body2"
              component="span"
              sx={{ fontFamily: "ui-monospace, monospace" }}
            >
              {entity.settlementRef}
            </Typography>
          }
        />
        <Row
          label="Settled on"
          value={
            data?.settledOn
              ? dayjs(data.settledOn).format("DD MMM YYYY")
              : "—"
          }
        />
        <Row label="Payer" value={data?.payerName ?? "—"} />
        <Row label="Payment mode" value={data?.paymentMode ?? "—"} />
        <Row label="Channel" value={data?.channel ?? "—"} />
        <Row label="Recorded by" value={data?.recordedByName ?? "—"} />
      </Stack>

      {data?.linkedExpenseRef && (
        <Box
          sx={{
            mt: 2,
            p: 1.25,
            bgcolor: "background.paper",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Linked expense
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: "ui-monospace, monospace" }}
          >
            {data.linkedExpenseRef}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
