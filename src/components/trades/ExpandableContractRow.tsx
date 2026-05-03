"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Collapse,
  List,
  ListItem,
  ListItemSecondaryAction,
  Chip,
} from "@mui/material";
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  MoreVert as MoreVertIcon,
  Visibility as VisibilityIcon,
  DeleteOutline as DeleteIcon,
  Add as AddIcon,
  Payment as PaymentIcon,
} from "@mui/icons-material";
import type {
  ContractActivity,
  ContractReconciliation,
  TradeContract,
} from "@/types/trade.types";
import { useContractPayments } from "@/hooks/queries/useContractPayments";
import { ReconciliationStrip } from "./ReconciliationStrip";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { HeadcountEntryInline } from "./HeadcountEntryInline";

interface ExpandableContractRowProps {
  contract: TradeContract;
  reconciliation: ContractReconciliation | undefined;
  activity: ContractActivity | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onView?: () => void;
  onDelete?: () => void;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function contractLabel(c: TradeContract): string {
  if (c.isInHouse) return "In-house";
  return c.mesthriOrSpecialistName ?? c.title;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  weekly_advance: "Daily/Weekly",
  part_payment: "Part",
  milestone: "Milestone",
  final_settlement: "Final",
};

export function ExpandableContractRow({
  contract,
  reconciliation,
  activity,
  expanded,
  onToggleExpand,
  onView,
  onDelete,
}: ExpandableContractRowProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const menuOpen = Boolean(menuAnchor);

  // Only fetch payments when row is expanded — avoids N+1 fetch on the hub
  const { data: payments, isLoading: paymentsLoading } = useContractPayments(
    expanded ? contract.id : undefined
  );

  const quoted = reconciliation?.quotedAmount ?? contract.totalValue ?? 0;
  const paid = reconciliation?.amountPaid ?? 0;
  const balance = quoted - paid;
  const days =
    contract.laborTrackingMode === "mesthri_only"
      ? activity?.paymentDays ?? 0
      : activity?.attendanceDays ?? 0;
  const dayLabel =
    contract.laborTrackingMode === "mesthri_only"
      ? "payment days"
      : "days worked";

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: expanded ? "primary.main" : "divider",
        borderRadius: 1.5,
        transition: "border-color 120ms",
        overflow: "hidden",
      }}
    >
      {/* Header — clickable to toggle expand */}
      <Box
        onClick={onToggleExpand}
        sx={{
          p: 1.25,
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {contractLabel(contract)}
            </Typography>
            {!contract.isInHouse && contract.title && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {contract.title}
              </Typography>
            )}
          </Box>
          {(onView || onDelete) && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor(e.currentTarget);
              }}
              aria-label="contract actions"
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" sx={{ ml: 0.5 }} aria-label="toggle expand">
            {expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </IconButton>
        </Stack>

        {(quoted > 0 || paid > 0) && (
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 1 }}>
            {quoted > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  Quoted
                </Typography>
                <Typography variant="body2" fontWeight={500}>
                  ₹{formatINR(quoted)}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary" component="div">
                Paid
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                ₹{formatINR(paid)}
              </Typography>
            </Box>
            {quoted > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  Balance
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={500}
                  sx={{ color: balance < 0 ? "error.main" : "text.primary" }}
                >
                  ₹{formatINR(Math.abs(balance))}
                  {balance < 0 ? " over" : ""}
                </Typography>
              </Box>
            )}
            {days > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  {dayLabel}
                </Typography>
                <Typography variant="body2" fontWeight={500}>
                  {days}
                </Typography>
              </Box>
            )}
          </Stack>
        )}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={() => setMenuAnchor(null)}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setPaymentDialogOpen(true);
          }}
        >
          <ListItemIcon>
            <PaymentIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Record payment</ListItemText>
        </MenuItem>
        {onView && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onView();
            }}
          >
            <ListItemIcon>
              <VisibilityIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Open in Subcontracts page</ListItemText>
          </MenuItem>
        )}
        {onDelete && [
          <Divider key="div" />,
          <MenuItem
            key="del"
            onClick={() => {
              setMenuAnchor(null);
              onDelete();
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: "error.main" }} />
            </ListItemIcon>
            <ListItemText>Delete contract</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Collapse in={expanded} unmountOnExit>
        <Divider />
        <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Reconciliation strip */}
          <ReconciliationStrip
            reconciliation={reconciliation}
            laborTrackingMode={contract.laborTrackingMode}
            fallbackQuoted={contract.totalValue}
          />

          {/* Headcount entry — only for headcount mode */}
          {contract.laborTrackingMode === "headcount" && (
            <HeadcountEntryInline
              siteId={contract.siteId}
              contractId={contract.id}
            />
          )}

          {/* Recent payments + Record payment CTA */}
          <Box>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 0.75 }}
            >
              <Typography variant="subtitle2">Payments ledger</Typography>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                  setPaymentDialogOpen(true);
                }}
              >
                Record payment
              </Button>
            </Stack>

            {paymentsLoading ? (
              <Typography variant="caption" color="text.secondary">
                Loading…
              </Typography>
            ) : !payments || payments.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No payments recorded yet. Click <strong>Record payment</strong> above to
                log the first one (e.g. daily money given to the mesthri).
              </Typography>
            ) : (
              <List dense disablePadding>
                {payments.slice(0, 8).map((p) => (
                  <ListItem
                    key={p.id}
                    disableGutters
                    sx={{
                      py: 0.5,
                      borderBottom: "1px dashed",
                      borderColor: "divider",
                      "&:last-child": { borderBottom: "none" },
                    }}
                  >
                    <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" sx={{ width: 70 }}>
                        {formatDate(p.paymentDate)}
                      </Typography>
                      <Chip
                        label={PAYMENT_TYPE_LABEL[p.paymentType] ?? p.paymentType}
                        size="small"
                        variant="outlined"
                      />
                      {p.paymentMode && (
                        <Typography variant="caption" color="text.secondary">
                          {p.paymentMode}
                        </Typography>
                      )}
                    </Box>
                    <ListItemSecondaryAction>
                      <Typography variant="body2" fontWeight={600}>
                        ₹{formatINR(p.amount)}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
                {payments.length > 8 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    Showing latest 8 of {payments.length}. Open the contract in the
                    Subcontracts page for the full ledger.
                  </Typography>
                )}
              </List>
            )}
          </Box>
        </Box>
      </Collapse>

      <RecordPaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        onSaved={() => {
          /* invalidation handled inside the dialog */
        }}
        siteId={contract.siteId}
        contractId={contract.id}
        contractTitle={`${contract.title} · ${contractLabel(contract)}`}
        remainingBalance={Math.max(0, balance)}
      />
    </Box>
  );
}
