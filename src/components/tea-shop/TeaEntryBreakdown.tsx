"use client";

/**
 * TeaEntryBreakdown — read-only verification view for a single GROUP tea entry.
 *
 * Renders inside the tea-shop entries list (under an expanded group row). Shows
 * the original total the engineer logged, how it split across every grouped site
 * (amount, man-days, %), and the per-contract crews that were included — so the
 * engineer can reconcile it line-by-line against the tea shop's notebook.
 *
 * Pure reads; nothing here mutates. Data via useTeaEntryBreakdown (lazy).
 */

import React, { useMemo } from "react";
import {
  Box,
  Stack,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  Button,
} from "@mui/material";
import {
  Groups as GroupsIcon,
  Engineering as EngineeringIcon,
  CheckCircle as CheckCircleIcon,
  ReportProblem as ReportProblemIcon,
  Edit as EditIcon,
  Storefront as StorefrontIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useTeaEntryBreakdown } from "@/hooks/queries/useTeaEntryBreakdown";
import { useSiteTrades } from "@/hooks/queries/useTrades";

interface TeaEntryBreakdownProps {
  entryId: string;
  /** Original group total (the notebook figure). */
  total: number;
  /** The page's currently-filtered site — its row is highlighted as "this site". */
  currentSiteId?: string;
  date: string;
  shopName?: string;
  /** Representative site id for resolving trade names. */
  primarySiteId?: string;
  /** Only fetch when the row is actually expanded. */
  enabled: boolean;
  /** Optional — opens the edit dialog for this entry. */
  onEdit?: () => void;
  canEdit?: boolean;
}

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const md = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} md`;

export default function TeaEntryBreakdown({
  entryId,
  total,
  currentSiteId,
  date,
  shopName,
  primarySiteId,
  enabled,
  onEdit,
  canEdit,
}: TeaEntryBreakdownProps) {
  const { allocations, selectionsBySite, allocationsTotal, isLoading } =
    useTeaEntryBreakdown(entryId, { enabled });

  const { data: siteTrades } = useSiteTrades(primarySiteId);
  const tradeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of siteTrades ?? []) m.set(t.category.id, t.category.name);
    return m;
  }, [siteTrades]);

  const reconciles = Math.abs(allocationsTotal - total) <= 1;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2, px: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="caption" color="text.secondary">
          Loading breakdown…
        </Typography>
      </Box>
    );
  }

  if (allocations.length === 0) {
    return (
      <Box sx={{ py: 1.5, px: 1 }}>
        <Typography variant="caption" color="text.secondary">
          No per-site breakdown was recorded for this entry.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        py: 1.5,
        px: { xs: 1, sm: 2 },
        bgcolor: "action.hover",
        borderRadius: 1,
      }}
    >
      {/* Header: what the engineer logged */}
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        spacing={0.75}
        sx={{ mb: 1 }}
      >
        <Typography variant="body2" fontWeight={700}>
          Engineer logged {fmt(total)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {dayjs(date).format("DD MMM YYYY")}
        </Typography>
        {shopName && (
          <Chip
            icon={<StorefrontIcon sx={{ fontSize: 14 }} />}
            label={shopName}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        )}
      </Stack>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        Split by man-days across {allocations.length} site
        {allocations.length === 1 ? "" : "s"}:
      </Typography>

      {/* Per-site split */}
      <Stack spacing={1}>
        {allocations.map((a) => {
          const isThisSite = !!currentSiteId && a.site_id === currentSiteId;
          const lines = (selectionsBySite.get(a.site_id) ?? []).filter(
            (l) => l.is_included
          );
          return (
            <Box
              key={a.site_id}
              sx={{
                pl: 1,
                borderLeft: "3px solid",
                borderColor: isThisSite ? "primary.main" : "divider",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  sx={{ minWidth: 0 }}
                >
                  <GroupsIcon
                    sx={{ fontSize: 15 }}
                    color={isThisSite ? "primary" : "disabled"}
                  />
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    noWrap
                    sx={{ maxWidth: { xs: 150, sm: 240 } }}
                  >
                    {a.site_name}
                  </Typography>
                  {isThisSite && (
                    <Chip
                      label="this site"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: "0.6rem" }}
                    />
                  )}
                </Stack>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.75}
                  sx={{ flexShrink: 0 }}
                >
                  <Typography variant="body2" fontWeight={700}>
                    {fmt(a.allocated_amount)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {md(a.day_units_sum)} · {Math.round(a.allocation_percentage)}%
                  </Typography>
                </Stack>
              </Stack>

              {/* Per-contract sub-rows */}
              {lines.length > 0 && (
                <Stack spacing={0.25} sx={{ mt: 0.5, pl: 2.5 }}>
                  {lines.map((l, i) => {
                    const isMesthri = l.presence_kind === "mesthri";
                    const tradeName = l.trade_category_id
                      ? tradeNameById.get(l.trade_category_id)
                      : null;
                    const label = isMesthri
                      ? "Regular crew (mesthri)"
                      : tradeName
                      ? `${tradeName} contract`
                      : "Contract work";
                    return (
                      <Stack
                        key={`${l.presence_kind}:${l.ref_id ?? "mesthri"}:${i}`}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.5}
                          sx={{ minWidth: 0 }}
                        >
                          {!isMesthri && (
                            <EngineeringIcon
                              sx={{ fontSize: 13, color: "info.main" }}
                            />
                          )}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{ maxWidth: { xs: 130, sm: 220 } }}
                          >
                            {label}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {md(l.man_days)}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {fmt(l.allocated_amount)}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>

      <Divider sx={{ my: 1 }} />

      {/* Reconciliation + edit */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        flexWrap="wrap"
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {reconciles ? (
            <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
          ) : (
            <ReportProblemIcon color="warning" sx={{ fontSize: 16 }} />
          )}
          <Typography
            variant="caption"
            color={reconciles ? "success.main" : "warning.main"}
            fontWeight={600}
          >
            {reconciles
              ? `Splits reconcile to ${fmt(total)}`
              : `Splits sum to ${fmt(allocationsTotal)} of ${fmt(total)}`}
          </Typography>
        </Stack>
        {onEdit && (
          <Button
            size="small"
            variant="text"
            startIcon={<EditIcon sx={{ fontSize: 14 }} />}
            onClick={onEdit}
            disabled={!canEdit}
            sx={{ minHeight: 32 }}
          >
            Edit entry
          </Button>
        )}
      </Stack>
    </Box>
  );
}
