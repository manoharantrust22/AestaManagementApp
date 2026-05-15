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
import { queryKeys } from "@/lib/cache/keys";

export interface UnlinkedTeaSettlementRowData {
  id: string;
  payment_date: string;
  amount_paid: number | null;
  subcontract_id: string | null;
  site_id?: string | null;
  site_name?: string | null;
  /** "individual" → tea_shop_settlements, "group" → tea_shop_group_settlements. */
  source?: "individual" | "group";
  settlement_reference?: string | null;
  payer_type?: string | null;
  is_cancelled?: boolean | null;
  notes?: string | null;
}

interface UnlinkedTeaSettlementsGroupProps {
  rows: UnlinkedTeaSettlementRowData[];
  /** Fallback site id used when a row has no site_id (non-group page). */
  fallbackSiteId?: string;
  /** Site group id, when on a grouped page — invalidated after a successful link. */
  siteGroupId?: string;
  /** Click-through to the existing settlement edit dialog. */
  onRowClick?: (row: UnlinkedTeaSettlementRowData) => void;
}

function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default function UnlinkedTeaSettlementsGroup({
  rows,
  fallbackSiteId,
  siteGroupId,
  onRowClick,
}: UnlinkedTeaSettlementsGroupProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + (r.amount_paid || 0), 0),
    [rows],
  );

  if (rows.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 1,
        mb: 1.25,
        border: 1,
        borderColor: alpha(theme.palette.warning.main, 0.4),
        borderRadius: 1,
        bgcolor: alpha(theme.palette.warning.main, 0.06),
        overflow: "hidden",
      }}
    >
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
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
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
            <UnlinkedTeaSettlementRow
              key={r.id}
              row={r}
              fallbackSiteId={fallbackSiteId}
              siteGroupId={siteGroupId}
              onRowClick={onRowClick}
            />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function UnlinkedTeaSettlementRow({
  row,
  fallbackSiteId,
  siteGroupId,
  onRowClick,
}: {
  row: UnlinkedTeaSettlementRowData;
  fallbackSiteId?: string;
  siteGroupId?: string;
  onRowClick?: (row: UnlinkedTeaSettlementRowData) => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const { showSuccess, showError } = useToast();

  const siteId = row.site_id || fallbackSiteId;
  const { data: subcontracts, isLoading: subcontractsLoading } =
    useSiteSubcontracts(siteId);

  const [saving, setSaving] = useState(false);

  const handleLink = async (subcontractId: string) => {
    if (!subcontractId) return;
    setSaving(true);
    try {
      const table =
        row.source === "group"
          ? "tea_shop_group_settlements"
          : "tea_shop_settlements";

      const { error } = await (supabase as any)
        .from(table)
        .update({ subcontract_id: subcontractId })
        .eq("id", row.id);

      if (error) throw error;

      showSuccess(
        `Linked ${row.settlement_reference ?? "settlement"} to subcontract`,
      );

      // Mirror the invalidations that TeaShopSettlementDialog does after save.
      if (siteGroupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.settlements(siteGroupId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.entries(siteGroupId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.pending(siteGroupId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.all,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["tea-shop"] });
      queryClient.invalidateQueries({ queryKey: ["subcontract-spend"] });
    } catch (err) {
      const msg =
        (err as { message?: string } | null)?.message ?? String(err);
      showError(`Failed to link: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const ref = row.settlement_reference;
  const refShort = ref ? ref.slice(-7) : null;

  return (
    <Box
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
        onClick={() => onRowClick?.(row)}
        sx={{
          cursor: onRowClick ? "pointer" : "default",
          "&:hover": onRowClick
            ? { textDecoration: "underline" }
            : undefined,
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 12.5 }}>
          {dayjs(row.payment_date).format("DD MMM YYYY")}
        </Typography>
        {refShort && (
          <Typography
            sx={{
              fontSize: 10,
              color: "primary.main",
              fontFamily: "ui-monospace, monospace",
              fontWeight: 600,
            }}
          >
            {refShort}
          </Typography>
        )}
      </Box>

      {/* Chips: site (group mode) + payer */}
      <Box sx={{ display: { xs: "none", md: "flex" }, gap: 0.5, minWidth: 0 }}>
        {row.site_name && (
          <Chip
            size="small"
            label={
              row.site_name.length > 14
                ? `${row.site_name.slice(0, 12)}…`
                : row.site_name
            }
            variant={row.source === "group" ? "filled" : "outlined"}
            color={row.source === "group" ? "secondary" : "default"}
            sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
          />
        )}
        {row.payer_type && (
          <Chip
            size="small"
            label={row.payer_type === "site_engineer" ? "Eng" : "Co"}
            variant="outlined"
            sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
          />
        )}
      </Box>

      {/* Inline subcontract picker */}
      <FormControl size="small" fullWidth>
        <Select
          value=""
          displayEmpty
          disabled={
            saving ||
            subcontractsLoading ||
            !subcontracts?.length ||
            !siteId
          }
          onChange={(e) => {
            const v = e.target.value as string;
            if (v) handleLink(v);
          }}
          renderValue={() => (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: 12 }}
            >
              {saving
                ? "Linking…"
                : !siteId
                  ? "No site context"
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
          {(subcontracts ?? []).map((sc) => (
            <MenuItem key={sc.id} value={sc.id}>
              <Box>
                <Typography variant="body2">{sc.title}</Typography>
                {sc.laborer_name && (
                  <Typography variant="caption" color="text.secondary">
                    Mestri: {sc.laborer_name}
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
            color: row.is_cancelled ? "text.disabled" : "success.dark",
            textDecoration: row.is_cancelled ? "line-through" : "none",
          }}
        >
          {formatINR(row.amount_paid || 0)}
        </Typography>
      </Box>
    </Box>
  );
}
