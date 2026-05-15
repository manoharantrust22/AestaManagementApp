"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  RadioGroup,
  Radio,
  FormControlLabel,
  Alert,
  CircularProgress,
} from "@mui/material";
import { SwapHoriz as SwapIcon } from "@mui/icons-material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";

export type ChangePayerEntityType = "request" | "po" | "expense";

export interface ChangePayerDialogProps {
  open: boolean;
  onClose: () => void;
  entityType: ChangePayerEntityType;
  entityId: string;
  entityLabel: string; // e.g., "MR-1234" or "PO-2025-001"
  currentSiteId: string;
  groupSites: Array<{ id: string; name: string }>;
  /** Only relevant for entityType='expense' — when true, allow force re-attribution of settled rows. */
  alreadySettled?: boolean;
}

const RPC_BY_TYPE: Record<ChangePayerEntityType, string> = {
  request: "change_request_payer",
  po: "change_po_payer",
  expense: "change_expense_payer",
};

const PARAM_NAME_BY_TYPE: Record<ChangePayerEntityType, string> = {
  request: "p_request_id",
  po: "p_po_id",
  expense: "p_expense_id",
};

const NEW_SITE_PARAM_BY_TYPE: Record<ChangePayerEntityType, string> = {
  request: "p_new_site_id",
  po: "p_new_site_id",
  expense: "p_new_paying_site_id",
};

export default function ChangePayerDialog({
  open,
  onClose,
  entityType,
  entityId,
  entityLabel,
  currentSiteId,
  groupSites,
  alreadySettled,
}: ChangePayerDialogProps) {
  const supabase = createClient() as any;
  const queryClient = useQueryClient();
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [forceConfirmed, setForceConfirmed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (newSiteId: string) => {
      const args: Record<string, unknown> = {
        [PARAM_NAME_BY_TYPE[entityType]]: entityId,
        [NEW_SITE_PARAM_BY_TYPE[entityType]]: newSiteId,
      };
      if (entityType === "expense" && alreadySettled) {
        args.p_force = true;
      }
      const { data, error } = await supabase.rpc(RPC_BY_TYPE[entityType], args);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all the lists that may reflect this change
      queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["inter-site-settlements"] });
      handleClose();
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Failed to change payer");
    },
  });

  const handleClose = () => {
    setSelectedSiteId("");
    setForceConfirmed(false);
    setErrorMsg(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!selectedSiteId) return;
    setErrorMsg(null);
    mutation.mutate(selectedSiteId);
  };

  const otherSites = groupSites.filter((s) => s.id !== currentSiteId);
  const requiresForceConfirm = entityType === "expense" && alreadySettled;
  const submitDisabled =
    !selectedSiteId || mutation.isPending || (requiresForceConfirm && !forceConfirmed);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <SwapIcon color="primary" />
        Change Payer · {entityLabel}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Move this {entityType === "po" ? "purchase order" : entityType === "expense" ? "expense" : "request"} to another site in the same group.
        </Typography>

        {otherSites.length === 0 ? (
          <Alert severity="info">No other sites in this group.</Alert>
        ) : (
          <RadioGroup
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
          >
            {otherSites.map((s) => (
              <FormControlLabel
                key={s.id}
                value={s.id}
                control={<Radio />}
                label={s.name}
              />
            ))}
          </RadioGroup>
        )}

        {requiresForceConfirm && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              This expense has already been settled.
            </Typography>
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Re-attributing it will affect inter-site balances. The existing settlement reference will be kept, but downstream reconciliation may need manual review.
            </Typography>
            <FormControlLabel
              sx={{ mt: 1 }}
              control={
                <Radio
                  checked={forceConfirmed}
                  onClick={() => setForceConfirmed((v) => !v)}
                />
              }
              label={
                <Typography variant="body2">I understand — proceed anyway</Typography>
              }
            />
          </Alert>
        )}

        {errorMsg && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMsg}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={submitDisabled}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <SwapIcon />}
        >
          {mutation.isPending ? "Switching..." : "Change Payer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
