"use client";

/**
 * Flat, sortable money table of every subcontract on the site — the "overall
 * picture" that used to live on the separate /site/subcontracts page. Rendered
 * as the Table view inside the Subcontracts workspace (/site/trades).
 *
 * Day-to-day actions (record payment, delete, mode, photos) stay in the
 * workspace detail pane, so a row's "Open" jumps there. The full edit form
 * covers contractor / type / trade / day-work breakdown changes.
 */

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  IconButton,
  LinearProgress,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import OpenInNew from "@mui/icons-material/OpenInNew";
import { useQuery } from "@tanstack/react-query";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import SubcontractPaymentBreakdown from "@/components/subcontracts/SubcontractPaymentBreakdown";
import { createClient } from "@/lib/supabase/client";
import { calculateSubcontractTotals } from "@/lib/services/subcontractService";
import { useIsMobile } from "@/hooks/useIsMobile";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import type { Database } from "@/types/database.types";

type Subcontract = Database["public"]["Tables"]["subcontracts"]["Row"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];

export interface SubcontractTableRow extends Subcontract {
  party_name: string;
  trade_name: string | null;
  total_paid: number;
  balance_due: number;
  completion_percentage: number;
  record_count: number;
}

const STATUS_COLOR: Record<ContractStatus, "default" | "primary" | "warning" | "success" | "error"> = {
  draft: "default",
  active: "primary",
  on_hold: "warning",
  completed: "success",
  cancelled: "error",
};

