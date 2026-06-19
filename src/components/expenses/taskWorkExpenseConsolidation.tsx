"use client";

import React from "react";
import {
  Box,
  Chip,
  Divider,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  AccountBalanceWallet as WalletIcon,
  ReceiptLong as ReceiptIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { formatPayerSource } from "@/lib/settlement/payerSource";
import {
  taskPaymentLineNumbers,
  formatTaskPaymentRef,
} from "@/lib/taskWork/paymentRef";
import type { PayerSourceSplitRow } from "@/types/settlement.types";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const CONSOLIDATED_PREFIX = "tw:";

/**
 * The slice of a `v_all_expenses` row this module needs. Kept loose (`[k:string]`)
 * so both the V1 (`ExpenseWithCategory`) and V2 (`ExpenseRow`) page types satisfy it.
 */
export interface TwExpenseRowLike {
  id: string;
  amount: number;
  date: string;
  recorded_date?: string | null;
  created_at?: string;
  description?: string | null;
  payment_mode?: string | null;
  payer_name?: string | null;
  payer_source_split?: PayerSourceSplitRow[] | null;
  receipt_url?: string | null;
  engineer_transaction_id?: string | null;
  settlement_reference?: string | null;
  source_type?: string;
  source_id?: string;
  vendor_name?: string | null;
  subcontract_title?: string | null;
  // Attached by consolidateTaskWorkRows on the synthetic parent row.
  __taskChildren?: TwExpenseRowLike[];
  __taskTitle?: string;
  __taskMaistry?: string | null;
  __taskStatus?: string | null;
  __taskCount?: number;
  [k: string]: any;
}

export interface TwPackageMeta {
  package_number: string;
  title: string;
  maistry_name: string | null;
  status?: string | null;
  parent_subcontract_title?: string | null;
}

/** True for the synthetic one-row-per-package row produced below. */
export const isConsolidatedTaskWork = (row: {
  source_type?: string;
  source_id?: string;
  id?: string;
}): boolean =>
  row.source_type === "task_work_payment" &&
  String(row.source_id ?? row.id ?? "").startsWith(CONSOLIDATED_PREFIX);

/** "Task Work (advance) - title" → "advance". */
function paymentTypeLabel(description?: string | null): string {
  const m = (description ?? "").match(/Task Work \(([^)]+)\)/);
  return m ? m[1] : "payment";
}

/** Resolve one payment's per-source contributions (single source or a split). */
function sourcesOf(child: TwExpenseRowLike): { label: string; amount: number }[] {
  const src = formatPayerSource({
    payer_source: null,
    payer_name: child.payer_name ?? null,
    payer_source_split: child.payer_source_split ?? null,
  });
  if (src.kind === "single") {
    return [{ label: src.label, amount: child.amount || 0 }];
  }
  return src.rows.map((r) => ({ label: r.label, amount: r.amount }));
}

