"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  FormLabel,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import Handshake from "@mui/icons-material/Handshake";
import EastRounded from "@mui/icons-material/EastRounded";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { LaborTrackingMode } from "@/types/trade.types";
import type { ContractTier } from "@/lib/workforce/workspaceModel";
import { TrackingModeChooser, type TrackingChoice } from "./TrackingModeChooser";
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
  /** Switch to creating a fixed-price package (retention / man-day profitability) instead. */
  onCreatePackage?: () => void;
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
  onCreatePackage,
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
  // "How will you handle this work?" — one of the three tracking modes.
  const [choice, setChoice] = useState<TrackingChoice>("mesthri_only");
  const laborTrackingMode: LaborTrackingMode = choice;
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
    setChoice("mesthri_only");
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
        labor_tracking_mode: laborTrackingMode,
        is_in_house: false,
        status,
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

      // Seed subcontract_role_rates for headcount mode using labor_roles defaults
      if (laborTrackingMode === "headcount") {
        const rolesRes = await sb
          .from("labor_roles")
          .select("id, default_daily_rate")
          .eq("category_id", tradeCategoryId)
          .eq("is_active", true);
        if (rolesRes.error) throw rolesRes.error;
        const rateRows = ((rolesRes.data ?? []) as Array<{
          id: string;
          default_daily_rate: number | string;
        }>).map((r) => ({
          subcontract_id: newId,
          role_id: r.id,
          daily_rate: Number(r.default_daily_rate ?? 0),
        }));
        if (rateRows.length > 0) {
          const seedRes = await sb
            .from("subcontract_role_rates")
            .insert(rateRows);
          if (seedRes.error) throw seedRes.error;
        }
      }

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
          {/* The primary decision first: how will you handle this work? */}
          <FormControl>
            <FormLabel sx={{ mb: 1 }}>How will you handle this work?</FormLabel>

            {/* Fixed-price package (Day Log) — a peer choice, promoted to the top
                so a lump-sum maistry job is as obvious as the daily-tracking modes.
                Selecting it hands off to the package setup (a separate table that
                carries the Day Log + Extras + Payments screen, "like Barun's"). */}
            {onCreatePackage && (
              <Box
                role="button"
                tabIndex={0}
                onClick={() => {
                  onCreatePackage();
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onCreatePackage();
                    onClose();
                  }
                }}
                sx={{
                  display: "flex",
                  gap: 1.25,
                  p: 1.25,
                  mb: 1,
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
                <Box sx={{ pt: 0.25 }}>
                  <Handshake fontSize="small" color="primary" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={700}>
                      Fixed-price job (maistry contract)
                    </Typography>
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
                      Like Barun&apos;s
                    </Box>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    <strong>Each day:</strong> Log the effort (worker types × count) to see labour value vs the agreed price.
                  </Typography>
                  <Box
                    sx={{
                      my: 0.5,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: "action.hover",
                      fontFamily: "monospace",
                      fontSize: 11.5,
                      color: "text.primary",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    Mason ×2 · Helper ×2   →  ₹3,600
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    <strong>The app tells you:</strong> Day Log, extras &amp; payments in one place — and whether you&apos;re ahead of or behind the price.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    <strong>Best for:</strong> A fixed lump-sum job you track by effort.
                  </Typography>
                </Box>
                <EastRounded fontSize="small" color="action" sx={{ alignSelf: "center", flexShrink: 0 }} />
              </Box>
            )}

            {/* The two daily-tracking modes (no daily entry / count-by-role).
                "Full workspace (attendance + salary)" lives on the TRADE, not here. */}
            <TrackingModeChooser value={choice} onChange={setChoice} allowDetailed={false} />
          </FormControl>

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