type StatusFilter = ContractStatus | "all";
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function fetchSubcontractRows(siteId: string): Promise<SubcontractTableRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subcontracts")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Subcontract[];

  const teamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean))] as string[];
  const laborerIds = [...new Set(rows.map((r) => r.laborer_id).filter(Boolean))] as string[];
  const tradeIds = [...new Set(rows.map((r) => r.trade_category_id).filter(Boolean))] as string[];

  const [totalsMap, teamsRes, laborersRes, tradesRes] = await Promise.all([
    calculateSubcontractTotals(supabase, rows.map((r) => r.id)),
    teamIds.length
      ? supabase.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    laborerIds.length
      ? supabase.from("laborers").select("id, name").in("id", laborerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    tradeIds.length
      ? supabase.from("labor_categories").select("id, name").in("id", tradeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const nameMap = (res: { data: unknown }) =>
    new Map(((res.data as { id: string; name: string }[] | null) ?? []).map((x) => [x.id, x.name]));
  const teams = nameMap(teamsRes);
  const laborers = nameMap(laborersRes);
  const trades = nameMap(tradesRes);

  return rows.map((r) => {
    const totals = totalsMap.get(r.id);
    const paid = totals?.totalPaid ?? 0;
    const party =
      r.contract_type === "mesthri"
        ? (r.team_id && teams.get(r.team_id)) || ""
        : r.contract_type === "day_work"
          ? r.contractor_name || ""
          : (r.laborer_id && laborers.get(r.laborer_id)) || "";
    return {
      ...r,
      party_name: r.is_in_house && !party ? "In-house" : party,
      trade_name: r.trade_category_id ? trades.get(r.trade_category_id) ?? null : null,
      total_paid: paid,
      balance_due: totals?.balance ?? r.total_value ?? 0,
      completion_percentage: r.total_value > 0 ? (paid / r.total_value) * 100 : 0,
      record_count: totals?.totalRecordCount ?? 0,
    };
  });
}

export function useSubcontractTableRows(siteId: string) {
  return useQuery({
    // Under the ["subcontracts","site",siteId] prefix so the workspace's edit /
    // delete dialogs invalidate it too. staleTime 0 → switching to the Table view
    // always refetches, so payments recorded in the tree show up immediately.
    queryKey: ["subcontracts", "site", siteId, "table"],
    queryFn: () => fetchSubcontractRows(siteId),
    staleTime: 0,
  });
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box
      sx={{
        flex: "1 1 140px",
        px: 1.75,
        py: 1.25,
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        boxShadow: wsShadow.card,
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: wsColors.muted }}>
        {label}
      </Typography>
      <Typography noWrap sx={{ fontSize: 19, fontWeight: 800, color: color ?? wsColors.ink, letterSpacing: "-.02em" }}>
        {value}
      </Typography>
    </Box>
  );
}

export function SubcontractsTableView({
  siteId,
  canEdit,
  onOpen,
  onEdit,
}: {
  siteId: string;
  canEdit: boolean;
  /** Open the row in the workspace detail pane. */
  onOpen: (row: SubcontractTableRow) => void;
  /** Open the full edit form for the row. */
  onEdit: (row: SubcontractTableRow) => void;
}) {
  const isMobile = useIsMobile();
  const { data: rows = [], isLoading, error } = useSubcontractTableRows(siteId);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  // Money totals exclude cancelled rows so a dropped contract doesn't inflate "value".
  const stats = useMemo(() => {
    const live = visible.filter((r) => r.status !== "cancelled");
    return {
      value: live.reduce((s, r) => s + r.total_value, 0),
      paid: live.reduce((s, r) => s + r.total_paid, 0),
      due: live.reduce((s, r) => s + r.balance_due, 0),
      records: live.reduce((s, r) => s + r.record_count, 0),
    };
  }, [visible]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const columns = useMemo<MRT_ColumnDef<SubcontractTableRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        size: isMobile ? 140 : 240,
        Cell: ({ row }) => (
          <Box
            onClick={() => onOpen(row.original)}
            sx={{ cursor: "pointer", minWidth: 0, "&:hover .title": { color: wsColors.primary } }}
          >
            <Typography className="title" variant="body2" fontWeight={700} sx={{ fontSize: isMobile ? "0.75rem" : undefined }}>
              {row.original.title}
            </Typography>
            {row.original.party_name && (
              <Typography variant="caption" color="text.secondary" component="div">
                {row.original.party_name}
              </Typography>
            )}
            <Chip
              label={row.original.trade_name ?? "No trade"}
              size="small"
              color={row.original.trade_name ? "primary" : "default"}
              variant="outlined"
              sx={{ mt: 0.5, height: 18, fontSize: "0.65rem" }}
            />
          </Box>
        ),
      },
      {
        accessorKey: "contract_type",
        header: "Type",
        size: isMobile ? 60 : 110,
        Cell: ({ cell }) => {
          const v = cell.getValue<string>();
          const label = v === "day_work" ? "Day work" : v === "mesthri" ? "Mesthri" : "Specialist";
          return (
            <Chip
              label={isMobile ? label.charAt(0) : label}
              size="small"
              color={v === "mesthri" ? "primary" : v === "day_work" ? "info" : "secondary"}
            />
          );
        },
      },
      {
        accessorKey: "total_value",
        header: isMobile ? "Value" : "Agreed value",
        size: isMobile ? 80 : 140,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={700}>
            {inr(cell.getValue<number>())}
          </Typography>
        ),
      },
      {
        accessorKey: "total_paid",
        header: "Paid",
        size: isMobile ? 80 : 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={600} color="success.main">
            {inr(cell.getValue<number>())}
          </Typography>
        ),
      },
      {
        accessorKey: "balance_due",
        header: isMobile ? "Due" : "Balance",
        size: isMobile ? 80 : 130,
        Cell: ({ cell }) => {
          const v = cell.getValue<number>();
          return (
            <Typography variant="body2" fontWeight={600} color={v < 0 ? "warning.main" : "error.main"}>
              {v < 0 ? `${inr(-v)} over` : inr(v)}
            </Typography>
          );
        },
      },
      {
        accessorKey: "completion_percentage",
        header: isMobile ? "%" : "Paid %",
        size: isMobile ? 50 : 130,
        Cell: ({ cell }) => {
          const pct = cell.getValue<number>() || 0;
          return isMobile ? (
            <Typography variant="caption" fontWeight={600}>
              {pct.toFixed(0)}%
            </Typography>
          ) : (
            <Box sx={{ width: "100%" }}>
              <Typography variant="caption">{pct.toFixed(0)}%</Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(pct, 100)}
                color={pct > 100 ? "warning" : pct >= 50 ? "primary" : "inherit"}
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Box>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: isMobile ? 60 : 110,
        Cell: ({ cell }) => {
          const s = cell.getValue<ContractStatus>();
          const label = s.replace("_", " ");
          return (
            <Chip
              label={isMobile ? label.charAt(0).toUpperCase() : label.toUpperCase()}
              size="small"
              color={STATUS_COLOR[s]}
            />
          );
        },
      },
      {
        id: "mrt-row-actions",
        header: "",
        size: 96,
        enableSorting: false,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.25 }}>
            <Tooltip title="Open (record payment, photos, delete…)">
              <IconButton size="small" onClick={() => onOpen(row.original)}>
                <OpenInNew fontSize="small" />
              </IconButton>
            </Tooltip>
            {canEdit && (
              <Tooltip title="Edit all fields">
                <IconButton size="small" onClick={() => onEdit(row.original)}>
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ),
      },
    ],
    [isMobile, canEdit, onOpen, onEdit]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Stat label="Agreed value" value={inr(stats.value)} />
        <Stat label="Paid" value={inr(stats.paid)} color={wsColors.green} />
        <Stat
          label={stats.due < 0 ? "Overpaid" : "Balance"}
          value={inr(Math.abs(stats.due))}
          color={stats.due < 0 ? wsColors.amber : wsColors.red}
        />
        <Stat label="Payment records" value={String(stats.records)} />
      </Box>

      <Tabs
        value={filter}
        onChange={(_e, v) => setFilter(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ borderBottom: `1px solid ${wsColors.hairline}`, minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 700 } }}
      >
        {FILTERS.map((f) => (
          <Tab key={f.value} value={f.value} label={`${f.label} ${counts[f.value] ?? 0}`} />
        ))}
      </Tabs>

      {error && <Alert severity="error">Failed to load subcontracts: {(error as Error).message}</Alert>}

      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoading}
        showRecordCount
        enableExpanding={!isMobile}
        pinnedColumns={{ left: ["title"], right: ["mrt-row-actions"] }}
        renderDetailPanel={({ row }) => (
          <SubcontractPaymentBreakdown subcontractId={row.original.id} totalValue={row.original.total_value} />
        )}
      />
    </Box>
  );
}