/** Sum each payment source across all of a package's payments, largest first. */
export function aggregatePayerBreakdown(
  children: TwExpenseRowLike[]
): { label: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const c of children) {
    for (const s of sourcesOf(c)) {
      map.set(s.label, (map.get(s.label) ?? 0) + (s.amount || 0));
    }
  }
  return [...map.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Compact "Own ₹4,000 · Client ₹2,250" summary for the Paid-By cell. */
export function breakdownSummary(children: TwExpenseRowLike[]): string {
  const parts = aggregatePayerBreakdown(children);
  if (parts.length === 0) return "—";
  const shown = parts.slice(0, 3).map((p) => `${p.label} ${inr(p.amount)}`);
  const extra = parts.length - 3;
  return shown.join(" · ") + (extra > 0 ? ` · +${extra}` : "");
}

/**
 * Collapse every `task_work_payment` row into ONE synthetic row per package
 * (keyed by `settlement_reference` = the TW package number), summing the amount
 * and merging the payer breakdown. Non-task rows pass through untouched. The
 * synthetic row keeps `source_type = 'task_work_payment'` and a `tw:<num>` id, and
 * stashes its children on `__taskChildren` for the expandable detail panel.
 *
 * Grand totals are preserved because the synthetic amount equals the sum of its
 * children (page summaries read the raw rows / server RPC, which are unchanged).
 */
export function consolidateTaskWorkRows<T extends TwExpenseRowLike>(
  rows: T[],
  pkgByNumber: Map<string, TwPackageMeta>
): T[] {
  const taskRows = rows.filter((r) => r.source_type === "task_work_payment");
  if (taskRows.length === 0) return rows;

  const others = rows.filter((r) => r.source_type !== "task_work_payment");
  const groups = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const r of taskRows) {
    const key = r.settlement_reference ?? "";
    if (!key) {
      ungrouped.push(r); // no package ref → leave as-is rather than mis-group
      continue;
    }
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const consolidated: T[] = [];
  for (const [pkgNumber, children] of groups.entries()) {
    const meta = pkgByNumber.get(pkgNumber);
    const total = children.reduce((s, c) => s + (c.amount || 0), 0);
    const latestDate = children.reduce(
      (m, c) => (c.date > m ? c.date : m),
      children[0].date
    );
    const latestRec = children.reduce((m, c) => {
      const d = (c.recorded_date ?? c.created_at ?? c.date) as string;
      return d > m ? d : m;
    }, (children[0].recorded_date ?? children[0].created_at ?? children[0].date) as string);
    const title = meta?.title ?? "Task Work";
    const maistry = meta?.maistry_name ?? null;

    consolidated.push({
      ...children[0],
      id: `${CONSOLIDATED_PREFIX}${pkgNumber}`,
      source_id: `${CONSOLIDATED_PREFIX}${pkgNumber}`,
      source_type: "task_work_payment",
      amount: total,
      date: latestDate,
      recorded_date: latestRec,
      // Title-led so the row is instantly recognisable as the task; the maistry
      // moves to vendor_name and the "Task Work" expense_type chip carries the type.
      description: title,
      vendor_name: maistry,
      payer_name: breakdownSummary(children),
      payer_source_split: null,
      receipt_url: null,
      engineer_transaction_id: null,
      subcontract_title:
        meta?.parent_subcontract_title ?? children[0].subcontract_title ?? null,
      is_cleared: true,
      settlement_reference: pkgNumber,
      __taskChildren: children,
      __taskTitle: title,
      __taskMaistry: maistry,
      __taskStatus: meta?.status ?? null,
      __taskCount: children.length,
    } as unknown as T);
  }

  return [...others, ...consolidated, ...ungrouped].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
}

/** Expandable detail for a consolidated task-work row: the per-source breakdown + each payment. */
export function TaskWorkExpenseDetail({ row }: { row: TwExpenseRowLike }) {
  const children = row.__taskChildren ?? [];
  const lineNumbers = taskPaymentLineNumbers(
    children.map((c) => ({
      id: c.source_id ?? c.id,
      payment_date: c.date,
      created_at: c.created_at ?? null,
    }))
  );
  const pkgNumber = row.settlement_reference ?? "";
  const breakdown = aggregatePayerBreakdown(children);

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 760 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {row.__taskTitle}
        {row.__taskMaistry ? ` — ${row.__taskMaistry}` : ""}
        {row.__taskStatus ? (
          <Chip
            size="small"
            label={String(row.__taskStatus).replace(/_/g, " ")}
            sx={{ ml: 1, textTransform: "capitalize" }}
          />
        ) : null}
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1, mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
          Paid by source:
        </Typography>
        {breakdown.map((b) => (
          <Chip
            key={b.label}
            size="small"
            variant="outlined"
            color="secondary"
            label={`${b.label} ${inr(b.amount)}`}
          />
        ))}
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Ref</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Mode</TableCell>
            <TableCell align="center">Proof</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {children.map((c) => {
            const isWallet = !!c.engineer_transaction_id;
            const src = formatPayerSource({
              payer_source: null,
              payer_name: c.payer_name ?? null,
              payer_source_split: c.payer_source_split ?? null,
            });
            return (
              <TableRow key={c.id}>
                <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
                  {pkgNumber
                    ? formatTaskPaymentRef(pkgNumber, lineNumbers.get(c.source_id ?? c.id) ?? 0)
                    : "—"}
                </TableCell>
                <TableCell>{dayjs(c.date).format("DD MMM YYYY")}</TableCell>
                <TableCell sx={{ textTransform: "capitalize" }}>
                  {paymentTypeLabel(c.description)}
                </TableCell>
                <TableCell align="right">{inr(c.amount)}</TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {isWallet && (
                      <WalletIcon fontSize="inherit" color="primary" titleAccess="Engineer wallet" />
                    )}
                    {src.kind === "single" ? src.label : src.summary}
                  </Box>
                </TableCell>
                <TableCell sx={{ textTransform: "uppercase" }}>
                  {c.payment_mode || "—"}
                </TableCell>
                <TableCell align="center">
                  {c.receipt_url ? (
                    <Link
                      href={c.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ display: "inline-flex" }}
                    >
                      <ReceiptIcon fontSize="small" />
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
