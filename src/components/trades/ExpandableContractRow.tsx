"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Collapse,
  Chip,
  Button,
} from "@mui/material";
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  MoreVert as MoreVertIcon,
  Visibility as VisibilityIcon,
  DeleteOutline as DeleteIcon,
  Tune as TuneIcon,
  AttachMoney as RatesIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  ContractActivity,
  ContractReconciliation,
  TradeContract,
} from "@/types/trade.types";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { ReconciliationStrip } from "./ReconciliationStrip";
import { ChangeTrackingModeDialog } from "./ChangeTrackingModeDialog";
import { EditRoleRatesDialog } from "./EditRoleRatesDialog";
import { EstimateMonitorPanel } from "./EstimateMonitorPanel";

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

const MODE_LABEL: Record<string, string> = {
  detailed: "Detailed",
  headcount: "Headcount",
  mid: "Mid (Laborer + Crew)",
  mesthri_only: "Mesthri-only",
};

const MODE_COLOR: Record<string, "primary" | "warning" | "info" | "secondary"> = {
  detailed: "primary",
  headcount: "warning",
  mid: "secondary",
  mesthri_only: "info",
};

/**
 * /site/trades contract row — management surface only. Data entry happens
 * on /site/attendance and /site/payments. Available actions:
 *   • Change tracking mode (detailed / headcount / mesthri_only)
 *   • Edit role rates (headcount mode only)
 *   • Open contract in /site/subcontracts for full edit
 *   • Delete contract
 */
export function ExpandableContractRow({
  contract,
  reconciliation,
  activity,
  expanded,
  onToggleExpand,
  onView,
  onDelete,
}: ExpandableContractRowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(menuAnchor);

  const [changeModeOpen, setChangeModeOpen] = useState(false);
  const [editRatesOpen, setEditRatesOpen] = useState(false);

  // Fetch role rates only when expanded — keeps the unexpanded row light.
  const { data: headcount } = useContractHeadcount(
    expanded && contract.laborTrackingMode === "headcount"
      ? contract.id
      : undefined
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

  const goToAttendance = () => {
    router.push(`/site/attendance`);
  };
  const goToPayments = () => {
    router.push(`/site/payments`);
  };

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
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {contractLabel(contract)}
              </Typography>
              <Chip
                label={MODE_LABEL[contract.laborTrackingMode] ?? contract.laborTrackingMode}
                size="small"
                color={MODE_COLOR[contract.laborTrackingMode] ?? "default"}
                variant="outlined"
                sx={{ height: 18, fontSize: "0.6rem" }}
              />
            </Stack>
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
        {/* Only an exit from grandfathered modes — payments-only rows have
            nowhere to switch to (headcount is no longer offered). */}
        {contract.laborTrackingMode !== "mesthri_only" && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setChangeModeOpen(true);
            }}
          >
            <ListItemIcon>
              <TuneIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText>Change tracking mode</ListItemText>
          </MenuItem>
        )}
        {contract.laborTrackingMode === "headcount" && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setEditRatesOpen(true);
            }}
          >
            <ListItemIcon>
              <RatesIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit role rates</ListItemText>
          </MenuItem>
        )}
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
          {/* Reconciliation strip — quoted vs paid breakdown */}
          <ReconciliationStrip
            reconciliation={reconciliation}
            laborTrackingMode={contract.laborTrackingMode}
            fallbackQuoted={contract.totalValue}
            extrasTotal={0}
          />

          {/* Worker estimate + over/under-paid monitor (Ship 2a) */}
          {!contract.isInHouse && (
            <Box
              sx={{
                p: 1.25,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <EstimateMonitorPanel
                subcontractId={contract.id}
                tradeCategoryId={contract.tradeCategoryId}
                agreedPrice={contract.totalValue ?? 0}
                laborTrackingMode={contract.laborTrackingMode}
                reconciliation={reconciliation}
                canEdit={canEdit}
              />
            </Box>
          )}

          {/* Tracking mode + role rates summary (management surface) */}
          <Box
            sx={{
              p: 1.25,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  Tracking mode
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {MODE_LABEL[contract.laborTrackingMode] ?? contract.laborTrackingMode}
                </Typography>
              </Box>
              {contract.laborTrackingMode !== "mesthri_only" && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<TuneIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChangeModeOpen(true);
                  }}
                >
                  Change mode
                </Button>
              )}
            </Stack>

            {contract.laborTrackingMode === "headcount" && (
              <>
                <Divider sx={{ my: 1 }} />
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" component="div">
                      Role rates
                    </Typography>
                    {headcount?.rates && headcount.rates.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {headcount.rates.map((r) => (
                          <Chip
                            key={r.roleId}
                            label={`${r.roleName} ₹${formatINR(r.dailyRate)}/day`}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        No roles seeded
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RatesIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditRatesOpen(true);
                    }}
                    sx={{ ml: 1 }}
                  >
                    Edit rates
                  </Button>
                </Stack>
              </>
            )}
          </Box>

          {/* Activity summary — read-only with shortcuts to entry pages */}
          <Box
            sx={{
              p: 1.25,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
              Activity
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label={`${activity?.attendanceDays ?? 0} attendance days`}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  goToAttendance();
                }}
                clickable
              />
              <Chip
                label={`${activity?.paymentDays ?? 0} payment days`}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPayments();
                }}
                clickable
              />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                size="small"
                variant="text"
                startIcon={<OpenInNewIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                  goToAttendance();
                }}
              >
                Record attendance
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<OpenInNewIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                  goToPayments();
                }}
              >
                Record payment
              </Button>
            </Stack>
          </Box>
        </Box>
      </Collapse>

      <ChangeTrackingModeDialog
        open={changeModeOpen}
        onClose={() => setChangeModeOpen(false)}
        contractId={contract.id}
        contractTitle={`${contract.title} · ${contractLabel(contract)}`}
        currentMode={contract.laborTrackingMode}
        tradeCategoryId={contract.tradeCategoryId ?? ""}
      />

      <EditRoleRatesDialog
        open={editRatesOpen}
        onClose={() => setEditRatesOpen(false)}
        contractId={contract.id}
        contractTitle={`${contract.title} · ${contractLabel(contract)}`}
      />
    </Box>
  );
}
