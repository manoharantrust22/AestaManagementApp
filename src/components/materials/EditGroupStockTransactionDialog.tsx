"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  Chip,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  ShoppingCart as PurchaseIcon,
  LocalShipping as UsageIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUpdateGroupStockTransaction } from "@/hooks/queries/useSiteGroups";
import type { GroupStockTransaction } from "@/hooks/queries/useInterSiteSettlements";
import { formatCurrency } from "@/lib/formatters";

interface EditGroupStockTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  transaction: GroupStockTransaction | null;
  groupId: string | undefined;
}

export default function EditGroupStockTransactionDialog({
  open,
  onClose,
  transaction,
  groupId,
}: EditGroupStockTransactionDialogProps) {
  const isMobile = useIsMobile();
  const updateTransaction = useUpdateGroupStockTransaction();

  const [error, setError] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");

  // Reset form when transaction changes
  useEffect(() => {
    if (transaction) {
      setTransactionDate(transaction.transaction_date);
      setQuantity(Math.abs(transaction.quantity).toString());
      setUnitCost((transaction.unit_cost || 0).toString());
      setNotes(transaction.notes || "");
      setError("");
    }
  }, [transaction]);

  const handleClose = () => {
    setError("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!transaction || !groupId) return;

    const qty = parseFloat(quantity);
    const cost = parseFloat(unitCost);

    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    if (isNaN(cost) || cost < 0) {
      setError("Please enter a valid unit cost");
      return;
    }

    try {
      await updateTransaction.mutateAsync({
        transactionId: transaction.id,
        groupId,
        transactionDate,
        quantity: qty,
        unitCost: cost,
        notes: notes.trim() || undefined,
      });
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to update transaction");
    }
  };

  if (!transaction) return null;

  const isPurchase = transaction.transaction_type === "purchase";
  const typeLabel = transaction.transaction_type.charAt(0).toUpperCase() + transaction.transaction_type.slice(1);
  const calculatedTotal = parseFloat(quantity || "0") * parseFloat(unitCost || "0");

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") handleClose(); }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6" component="span">Edit Transaction</Typography>
            <Chip
              icon={isPurchase ? <PurchaseIcon /> : <UsageIcon />}
              label={typeLabel}
              size="small"
              color={isPurchase ? "success" : "warning"}
              variant="outlined"
            />
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Material Info (read-only) */}
        <Box sx={{ mb: 3, p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Material
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {transaction.material?.name || "Unknown"}
          </Typography>
          {transaction.brand?.brand_name && (
            <Typography variant="body2" color="text.secondary">
              {transaction.brand.brand_name}
            </Typography>
          )}
        </Box>

        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField
              fullWidth
              label="Transaction Date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              label="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: transaction.material?.unit && (
                    <Typography variant="body2" color="text.secondary">
                      {transaction.material.unit}
                    </Typography>
                  ),
                },
                htmlInput: { min: 0, step: "any" }
              }}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              label="Unit Cost"
              type="number"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                      ₹
                    </Typography>
                  ),
                },
                htmlInput: { min: 0, step: "any" }
              }}
            />
          </Grid>

          <Grid size={12}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1, bgcolor: "primary.50", borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Total Cost
              </Typography>
              <Typography variant="h6" fontWeight={600} color="primary.main">
                {formatCurrency(calculatedTotal)}
              </Typography>
            </Box>
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={updateTransaction.isPending}
          startIcon={updateTransaction.isPending ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {updateTransaction.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
