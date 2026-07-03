"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Handshake from "@mui/icons-material/Handshake";
import EastRounded from "@mui/icons-material/EastRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { sumScopeValues } from "@/types/scopeSheet.types";
import { useSubcontractScopeSheet } from "@/hooks/queries/useSubcontractScopeSheet";
import { useHandContractToCrew } from "@/hooks/queries/useHandContractToCrew";
import { useConvertTaskToPackage } from "@/hooks/queries/useTaskWorkPackages";
import {
  CrewPicker,
  emptyCrewSelection,
  type CrewSelection,
} from "@/components/trades/CrewPicker";

type HandoverResult =
  | { kind: "contract" }
  | { kind: "package"; packageId: string };

/**
 * "Hand to crew" — turns a Future plan (draft subcontract) into live work by
 * either activating it as a normal contract (crew + agreed amount) or converting
 * it to a fixed-price task-work package. Step 1 picks the shape; step 2 collects
 * the crew + the bargained amount (defaulted to the plan's Σ point values).
 */
export function HandToCrewDialog({
  open,
  onClose,
  siteId,
  task,
  onHandedOver,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  task: WorkspaceTask | null;
  onHandedOver: (r: HandoverResult) => void;
}) {
  const { data: items } = useSubcontractScopeSheet(
    open && task ? task.id : undefined
  );
  const plannedTotal = useMemo(() => {
    const sum = sumScopeValues(items ?? []);
    return sum > 0 ? sum : task?.quoted ?? 0;
  }, [items, task?.quoted]);

  const hand = useHandContractToCrew();
  const convert = useConvertTaskToPackage();

  const [route, setRoute] = useState<"choose" | "contract" | "package">("choose");
  const [crew, setCrew] = useState<CrewSelection>(emptyCrewSelection());
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset every open; seed the amount from the planned total once known.
  useEffect(() => {
    if (!open) return;
    setRoute("choose");
    setCrew(emptyCrewSelection());
    setStartDate("");
    setError(null);
  }, [open]);
  useEffect(() => {
    if (open) setAmount(plannedTotal > 0 ? String(plannedTotal) : "");
  }, [open, plannedTotal]);

  const saving = hand.isPending || convert.isPending;
  const amountNum = amount ? Number(amount) : 0;

  const crewChosen =
    (crew.contractType === "mesthri" && !!crew.teamId) ||
    (crew.contractType === "specialist" && !!crew.laborerId);

  const handleContract = async () => {
    if (!task) return;
    if (!crewChosen) {
      setError("Pick a crew to hand this plan to.");
      return;
    }
    setError(null);
    try {
      await hand.mutateAsync({
        subcontractId: task.id,
        siteId,
        contractType: crew.contractType,
        teamId: crew.teamId,
        laborerId: crew.laborerId,
        agreedValue: amountNum,
        startDate: startDate || null,
      });
      onHandedOver({ kind: "contract" });
    } catch (e) {
      setError((e as Error).message || "Couldn't hand this plan to the crew.");
    }
  };

  const handlePackage = async () => {
    if (!task) return;
    if (crew.contractType !== "specialist" || !crew.laborerId) {
      setError("Pick the maistry who takes this package.");
      return;
    }
    setError(null);
    try {
      const packageId = await convert.mutateAsync({
        subcontractId: task.id,
        siteId,
        maistryLaborerId: crew.laborerId,
        status: "active",
        totalValue: amountNum,
      });
      onHandedOver({ kind: "package", packageId });
    } catch (e) {
      setError((e as Error).message || "Couldn't convert this plan to a package.");
    }
  };

  const amountField = (
    <TextField
      label="Agreed amount"
      value={amount}
      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
      fullWidth
      InputProps={{
        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
      }}
      helperText={
        plannedTotal > 0
          ? `Points add up to ₹${plannedTotal.toLocaleString("en-IN")} — adjust if you negotiated.`
          : "Set the agreed price for this work."
      }
    />
  );

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Handshake fontSize="small" color="primary" />
          <span>Hand to crew</span>
        </Stack>
        {task && (
          <Typography variant="caption" color="text.secondary" component="div">
            {task.title}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {route === "choose" && (
          <Stack spacing={1.25}>
            <Typography variant="body2" color="text.secondary">
              How will this crew run the work?
            </Typography>

            <ChoiceCard
              icon={<GroupsRounded fontSize="small" color="primary" />}
              title="Normal contract"
              desc="Track daily attendance & salary, or record fixed-price payments against the agreed amount."
              onClick={() => {
                setError(null);
                setRoute("contract");
              }}
            />
            <ChoiceCard
              icon={<ReceiptLongRounded fontSize="small" color="primary" />}
              title="Fixed-price package"
              badge="Like Barun's"
              desc="Hand it to one maistry at a fixed price and track the Day Log, extras & payments in one place."
              onClick={() => {
                setError(null);
                // Packages carry a maistry (specialist) — default the picker to it.
                setCrew({ contractType: "specialist", teamId: null, laborerId: null });
                setRoute("package");
              }}
            />
          </Stack>
        )}

        {route === "contract" && (
          <Stack spacing={2.25}>
            <BackLink onClick={() => setRoute("choose")} />
            <CrewPicker
              value={crew}
              onChange={setCrew}
              tradeCategoryId={task?.tradeCategoryId ?? ""}
              tradeName={task?.tradeName ?? "work"}
              required
              onError={setError}
            />
            {amountField}
            <TextField
              label="Start date (optional)"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        )}

        {route === "package" && (
          <Stack spacing={2.25}>
            <BackLink onClick={() => setRoute("choose")} />
            <Typography variant="caption" color="text.secondary">
              Pick the maistry who takes the whole job. The plan&apos;s points and photos
              are kept on the package for reference; day-logs &amp; payments track against
              the agreed amount.
            </Typography>
            <CrewPicker
              value={crew}
              onChange={setCrew}
              tradeCategoryId={task?.tradeCategoryId ?? ""}
              tradeName={task?.tradeName ?? "work"}
              required
              onError={setError}
            />
            {amountField}
          </Stack>
        )}

        {error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        {route === "contract" && (
          <Button
            onClick={handleContract}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : <Handshake />}
          >
            {saving ? "Handing over…" : "Hand to crew"}
          </Button>
        )}
        {route === "package" && (
          <Button
            onClick={handlePackage}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : <Handshake />}
          >
            {saving ? "Converting…" : "Create package"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function ChoiceCard({
  icon,
  title,
  desc,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        display: "flex",
        gap: 1.25,
        p: 1.5,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        transition: "border-color .12s, background-color .12s",
        outline: "none",
        "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
        "&:focus-visible": { borderColor: "primary.main" },
      }}
    >
      <Box sx={{ pt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
          <Typography variant="body2" fontWeight={700}>
            {title}
          </Typography>
          {badge && (
            <Box
              component="span"
              sx={{
                fontSize: 10,
                fontWeight: 800,
                px: 0.7,
                py: 0.1,
                borderRadius: 999,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </Box>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
          {desc}
        </Typography>
      </Box>
      <EastRounded fontSize="small" color="action" sx={{ alignSelf: "center", flexShrink: 0 }} />
    </Box>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      size="small"
      startIcon={<ArrowBackRounded fontSize="small" />}
      sx={{ alignSelf: "flex-start", textTransform: "none", ml: -0.5 }}
    >
      Back
    </Button>
  );
}
