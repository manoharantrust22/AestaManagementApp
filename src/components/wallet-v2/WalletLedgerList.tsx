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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

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
  onRowClick?: (entry: WalletLedgerEntry) => void;
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
  engineerNameByUserId,
  siteNameBySiteId,
}: WalletLedgerListProps) {
  const rows = pages.flatMap((p) => p.rows);

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
          // Only deposits are editable today — keep the click affordance off other rows
          // so the cursor + hover don't suggest something that won't happen.
          const isClickable = !!onRowClick && row.transaction_type === "deposit";
          return (
            <React.Fragment key={row.id}>
              <ListItem
                onClick={isClickable ? () => onRowClick!(row) : undefined}
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
                          {dayjs(row.transaction_date).format("D MMM YYYY")}
                        </Typography>
                        {row.description && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            • {row.description}
                          </Typography>
                        )}
                      </Stack>
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

function prettyPayerSource(key: string, name: string | null): string {
  const map: Record<string, string> = {
    own_money: "Own Money",
    amma_money: "Amma Money",
    mothers_money: "Amma Money",
    client_money: "Client Money",
    trust_account: "Trust Account",
    other_site_money: name ?? "Other Site",
    custom: name ?? "Other",
  };
  return map[key] ?? key;
}
