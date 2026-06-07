"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  SelectChangeEvent,
} from "@mui/material";
import {
  Link as LinkIcon,
  LinkOff as UnlinkIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import type { SubcontractOption } from "@/types/payment.types";
import { supabaseQueryWithTimeout } from "@/lib/utils/supabaseQuery";

interface SubcontractLinkSelectorProps {
  selectedSubcontractId: string | null;
  onSelect: (subcontractId: string | null) => void;
  paymentAmount?: number; // To show balance after this payment
  disabled?: boolean;
  showBalanceAfterPayment?: boolean;
  /** When true, auto-selects a sensible default subcontract (the active one with the largest
   *  outstanding balance) ONCE after options load, if nothing is selected yet. The user can
   *  still change it or unlink. Used at settlement creation so payments link to a subcontract
   *  by default instead of silently becoming unlinked site expenses. */
  autoSelectDefault?: boolean;
}

export default function SubcontractLinkSelector({
  selectedSubcontractId,
  onSelect,
  paymentAmount = 0,
  disabled = false,
  showBalanceAfterPayment = true,
  autoSelectDefault = false,
}: SubcontractLinkSelectorProps) {
  const { selectedSite } = useSite();
  const supabase = createClient();

  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  // Ensures the default subcontract is auto-selected at most once, so an explicit
  // user unlink is never immediately re-filled.
  const autoSelectedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch active subcontracts for the site
  const fetchSubcontracts = useCallback(async () => {
    if (!selectedSite?.id) return;

    setLoading(true);
    setError(null);

    try {
      // Run all queries in parallel: teams, subcontracts, and all payment data
      const [teamsResult, subcontractsResult] = await Promise.all([
        // Teams lookup (optional, non-critical)
        supabaseQueryWithTimeout(
          supabase.from("teams").select("id, name"),
          15000
        ),
        // Subcontracts for this site
        supabaseQueryWithTimeout(
          supabase
            .from("subcontracts")
            .select("id, title, total_value, status, team_id")
            .eq("site_id", selectedSite.id)
            .in("status", ["active", "on_hold"])
            .order("title"),
          30000
        ),
      ]);

      if (!isMountedRef.current) return;

      const teamsMap = new Map<string, string>();
      if (teamsResult.data) {
        teamsResult.data.forEach((t: any) => teamsMap.set(t.id, t.name));
      }

      if (subcontractsResult.error) throw subcontractsResult.error;
      const subcontractsData = subcontractsResult.data || [];

      if (subcontractsData.length === 0) {
        setSubcontracts([]);
        return;
      }

      // Get all subcontract IDs for bulk queries
      const scIds = subcontractsData.map((sc: any) => sc.id);

      // Fetch ALL payment data in 4 bulk parallel queries instead of N*4 sequential.
      // Material expenses linked to a subcontract count toward its spend, using
      // COALESCE(amount_paid, total_amount) to match the v_all_expenses basis.
      const [
        scPaymentsResult,
        laborPaymentsResult,
        expensesResult,
        materialResult,
      ] = await Promise.all([
          supabaseQueryWithTimeout(
            supabase
              .from("subcontract_payments")
              .select("contract_id, amount")
              .in("contract_id", scIds),
            30000
          ),
          supabaseQueryWithTimeout(
            supabase
              .from("labor_payments")
              .select("subcontract_id, amount")
              .in("subcontract_id", scIds),
            30000
          ),
          supabaseQueryWithTimeout(
            supabase
              .from("expenses")
              .select("contract_id, amount")
              .in("contract_id", scIds),
            30000
          ),
          supabaseQueryWithTimeout(
            supabase
              .from("material_purchase_expenses")
              .select("subcontract_id, amount_paid, total_amount")
              .in("subcontract_id", scIds)
              .eq("is_paid", true)
              // Mirror v_all_expenses' inclusion rule so this drill-down can't
              // diverge from the page headline: own_site always counts;
              // group_stock only once it carries a settlement_reference.
              .or("purchase_type.neq.group_stock,settlement_reference.not.is.null"),
            30000
          ),
        ]);

      if (!isMountedRef.current) return;

      // Build payment totals per subcontract from bulk data
      const scPaymentTotals = new Map<string, number>();
      const laborPaymentTotals = new Map<string, number>();
      const expenseTotals = new Map<string, number>();
      const materialTotals = new Map<string, number>();

      (scPaymentsResult.data || []).forEach((p: any) => {
        const current = scPaymentTotals.get(p.contract_id) || 0;
        scPaymentTotals.set(p.contract_id, current + (p.amount || 0));
      });

      (laborPaymentsResult.data || []).forEach((p: any) => {
        const current = laborPaymentTotals.get(p.subcontract_id) || 0;
        laborPaymentTotals.set(p.subcontract_id, current + (p.amount || 0));
      });

      (materialResult.data || []).forEach((m: any) => {
        if (!m.subcontract_id) return;
        const current = materialTotals.get(m.subcontract_id) || 0;
        materialTotals.set(
          m.subcontract_id,
          current + (Number(m.amount_paid ?? m.total_amount) || 0)
        );
      });

      (expensesResult.data || []).forEach((e: any) => {
        const current = expenseTotals.get(e.contract_id) || 0;
        expenseTotals.set(e.contract_id, current + (e.amount || 0));
      });

      // Build final subcontract options
      const subcontractsWithPayments: SubcontractOption[] = subcontractsData.map(
        (sc: any) => {
          const totalPaid =
            (scPaymentTotals.get(sc.id) || 0) +
            (laborPaymentTotals.get(sc.id) || 0) +
            (expenseTotals.get(sc.id) || 0) +
            (materialTotals.get(sc.id) || 0);

          return {
            id: sc.id,
            title: sc.title,
            totalValue: sc.total_value || 0,
            totalPaid,
            balanceDue: (sc.total_value || 0) - totalPaid,
            status: sc.status,
            teamName: sc.team_id ? teamsMap.get(sc.team_id) : undefined,
          };
        }
      );

      if (!isMountedRef.current) return;
      setSubcontracts(subcontractsWithPayments);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Error fetching subcontracts:", err);
      setError("Failed to load subcontracts. Tap to retry.");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [selectedSite?.id, supabase]);

  // Fetch on mount and when site changes
  useEffect(() => {
    fetchSubcontracts();
  }, [fetchSubcontracts]);

  // Default-link at settlement creation: once options load, if the caller opted in and
  // nothing is selected yet, pick the active subcontract with the largest outstanding
  // balance. Fires at most once (autoSelectedRef) so a deliberate unlink stays unlinked.
  useEffect(() => {
    if (
      autoSelectDefault &&
      !autoSelectedRef.current &&
      !loading &&
      !selectedSubcontractId &&
      subcontracts.length > 0
    ) {
      autoSelectedRef.current = true;
      const def = subcontracts.reduce(
        (best, sc) => (sc.balanceDue > best.balanceDue ? sc : best),
        subcontracts[0]
      );
      onSelect(def.id);
    }
  }, [autoSelectDefault, loading, selectedSubcontractId, subcontracts, onSelect]);

  const selectedSubcontract = subcontracts.find(
    (sc) => sc.id === selectedSubcontractId
  );

  const handleUnlink = () => {
    onSelect(null);
  };

  const handleChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onSelect(value || null);
    setDropdownOpen(false);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) {
      return `Rs.${(amount / 100000).toFixed(1)}L`;
    }
    return `Rs.${amount.toLocaleString()}`;
  };

  // Show loading state
  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Loading subcontracts...
        </Typography>
      </Box>
    );
  }

  // Show error state with retry
  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ py: 0.5, cursor: "pointer" }}
        onClick={fetchSubcontracts}
      >
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Selected Subcontract Display */}
      {selectedSubcontract ? (
        <Box
          sx={{
            p: 1.5,
            bgcolor: "action.hover",
            borderRadius: 1,
            mb: 1,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {selectedSubcontract.title}
              </Typography>
              {selectedSubcontract.teamName && (
                <Typography variant="caption" color="text.secondary">
                  Team: {selectedSubcontract.teamName}
                </Typography>
              )}
            </Box>
            <IconButton
              size="small"
              onClick={handleUnlink}
              disabled={disabled}
              title="Unlink from subcontract"
            >
              <UnlinkIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 2,
              mt: 1,
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                Contract
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {formatCurrency(selectedSubcontract.totalValue)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Paid
              </Typography>
              <Typography variant="body2" fontWeight={500} color="success.main">
                {formatCurrency(selectedSubcontract.totalPaid)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Balance
              </Typography>
              <Typography variant="body2" fontWeight={500} color="warning.main">
                {formatCurrency(selectedSubcontract.balanceDue)}
              </Typography>
            </Box>
          </Box>

          {/* Balance after this payment */}
          {showBalanceAfterPayment && paymentAmount > 0 && (
            <Alert severity="info" sx={{ mt: 1, py: 0.5 }}>
              <Typography variant="caption">
                Balance after this payment:{" "}
                <strong>
                  {formatCurrency(
                    selectedSubcontract.balanceDue - paymentAmount
                  )}
                </strong>
              </Typography>
            </Alert>
          )}
        </Box>
      ) : (
        /* Dropdown Select - Opens on click */
        <Box>
          {subcontracts.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No active subcontracts found for this site
            </Typography>
          ) : (
            <FormControl fullWidth size="small">
              <Select
                value={selectedSubcontractId || ""}
                onChange={handleChange}
                open={dropdownOpen}
                onOpen={() => setDropdownOpen(true)}
                onClose={() => setDropdownOpen(false)}
                disabled={disabled}
                displayEmpty
                renderValue={(selected) => {
                  if (!selected) {
                    return (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LinkIcon fontSize="small" color="action" />
                        <Typography color="text.secondary">
                          Link to Subcontract
                        </Typography>
                      </Box>
                    );
                  }
                  const sc = subcontracts.find((s) => s.id === selected);
                  return sc?.title || selected;
                }}
                sx={{
                  "& .MuiSelect-select": {
                    display: "flex",
                    alignItems: "center",
                  },
                }}
              >
                <MenuItem value="">
                  <em>None (Site Expense)</em>
                </MenuItem>
                {subcontracts.map((sc) => (
                  <MenuItem key={sc.id} value={sc.id}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        alignItems: "center",
                      }}
                    >
                      <Box>
                        <Typography variant="body2">{sc.title}</Typography>
                        {sc.teamName && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {sc.teamName}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        label={`Bal: ${formatCurrency(sc.balanceDue)}`}
                        size="small"
                        color={sc.balanceDue > 0 ? "warning" : "success"}
                        variant="outlined"
                      />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Info text when no subcontract linked */}
          {!selectedSubcontractId && subcontracts.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
              Payment will be recorded as site expense
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
