"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  WarningAmber as WarningIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import { useToast } from "@/contexts/ToastContext";
import type { SettlementListRow } from "@/hooks/queries/useSettlementsList";

interface UnlinkedSettlementsGroupProps {
  rows: SettlementListRow[];
  siteId: string;
  /** Click-through to the existing settlement detail dialog. */
  onRowClick?: (row: SettlementListRow) => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Top-of-tab group that surfaces settlements with no subcontract link. Each
 * row gets an inline subcontract picker that calls the
 * `link_settlement_group_to_subcontract` RPC (atomic cascade across
 * settlement_groups + daily/market attendance + labor_payments + engineer
 * transactions). Once linked, the row disappears from this group on the next
 * `settlements-list` refetch.
 *
 * Parent is responsible for filtering `rows` to only unlinked items in the
 * active tab's scope (contract / daily-market / all). This component never
 * filters by `subcontractId` itself — it trusts the parent.
 */
export function UnlinkedSettlementsGroup({
  rows,
  siteId,
  onRowClick,
}: UnlinkedSettlementsGroupProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const { showSuccess, showError } = useToast();
  const { data: subcontracts, isLoading: subcontractsLoading } =
    useSiteSubcontracts(siteId);

  const [expanded, setExpanded] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + r.totalAmount, 0),
    [rows],
  );

  if (rows.length === 0) return null;

  const handleLink = async (row: SettlementListRow, subcontractId: string) => {
    if (!subcontractId) return;
    setSavingId(row.id);
    try {
      const { error } = await (supabase as any).rpc(
        "link_settlement_group_to_subcontract",
        {
          p_group_id: row.id,
          p_subcontract_id: subcontractId,
        },
      );
      if (error) throw error;

      showSuccess(`Linked ${row.ref} to subcontract`);

      // Refresh anything that reads subcontract_id off these rows.
      queryClient.invalidateQueries({ queryKey: ["settlements-list"] });
      queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["daily-market-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
      queryClient.invalidateQueries({ queryKey: ["subcontract-spend"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(`Failed to link: ${msg}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box
      sx={{
        mx: { xs: 1, sm: 1.5 },
        mt: 1,
        mb: 1.25,
        border: 1,
        borderColor: alpha(theme.palette.warning.main, 0.4),
        borderRadius: 1,
        bgcolor: alpha(theme.palette.warning.main, 0.06),
        overflow: "hidden",
      }}
    >
      {/* Header — click to expand/collapse */}
      <Box
        onClick={() => setExpanded((prev) => !prev)}
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <WarningIcon
          fontSize="small"
          sx={{ color: theme.palette.warning.dark }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: 13.5,
              color: theme.palette.warning.dark,
            }}
          >
            Unlinked · {rows.length} settlement{rows.length === 1 ? "" : "s"}
          </Typography>
          <Typography
            sx={{ fontSize: 11, color: "text.secondary" }}
          >
            Not linked to any subcontract — pick one to fix.
          </Typography>
        </Box>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
            color: theme.palette.warning.dark,
            mr: 0.5,
          }}
        >
          {formatINR(totalAmount)}
        </Typography>
        <IconButton size="small" aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? (
            <ExpandLessIcon fontSize="small" />
          ) : (
            <ExpandMoreIcon fontSize="small" />
          )}
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Stack
          divider={
            <Box
              sx={{
                height: 1,
                bgcolor: alpha(theme.palette.warning.main, 0.18),
              }}
            />
          }
        >
          {rows.map((r) => (
            <Box
              key={r.id}
              sx={{
                px: 1.5,
                py: 1,
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "150px 1fr 220px 110px" },
                gap: 1,
                alignItems: "center",
              }}
            >
              {/* Date + ref */}
              <Box
                onClick={() => onRowClick?.(r)}
                sx={{
                  cursor: onRowClick ? "pointer" : "default",
                  "&:hover": onRowClick
                    ? { textDecoration: "underline" }
                    : undefined,
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 12.5 }}>
                  {dayjs(r.settlementDate).format("DD MMM YYYY")}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: "primary.main",
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 600,
                  }}
                >
                  {r.ref}
                </Typography>
              </Box>

              {/* Type chip + notes preview */}
              <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
                <Box sx={{ display: "flex", gap: 0.5, mb: 0.25 }}>
                  {r.isContract ? (
                    <Chip
                      size="small"
                      label="💼 Contract"
                      sx={{
                        height: 18,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: alpha(theme.palette.warning.main, 0.14),
                        color: theme.palette.warning.dark,
                      }}
                    />
                  ) : (
                    <Chip
                      size="small"
                      label="📅 Daily/Market"
                      sx={{
                        height: 18,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: alpha(theme.palette.info.main, 0.14),
                        color: theme.palette.info.dark,
                      }}
                    />
                  )}
                  <Chip
                    size="small"
                    label={`${r.laborerCount} laborer${r.laborerCount === 1 ? "" : "s"}`}
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
                  />
                </Box>
                {r.notes && (
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: "text.secondary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.notes}
                  >
                    {r.notes}
                  </Typography>
                )}
              </Box>

              {/* Inline subcontract picker */}
              <FormControl size="small" fullWidth>
                <Select
                  value=""
                  displayEmpty
                  disabled={
                    savingId === r.id ||
                    subcontractsLoading ||
                    !subcontracts?.length
                  }
                  onChange={(e) => {
                    const v = e.target.value as string;
                    if (v) handleLink(r, v);
                  }}
                  renderValue={() => (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: 12 }}
                    >
                      {savingId === r.id
                        ? "Linking…"
                        : !subcontracts?.length
                          ? "No subcontracts available"
                          : "Link to subcontract…"}
                    </Typography>
                  )}
                  sx={{
                    bgcolor: "background.paper",
                    "& .MuiSelect-select": { py: 0.75 },
                  }}
                >
                  {(subcontracts ?? []).map((sc: any) => (
                    <MenuItem key={sc.id} value={sc.id}>
                      <Box>
                        <Typography variant="body2">{sc.title}</Typography>
                        {sc.laborer?.name && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Mestri: {sc.laborer.name}
                          </Typography>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Amount */}
              <Box sx={{ justifySelf: { xs: "start", md: "end" } }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: 13.5,
                    fontVariantNumeric: "tabular-nums",
                    color: r.isCancelled ? "text.disabled" : "success.dark",
                    textDecoration: r.isCancelled ? "line-through" : "none",
                  }}
                >
                  {formatINR(r.totalAmount)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}
