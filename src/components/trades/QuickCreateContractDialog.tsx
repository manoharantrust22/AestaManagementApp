"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  FormControlLabel,
  FormLabel,
  Switch,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ContractTier } from "@/lib/workforce/workspaceModel";
import { CrewPicker, emptyCrewSelection, type CrewSelection } from "./CrewPicker";

interface QuickCreateContractDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contractId: string) => void;
  siteId: string;
  tradeCategoryId: string;
  tradeName: string;
  /** When set, the new row nests under this Contract/Section. Null = a top-level Contract. */
  parentSubcontractId?: string | null;
  /** Which tier we're creating — drives the copy, defaults, and the parent link. */
  tier?: ContractTier;
  /** Initial lifecycle status. "draft" lands the contract in the Future (planning) tab. */
  initialStatus?: "draft" | "active";
}

export function QuickCreateContractDialog({
  open,
  onClose,
  onCreated,
  siteId,
  tradeCategoryId,
  tradeName,
  parentSubcontractId = null,
  tier = "contract",
  initialStatus = "active",
}: QuickCreateContractDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Tier-aware copy so the dialog reads as "Add a section / task" vs "New contract".
  // A top-level contract opened from the Future tab reads as planning instead.
  const tierCopy =
    tier === "contract" && initialStatus === "draft"
      ? {
          title: `Plan future ${tradeName} work`,
          sub: "List the left-out works with photos and values after creating — hand it to a crew later.",
          titleLabel: "Plan title",
          titleHelper: `e.g. "Left-out works — Ground floor"`,
          submit: "Create plan",
        }
      : {
          contract: {
            title: `New ${tradeName} contract`,
            sub: `The whole ${tradeName} deal with one contractor. Add sections (floors / scopes) under it next.`,
            titleLabel: "Contract title",
            titleHelper: `e.g. "Civil — Jithin"`,
            submit: "Create contract",
          },
          section: {
            title: "Add a section",
            sub: "A floor or scope (usually priced by square feet) that holds the task works under it.",
            titleLabel: "Section name",
            titleHelper: `e.g. "Ground Floor" or "External plastering — all floors"`,
            submit: "Add section",
          },
          task: {
            title: "Add a task",
            sub: "A single job you hand a labourer at a cost, inside this section.",
            titleLabel: "Task name",
            titleHelper: `e.g. "Footing grid"`,
            submit: "Add task",
          },
        }[tier];

  const [crew, setCrew] = useState<CrewSelection>(emptyCrewSelection());
  const [title, setTitle] = useState("");
  const [totalValue, setTotalValue] = useState<string>("");
  // Area-based pricing: when on, total = area × rate and we store sqft + rate so the
  // app can later reconcile actual sqft. Sections default to sqft (the common case).
  const [pricedBySqft, setPricedBySqft] = useState(tier === "section");
  const [sqft, setSqft] = useState<string>("");
  const [ratePerSqft, setRatePerSqft] = useState<string>("");
  const [status, setStatus] = useState<"draft" | "active">(initialStatus);
  // When on, company laborers on this contract are paid directly (net of the per-day
  // mesthri commission) once daily attendance is tracked; the mesthri collects the cut.
  const [commissionOn, setCommissionOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A Future plan can be created without a crew — it's picked at handover.
  const crewRequired = status === "active";

  // Reset state every time dialog opens
  useEffect(() => {
    if (!open) return;
    setCrew(emptyCrewSelection());
    setTitle("");
    setTotalValue("");
    setPricedBySqft(tier === "section");
    setSqft("");
    setRatePerSqft("");
    setStatus(initialStatus);
    setCommissionOn(false);
    setError(null);
  }, [open, tier, initialStatus]);

  // Area-based pricing math (₹ total = area × rate). Lump-sum uses `totalValue`.
  const sqftNum = sqft ? Number(sqft) : 0;
  const rateNum = ratePerSqft ? Number(ratePerSqft) : 0;
  const sqftTotal = sqftNum > 0 && rateNum > 0 ? sqftNum * rateNum : 0;

  // Default the title to a sensible auto-fill once a team or laborer is picked.
  // Only for a top-level Contract — Sections/Tasks want a floor / job name, typed.
  const handleCrewChange = (v: CrewSelection, meta?: { displayName?: string }) => {
    setCrew(v);
    if (tier === "contract" && !title && meta?.displayName) {
      setTitle(`${tradeName} — ${meta.displayName}`);
    }
  };

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!title.trim()) return false;
    if (crewRequired && crew.contractType === "mesthri" && !crew.teamId) return false;
    if (crewRequired && crew.contractType === "specialist" && !crew.laborerId) return false;
    return true;
  }, [submitting, title, crewRequired, crew]);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // One parent contract per trade: block a second top-level contract for this
      // site+trade (defense-in-depth — the tree steers to "Add a section" already).
      if (tier === "contract" && !parentSubcontractId) {
        const sbCheck = supabase as any;
        const { data: existing, error: existErr } = await sbCheck
          .from("subcontracts")
          .select("id")
          .eq("site_id", siteId)
          .eq("trade_category_id", tradeCategoryId)
          .is("parent_subcontract_id", null)
          .neq("status", "cancelled")
          .limit(1);
        if (existErr) throw existErr;
        if (existing && existing.length > 0) {
          throw new Error(
            `${tradeName} already has a contract. Add a section under it instead of a second contract.`
          );
        }
      }

      // Money basis depends on the pricing toggle.
      const pricing: Record<string, unknown> = pricedBySqft
        ? {
            total_value: sqftTotal,
            is_rate_based: true,
            measurement_unit: "sqft",
            total_units: sqftNum || null,
            rate_per_unit: rateNum || null,
          }
        : (() => {
            const totalValueNum = totalValue ? Number(totalValue) : 0;
            if (Number.isNaN(totalValueNum) || totalValueNum < 0) {
              throw new Error("Quoted total must be a positive number");
            }
            return { total_value: totalValueNum, is_rate_based: false };
          })();

      const payload: Record<string, unknown> = {
        site_id: siteId,
        trade_category_id: tradeCategoryId,
        // Nest under the chosen Contract/Section (null = a top-level Contract). This is
        // what makes the new row land in the right place instead of "Ungrouped".
        parent_subcontract_id: parentSubcontractId ?? null,
        contract_type: crew.contractType,
        title: title.trim(),
        // Always payments-only. Daily labour is logged on /site/attendance
        // (package assignment), never per-section here.
        labor_tracking_mode: "mesthri_only",
        is_in_house: false,
        status,
        mesthri_commission_enabled: commissionOn,
        // Start commission from today (contract start). A brand-new contract has no
        // prior work; if days are backdated later, the edit dialog warns + lets you
        // move this date earlier.
        mesthri_commission_effective_from: commissionOn
          ? dayjs().format("YYYY-MM-DD")
          : null,
        ...pricing,
      };
      // Crew is optional on a draft (Future plan) — attach only when picked.
      if (crew.contractType === "mesthri" && crew.teamId) {
        payload.team_id = crew.teamId;
      } else if (crew.contractType === "specialist" && crew.laborerId) {
        payload.laborer_id = crew.laborerId;
      }

      // Cast to any once — the Supabase types haven't been regenerated for the
      // new schema yet (waiting on a separate fix for src/types/database.types.ts).
      const sb = supabase as any;
      const insertRes = await sb
        .from("subcontracts")
        .insert(payload)
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;
      const newId: string = insertRes.data.id;

      // Invalidate React Query caches and broadcast to other tabs/pages
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-activity", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["subcontracts", "site", siteId],
        }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }

      onCreated(newId);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {tierCopy.title}
        <Typography variant="caption" color="text.secondary" component="div">
          {tierCopy.sub}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Money-only record: payments are logged here (quoted vs paid);
              daily labour is always logged on /site/attendance. */}
          <Typography variant="caption" color="text.secondary">
            Payments are recorded here (quoted vs paid). Daily labour is logged on the{" "}
            <strong>Attendance</strong> page.
          </Typography>

          <CrewPicker
            value={crew}
            onChange={handleCrewChange}
            tradeCategoryId={tradeCategoryId}
            tradeName={tradeName}
            required={crewRequired}
            helperText={
              crewRequired ? undefined : "Optional for a plan — pick the crew at handover"
            }
            onError={setError}
          />

          <TextField
            label={tierCopy.titleLabel}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            fullWidth
            helperText={tierCopy.titleHelper}
          />

          <FormControl>
            <FormLabel>Pricing</FormLabel>
            <ToggleButtonGroup
              value={pricedBySqft ? "sqft" : "lump"}
              exclusive
              onChange={(_, v) => v && setPricedBySqft(v === "sqft")}
              size="small"
              sx={{ mt: 1 }}
            >
              <ToggleButton value="lump">Lump sum</ToggleButton>
              <ToggleButton value="sqft">By area (sq ft)</ToggleButton>
            </ToggleButtonGroup>
          </FormControl>

          {pricedBySqft ? (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
              <TextField
                label="Total area"
                value={sqft}
                onChange={(e) => setSqft(e.target.value.replace(/[^0-9.]/g, ""))}
                fullWidth
                InputProps={{
                  endAdornment: <InputAdornment position="end">sq ft</InputAdornment>,
                }}
                helperText="Built-up area for this building / scope."
              />
              <TextField
                label="Rate"
                value={ratePerSqft}
                onChange={(e) => setRatePerSqft(e.target.value.replace(/[^0-9.]/g, ""))}
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  endAdornment: <InputAdornment position="end">/sq ft</InputAdornment>,
                }}
                helperText={
                  sqftTotal > 0
                    ? `= ₹${sqftTotal.toLocaleString("en-IN")}`
                    : "Agreed rate per sq ft."
                }
              />
            </Stack>
          ) : (
            <TextField
              label="Quoted total (lump sum)"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value.replace(/[^0-9.]/g, ""))}
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
              helperText={
                status === "draft"
                  ? "Leave 0 — a plan's value comes from its points (Scope & photos)."
                  : "Leave 0 if no fixed quote yet (e.g. daily-rate only)."
              }
            />
          )}

          <FormControl>
            <FormLabel>Start as</FormLabel>
            <ToggleButtonGroup
              value={status}
              exclusive
              onChange={(_, v) => v && setStatus(v)}
              size="small"
              sx={{ mt: 1 }}
            >
              <ToggleButton value="active">Active (work starting)</ToggleButton>
              <ToggleButton value="draft">Planned (Future)</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              {status === "draft"
                ? "Saved under the Future tab — hand it to a crew when work begins."
                : "Shows in the Active workspace right away."}
            </Typography>
          </FormControl>

          <FormControlLabel
            sx={{ alignItems: "flex-start", m: 0 }}
            control={
              <Switch checked={commissionOn} onChange={(e) => setCommissionOn(e.target.checked)} />
            }
            label={
              <Box component="span" sx={{ display: "block", pt: 0.75 }}>
                <Typography variant="body2" fontWeight={700}>
                  Pay each laborer directly
                </Typography>
                <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
                  ON — you pay each company laborer their net wages from the crew ledger (net of a
                  per-day ₹50 commission per laborer); the mesthri gets his commission + own wages
                  separately. OFF — you pay the mesthri a lump and he distributes to the crew.
                </Typography>
              </Box>
            }
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          {submitting ? "Saving…" : tierCopy.submit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
