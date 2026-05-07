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
  ReceiptLong as ReceiptLongIcon,
  TaskAlt as TaskAltIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ContractActivity,
  ContractReconciliation,
  TradeContract,
} from "@/types/trade.types";
import { useContractPayments } from "@/hooks/queries/useContractPayments";
import { ReconciliationStrip } from "./ReconciliationStrip";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { HeadcountEntryInline } from "./HeadcountEntryInline";
import { WeeklyHeadcountSettleDialog } from "./WeeklyHeadcountSettleDialog";
import { ContractWorkUpdatesPanel } from "./ContractWorkUpdatesPanel";
import MiscExpenseDialog from "@/components/expenses/MiscExpenseDialog";
import { MestriSettleDialog } from "@/components/payments/MestriSettleDialog";

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
  // Direct subcontract_payments types
  weekly_advance: "Daily/Weekly",
  part_payment: "Part payment",
  milestone: "Milestone",
  final_settlement: "Final settlement",
  // Settlement_groups types — these produce a single "Salary settlement"
  // / "Advance settlement" chip; the redundant source chip is suppressed
  // when we already convey settlement-ness via the type label.
  salary: "Salary settlement",
  advance: "Advance settlement",
  other: "Settlement",
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
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  // Settle flow: tracks WHICH dialog the dispatcher opened. mode-aware.
  const [settleDialog, setSettleDialog] = useState<
    null | "weekly_headcount" | "mesthri_payment" | "mesthri_settle"
  >(null);
  const menuOpen = Boolean(menuAnchor);
  const queryClient = useQueryClient();

  // Only fetch payments when row is expanded — avoids N+1 fetch on the hub
  const { data: payments, isLoading: paymentsLoading } = useContractPayments(
    expanded ? contract.id : undefined
  );

  // Sum extras client-side from the unified ledger so the strip + header
  // numbers reflect snacks/fuel/materials immediately after one is recorded.
  // The reconciliation view itself doesn't include misc_expenses (yet).
  const extrasTotal = (payments ?? [])
    .filter((p) => p.source === "extra")
    .reduce((sum, p) => sum + p.amount, 0);

  const quoted = reconciliation?.quotedAmount ?? contract.totalValue ?? 0;
  const paid = (reconciliation?.amountPaid ?? 0) + extrasTotal;
  const balance = quoted - paid;

  // Settle dispatcher — chooses the right dialog by labor_tracking_mode.
  // In-house Civil contracts have no quote and no mesthri to settle, so
  // we hide the Settle button entirely for them.
  const canSettle = !contract.isInHouse;
  const dispatchSettle = () => {
    if (contract.laborTrackingMode === "headcount") {
      setSettleDialog("weekly_headcount");
    } else if (contract.laborTrackingMode === "detailed") {
      // Civil-style flow: reuse the production MestriSettleDialog which
      // already handles weekly waterfall + sub-contract scoping.
      setSettleDialog("mesthri_settle");
    } else {
      // mesthri_only: open RecordPaymentDialog with weekly_advance preset
      // and a sensible amount (1/4 of remaining balance, rounded to ₹100).
      setSettleDialog("mesthri_payment");
    }
  };
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
        {canSettle && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              dispatchSettle();
            }}
          >
            <ListItemIcon>
              <TaskAltIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText>Settle for the week</ListItemText>
          </MenuItem>
        )}
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
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setExtraDialogOpen(true);
          }}
        >
          <ListItemIcon>
            <ReceiptLongIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add extra (snacks, fuel, materials)</ListItemText>
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
            extrasTotal={extrasTotal}
          />

          {/* Today's work updates (morning + evening photos + plan/summary).
              Hidden for in-house Civil since per-contract photos for the
              auto-created in-house pool aren't useful — civil photos
              already live at the site level via daily_work_summary. */}
          {!contract.isInHouse && (
            <ContractWorkUpdatesPanel
              siteId={contract.siteId}
              contractId={contract.id}
            />
          )}

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
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ReceiptLongIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExtraDialogOpen(true);
                  }}
                >
                  Add extra
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPaymentDialogOpen(true);
                  }}
                >
                  Record payment
                </Button>
                {canSettle && (
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<TaskAltIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatchSettle();
                    }}
                  >
                    Settle
                  </Button>
                )}
              </Stack>
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
                    <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography variant="body2" sx={{ width: 70 }}>
                        {formatDate(p.paymentDate)}
                      </Typography>
                      <Chip
                        label={PAYMENT_TYPE_LABEL[p.paymentType] ?? p.paymentType}
                        size="small"
                        variant={p.source === "direct" ? "outlined" : "filled"}
                        // direct → default outlined, settlement → info-blue,
                        // extra (snacks/fuel/materials) → warning-amber so the
                        // engineer can spot non-labor money flow at a glance.
                        color={
                          p.source === "settlement"
                            ? "info"
                            : p.source === "extra"
                            ? "warning"
                            : "default"
                        }
                      />
                      {p.paymentMode && (
                        <Typography variant="caption" color="text.secondary">
                          {p.paymentMode}
                        </Typography>
                      )}
                      {p.reference && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                          {p.reference}
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
        // Pass real signed balance — dialog renders "X over quote" or "X
        // remaining" so the engineer sees the current state honestly,
        // including over-paid contracts where balance < 0.
        remainingBalance={balance}
      />

      {/* Misc expense (extra) dialog — preselects this contract and refreshes
          the contract ledger + reconciliation when an extra is saved.
          Gated on extraDialogOpen so the dialog's hook tree (useAuth, etc.)
          only runs when the user actually clicks Add extra. Keeps the Card
          render path light and avoids forcing an AuthProvider into unrelated
          unit tests of TradeCard. */}
      {extraDialogOpen && (
        <MiscExpenseDialog
          open={extraDialogOpen}
          onClose={() => setExtraDialogOpen(false)}
          defaultSubcontractId={contract.id}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["contract-payments", contract.id],
            });
            queryClient.invalidateQueries({
              queryKey: ["trade-reconciliations", "site", contract.siteId],
            });
            queryClient.invalidateQueries({
              queryKey: ["trade-activity", "site", contract.siteId],
            });
          }}
        />
      )}

      {/* Settle dispatcher — exactly one of three dialogs based on mode. */}
      {settleDialog === "weekly_headcount" && (
        <WeeklyHeadcountSettleDialog
          open={true}
          onClose={() => setSettleDialog(null)}
          onSaved={() => {
            /* invalidation handled inside */
          }}
          siteId={contract.siteId}
          contractId={contract.id}
          contractTitle={`${contract.title} · ${contractLabel(contract)}`}
        />
      )}
      {settleDialog === "mesthri_payment" && (
        <RecordPaymentDialog
          open={true}
          onClose={() => setSettleDialog(null)}
          onSaved={() => {
            /* invalidation handled inside */
          }}
          siteId={contract.siteId}
          contractId={contract.id}
          contractTitle={`${contract.title} · ${contractLabel(contract)}`}
          remainingBalance={balance}
          // Mesthri-only Settle: default the type to weekly_advance and
          // pre-fill ¼ of the remaining balance (rounded to nearest ₹100)
          // as a sensible week's worth. Engineer can edit before submit.
          defaultPaymentType="weekly_advance"
          defaultAmount={
            balance > 0
              ? Math.max(100, Math.round(balance / 4 / 100) * 100)
              : 0
          }
          titleOverride="Settle for the week"
        />
      )}
      {settleDialog === "mesthri_settle" && (
        <MestriSettleDialog
          open={true}
          onClose={() => setSettleDialog(null)}
          siteId={contract.siteId}
          // Pre-scope to this contract so the engineer doesn't have to
          // pick from the site-wide list again.
          initialSubcontractId={contract.id}
          // fill-week mode needs week boundaries — use the current Sun-Sat
          // window per project convention.
          mode="fill-week"
          weekStart={currentWeekStartStr()}
          weekEnd={currentWeekEndStr()}
        />
      )}
    </Box>
  );
}

/* Current Sun-Sat week boundaries — duplicated in 3 places already across
 * the app, but tiny enough to inline rather than reach for weekUtils here.
 * Kept consistent with src/lib/utils/weekUtils.ts:weekStartOf/weekEndOf. */
function currentWeekStartStr(): string {
  const d = new Date();
  const dow = d.getDay(); // 0 = Sunday
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  return formatYMD(start);
}
function currentWeekEndStr(): string {
  const d = new Date();
  const dow = d.getDay();
  const end = new Date(d);
  end.setDate(d.getDate() + (6 - dow));
  return formatYMD(end);
}
function formatYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
