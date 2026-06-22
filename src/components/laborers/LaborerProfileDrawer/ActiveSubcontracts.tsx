"use client";

import { useMemo } from "react";
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { computeExposure } from "@/lib/workforce/exposure";
import { severityMeta } from "@/lib/workforce/workspaceTokens";
import { MiniDualProgressBar } from "@/components/workforce/MiniDualProgressBar";
import { SectionTitle } from "./shared";

interface ActiveSubcontractsProps {
  associatedTeamId: string | null;
}

interface ActiveSubcontractRow {
  id: string;
  title: string;
  total_value: number;
  status: string;
  start_date: string | null;
  expected_end_date: string | null;
  site_name: string | null;
  paid_amount: number;
  work_progress_percent: number | null;
}

function ActiveRow({ row }: { row: ActiveSubcontractRow }) {
  const paidPct =
    row.total_value > 0
      ? Math.min(100, Math.round((row.paid_amount / row.total_value) * 100))
      : 0;
  const work =
    row.work_progress_percent == null
      ? null
      : Math.max(0, Math.min(1, row.work_progress_percent / 100));
  // Same exposure model as the Workforce workspace: is the crew paid ahead of the work?
  const exposure = computeExposure({
    quoted: row.total_value,
    paid: row.paid_amount,
    work,
  });
  const sev = severityMeta[exposure.severity];

  return (
    <ListItem
      disableGutters
      sx={{
        flexDirection: "column",
        alignItems: "stretch",
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-child": { borderBottom: 0 },
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
        <ListItemText
          primary={row.title}
          primaryTypographyProps={{
            variant: "body2",
            fontWeight: 600,
            component: "div",
          }}
          secondary={
            <Box
              component="span"
              sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 0.25 }}
            >
              <Typography variant="caption" color="text.secondary">
                {row.site_name ?? "—"}
              </Typography>
              <Chip
                size="small"
                label={row.status}
                sx={{ height: 18, fontSize: 10 }}
              />
              {exposure.tracked && (
                <Chip
                  size="small"
                  label={sev.label}
                  sx={{
                    height: 18,
                    fontSize: 10,
                    fontWeight: 700,
                    color: sev.color,
                    bgcolor: sev.bg,
                    border: "none",
                  }}
                />
              )}
            </Box>
          }
          secondaryTypographyProps={{ component: "div" }}
        />
        <Typography variant="body2" fontWeight={500} sx={{ whiteSpace: "nowrap" }}>
          {formatCurrency(row.total_value)}
        </Typography>
      </Box>
      <Box sx={{ mt: 0.75 }}>
        <MiniDualProgressBar paidPct={paidPct / 100} workPct={work} width="100%" height={7} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: "block" }}
        >
          {formatCurrency(row.paid_amount)} paid · {paidPct}% · work{" "}
          {row.work_progress_percent == null ? "—" : `${row.work_progress_percent}%`}
        </Typography>
      </Box>
    </ListItem>
  );
}

export default function ActiveSubcontracts({
  associatedTeamId,
}: ActiveSubcontractsProps) {
  const supabase = useMemo(() => createClient(), []);
  const enabled = Boolean(associatedTeamId);

  const { data, isLoading } = useQuery<ActiveSubcontractRow[]>({
    queryKey: ["laborer-profile-active-subcontracts", associatedTeamId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows, error } = await (supabase
        .from("subcontracts") as any)
        .select(
          `
          id, title, total_value, status, start_date, expected_end_date,
          work_progress_percent,
          site:sites(name)
        `,
        )
        .eq("team_id", associatedTeamId)
        .not("status", "in", "(completed,cancelled)")
        .order("start_date", { ascending: false });
      if (error) throw error;

      const list = (rows ?? []) as any[];
      if (list.length === 0) return [];

      const ids = list.map((r) => r.id);
      const { data: paidRows, error: paidErr } = await (supabase
        .from("settlement_groups") as any)
        .select("subcontract_id, total_amount, is_cancelled, settlement_date")
        .in("subcontract_id", ids)
        .eq("is_cancelled", false)
        .not("settlement_date", "is", null);
      if (paidErr) throw paidErr;

      const paidByContract: Record<string, number> = {};
      for (const p of (paidRows ?? []) as any[]) {
        const k = p.subcontract_id as string;
        paidByContract[k] = (paidByContract[k] ?? 0) + Number(p.total_amount ?? 0);
      }

      // Materials bought under these contracts also count toward spend. Only
      // paid rows; amount basis matches v_all_expenses (amount_paid, else total).
      // The .or() mirrors the view's inclusion rule (own_site always;
      // group_stock only once it carries a settlement_reference).
      const { data: materialRows, error: matErr } = await (supabase
        .from("material_purchase_expenses") as any)
        .select("subcontract_id, amount_paid, total_amount")
        .in("subcontract_id", ids)
        .eq("is_paid", true)
        .or("purchase_type.neq.group_stock,settlement_reference.not.is.null");
      if (matErr) throw matErr;
      for (const m of (materialRows ?? []) as any[]) {
        const k = m.subcontract_id as string;
        if (!k) continue;
        paidByContract[k] =
          (paidByContract[k] ?? 0) + (Number(m.amount_paid ?? m.total_amount) || 0);
      }

      return list.map((r) => ({
        id: r.id,
        title: r.title ?? "Untitled task work",
        total_value: Number(r.total_value ?? 0),
        status: r.status ?? "—",
        start_date: r.start_date ?? null,
        expected_end_date: r.expected_end_date ?? null,
        site_name: r.site?.name ?? null,
        paid_amount: paidByContract[r.id] ?? 0,
        work_progress_percent:
          r.work_progress_percent == null ? null : Number(r.work_progress_percent),
      }));
    },
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <Box>
        <SectionTitle>Active task work</SectionTitle>
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </Stack>
      </Box>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <Box>
      <SectionTitle>Active task work</SectionTitle>
      <List dense disablePadding>
        {data.map((row) => (
          <ActiveRow key={row.id} row={row} />
        ))}
      </List>
    </Box>
  );
}
