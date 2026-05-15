"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Chip,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Skeleton,
} from "@mui/material";
import {
  Payment as PaymentIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as SettledIcon,
  Pending as PendingIcon,
  Visibility as ViewIcon,
  SwapHoriz as SwapPayerIcon,
} from "@mui/icons-material";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type {
  MaterialPurchaseExpenseWithDetails,
  PurchaseOrderWithDetails,
} from "@/types/material.types";
import SourceChip from "./SourceChip";
import {
  getItemAmount,
  getItemDate,
  getItemRefCode,
  getItemVendorName,
  getSettlementType,
  isItemSettled,
  type SettlementItem,
} from "./settlementClassifiers";

type SortKey = "date" | "amount" | "vendor" | "ref";
type SortDir = "asc" | "desc";

interface Props {
  items: SettlementItem[];
  isLoading: boolean;
  currentSiteId: string | undefined;
  canEdit: boolean;
  onSettle: (item: SettlementItem) => void;
  onInspect: (item: SettlementItem) => void;
  onEdit: (purchase: MaterialPurchaseExpenseWithDetails) => void;
  onDelete: (purchase: MaterialPurchaseExpenseWithDetails) => void;
  onChangePayer?: (purchase: MaterialPurchaseExpenseWithDetails) => void;
}

export default function SettlementsTableView({
  items,
  isLoading,
  currentSiteId,
  canEdit,
  onSettle,
  onInspect,
  onEdit,
  onDelete,
  onChangePayer,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  // Default to newest-first so users see most recent bills/POs at the top.
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const list = [...items];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      // Pending always before settled
      const aSettled = isItemSettled(a);
      const bSettled = isItemSettled(b);
      if (aSettled !== bSettled) return aSettled ? 1 : -1;

      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "date":
          av = Date.parse(getItemDate(a)) || 0;
          bv = Date.parse(getItemDate(b)) || 0;
          break;
        case "amount":
          av = getItemAmount(a);
          bv = getItemAmount(b);
          break;
        case "vendor":
          av = getItemVendorName(a).toLowerCase();
          bv = getItemVendorName(b).toLowerCase();
          break;
        case "ref":
          av = getItemRefCode(a).toLowerCase();
          bv = getItemRefCode(b).toLowerCase();
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [items, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "amount" ? "desc" : "asc");
    }
  };

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <TableContainer sx={{ maxHeight: { md: "70vh" } }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sortDirection={sortKey === "ref" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "ref"}
                  direction={sortKey === "ref" ? sortDir : "asc"}
                  onClick={() => toggleSort("ref")}
                >
                  Ref
                </TableSortLabel>
              </TableCell>
              <TableCell>Source</TableCell>
              <TableCell sortDirection={sortKey === "date" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "date"}
                  direction={sortKey === "date" ? sortDir : "asc"}
                  onClick={() => toggleSort("date")}
                >
                  Date
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortKey === "vendor" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "vendor"}
                  direction={sortKey === "vendor" ? sortDir : "asc"}
                  onClick={() => toggleSort("vendor")}
                >
                  Vendor
                </TableSortLabel>
              </TableCell>
              <TableCell>Items</TableCell>
              <TableCell align="right" sortDirection={sortKey === "amount" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "amount"}
                  direction={sortKey === "amount" ? sortDir : "asc"}
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                </TableSortLabel>
              </TableCell>
              <TableCell>Payer</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No purchases match the current filters
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((item) => {
                const purchase = item.itemType === "expense"
                  ? (item as MaterialPurchaseExpenseWithDetails)
                  : null;
                const settled = isItemSettled(item);
                const kind = getSettlementType(item);
                const isCrossSiteRow =
                  purchase && purchase.site_id !== currentSiteId;
                const payerName = purchase?.paying_site?.name || (purchase ? "This site" : "—");

                return (
                  <TableRow
                    key={item.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => onInspect(item)}
                  >
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{ fontFamily: "monospace" }}
                      >
                        {getItemRefCode(item)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <SourceChip item={item} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDate(getItemDate(item))}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{getItemVendorName(item)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${item.items?.length || 0} items`}
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspect(item);
                        }}
                        sx={{ fontSize: "0.7rem", height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(getItemAmount(item))}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="caption"
                        color={isCrossSiteRow ? "info.main" : "text.secondary"}
                        sx={{ fontWeight: isCrossSiteRow ? 600 : 400 }}
                      >
                        {payerName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {settled ? (
                        <Chip
                          icon={<SettledIcon sx={{ fontSize: 14 }} />}
                          label={kind === "advance" ? "Advance paid" : kind === "group_po" ? "Vendor paid" : "Settled"}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: "0.7rem", height: 22 }}
                        />
                      ) : (
                        <Chip
                          icon={<PendingIcon sx={{ fontSize: 14 }} />}
                          label="Pending"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ fontSize: "0.7rem", height: 22 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.25 }}>
                        {!settled && canEdit && (
                          <Tooltip title="Settle">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<PaymentIcon sx={{ fontSize: 14 }} />}
                              onClick={() => onSettle(item)}
                              sx={{ minWidth: 0, px: 1 }}
                            >
                              Settle
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip title="View">
                          <IconButton size="small" onClick={() => onInspect(item)}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canEdit && purchase && (
                          <>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => onEdit(purchase)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {onChangePayer && purchase.purchase_type === "group_stock" && (
                              <Tooltip title="Change Payer">
                                <IconButton size="small" onClick={() => onChangePayer(purchase)}>
                                  <SwapPayerIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" onClick={() => onDelete(purchase)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
