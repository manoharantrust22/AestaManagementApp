"use client";

import React from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowUpward,
  ArrowDownward,
  KeyboardReturn,
  ReceiptLong,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import { prettyPayerSource } from "./spendDetailHelpers";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

// Salary-settlement spends are stamped with the day they were RECORDED (transaction_date),
// not the attendance day they actually pay for. The settlement reference encodes that real
// date (SET-YYMMDD-NNN), so we surface it as the headline date — otherwise settling several
// past dates in one sitting looks like "two settlements on the same day". Returns null when
// the description has no parseable settlement reference (e.g. material/rental spends).
export function settlementDateFromDescription(description?: string | null): dayjs.Dayjs | null {
  if (!description) return null;
  const m = description.match(/SET-(\d{2})(\d{2})(\d{2})-\d+/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const d = dayjs(`20${yy}-${mm}-${dd}`);
  return d.isValid() ? d : null;
}

// The date a row is shown and sorted by: the real settlement date for salary/
// contract spends (parsed from the SET-ref), otherwise the recorded transaction_date.
// Sorting by this — rather than the keying-in date the server orders by — lets the
// feed read top-to-bottom in settlement-date order so it lines up 1:1 with the
// Salary Settlements page for cross-verification. Deposits/returns have no SET-ref,
// so they keep their transaction_date and their relative order is unchanged.
export function headlineDateOf(row: WalletLedgerEntry): dayjs.Dayjs {
  const settlementDate =
    row.transaction_type === "spend"
      ? settlementDateFromDescription(row.description)
      : null;
  return settlementDate ?? dayjs(row.transaction_date);
}

const TYPE_META: Record<
  WalletLedgerEntry["transaction_type"],
  { label: string; color: "success" | "warning" | "info"; sign: "+" | "-"; icon: React.ReactNode }
> = {
  deposit: { label: "Deposit", color: "success", sign: "+", icon: <ArrowUpward fontSize="small" /> },
  spend: { label: "Spend", color: "warning", sign: "-", icon: <ArrowDownward fontSize="small" /> },
  return: { label: "Return", color: "info", sign: "-", icon: <KeyboardReturn fontSize="small" /> },
};

interface WalletLedgerListProps {
  pages: { rows: WalletLedgerEntry[] }[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** Called when a deposit row is tapped. Opens the deposit edit dialog. */
  onRowClick?: (entry: WalletLedgerEntry) => void;
  /** Called when a spend or return row is tapped. Opens the read-only
   *  Spend details verification dialog. Separate from onRowClick (deposits)
   *  so a row is only clickable when its specific handler is provided. */
  onSpendClick?: (entry: WalletLedgerEntry) => void;
  /** When provided, renders an engineer chip on each row. Used in the company
   *  All Engineers ledger to disambiguate which engineer the transaction belongs to. */
  engineerNameByUserId?: Map<string, string>;
  /** When provided, renders a site chip on each row. Useful when the ledger is
   *  not already filtered to a single site. */
  siteNameBySiteId?: Map<string, string>;
}

export default function WalletLedgerList({
  pages,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRowClick,
  onSpendClick,
  engineerNameByUserId,
  siteNameBySiteId,
}: WalletLedgerListProps) {
  // Server returns rows in transaction_date (keyed-in) order. Re-sort the loaded
  // rows by their settlement date so the feed reads sequentially for reconciliation.
  // Array.prototype.sort is stable, so same-day rows keep the server's tiebreak order.
  // Note: this only reorders rows already loaded — "Load older entries" pulls the next
  // transaction_date page (the cursor is unaffected) and the full set re-sorts on render.
  const rows = pages
    .flatMap((p) => p.rows)
    .slice()
    .sort((a, b) => headlineDateOf(b).valueOf() - headlineDateOf(a).valueOf());

  if (isLoading && rows.length === 0) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }

  if (rows.length === 0) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 6, color: "text.secondary" }}>
        <ReceiptLong sx={{ fontSize: 48, opacity: 0.4 }} />
        <Typography variant="body2">No wallet activity yet</Typography>
      </Stack>
    );
  }

  return (
    <Box>
      <List disablePadding>
        {rows.map((row, idx) => {
          const meta = TYPE_META[row.transaction_type];
          const isLast = idx === rows.length - 1;
          // For salary-settlement spends, show the date the work was actually for
          // (parsed from the SET-ref) rather than the day it was keyed in.
          const settlementDate =
            row.transaction_type === "spend"
              ? settlementDateFromDescription(row.description)
              : null;
          const headlineDate = settlementDate ?? dayjs(row.transaction_date);
          const showRecordedHint =
            !!settlementDate && !settlementDate.isSame(dayjs(row.transaction_date), "day");
          // Deposits open the edit dialog (onRowClick); spends/returns open the
          // read-only Spend details dialog (onSpendClick). A row is clickable only
          // when its own handler is wired, so there are no dead click affordances.
          const handleRowClick =
            row.transaction_type === "deposit"
              ? onRowClick
                ? () => onRowClick(row)
                : undefined
              : onSpendClick
              ? () => onSpendClick(row)
              : undefined;
          const isClickable = !!handleRowClick;
          return (
            <React.Fragment key={row.id}>
              <ListItem
                onClick={handleRowClick}
                sx={{
                  cursor: isClickable ? "pointer" : "default",
                  py: 1.5,
                  "&:hover": isClickable ? { bgcolor: "action.hover" } : undefined,
                }}
                secondaryAction={
                  <Stack alignItems="flex-end" spacing={0.25}>
                    <Typography
                      variant="body1"
                      fontWeight={700}
                      color={meta.color === "success" ? "success.main" : "text.primary"}
                    >
                      {meta.sign} ₹{fmt(Number(row.amount))}
                    </Typography>
                    <Chip
                      size="small"
                      label={row.payment_mode.toUpperCase()}
                      variant="outlined"
                      sx={{ fontSize: "0.65rem", height: 20 }}
                    />
                  </Stack>
                }
              >
                <ListItemAvatar>
                  <Avatar
                    sx={{
                      bgcolor:
                        meta.color === "success"
                          ? "success.light"
                          : meta.color === "warning"
                          ? "warning.light"
                          : "info.light",
                      color: "common.white",
                      width: 36,
                      height: 36,
                    }}
                  >
                    {meta.icon}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {meta.label}
                      </Typography>
                      {engineerNameByUserId && engineerNameByUserId.get(row.user_id) && (
                        <Chip
                          size="small"
                          label={engineerNameByUserId.get(row.user_id)}
                          color="primary"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      )}
                      {siteNameBySiteId && row.site_id && siteNameBySiteId.get(row.site_id) && (
                        <Chip
                          size="small"
                          label={siteNameBySiteId.get(row.site_id)}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.65rem", color: "text.secondary" }}
                        />
                      )}
                      {row.transaction_type === "deposit" && row.payer_source && (
                        <Chip
                          size="small"
                          label={prettyPayerSource(row.payer_source, row.payer_name)}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      )}
                      {row.proof_url && (
                        <Chip
                          size="small"
                          label="Proof"
                          color="default"
                          variant="filled"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      )}
                      {row.edited_at && (
                        <Chip
                          size="small"
                          label="Edited"
                          color="warning"
                          variant="outlined"
                          title={
                            row.edit_reason
                              ? `${dayjs(row.edited_at).format("D MMM YYYY")} — ${row.edit_reason}`
                              : dayjs(row.edited_at).format("D MMM YYYY")
                          }
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      )}
                    </Stack>
                  }
                  secondary={
                    <Stack direction="column" spacing={0} sx={{ mt: 0.25 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {headlineDate.format("D MMM YYYY")}
                        </Typography>
                        {row.description && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            • {row.description}
                          </Typography>
                        )}
                      </Stack>
                      {showRecordedHint && (
                        <Typography variant="caption" color="text.disabled" noWrap>
                          recorded {dayjs(row.transaction_date).format("D MMM YYYY")}
                        </Typography>
                      )}
                      {row.notes && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {row.notes}
                        </Typography>
                      )}
                    </Stack>
                  }
                  primaryTypographyProps={{ component: "div" }}
                  secondaryTypographyProps={{ component: "div" }}
                />
              </ListItem>
              {!isLast && <Divider component="li" />}
            </React.Fragment>
          );
        })}
      </List>

      {hasNextPage && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <Button
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            size="small"
            variant="outlined"
          >
            {isFetchingNextPage ? "Loading…" : "Load older entries"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
