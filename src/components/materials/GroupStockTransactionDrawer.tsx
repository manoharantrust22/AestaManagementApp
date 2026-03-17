"use client";

import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Grid,
  Paper,
} from "@mui/material";
import {
  Close as CloseIcon,
  ShoppingCart as PurchaseIcon,
  LocalShipping as UsageIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { GroupStockTransaction } from "@/hooks/queries/useInterSiteSettlements";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface GroupStockTransactionDrawerProps {
  open: boolean;
  onClose: () => void;
  transaction: GroupStockTransaction | null;
}

export default function GroupStockTransactionDrawer({
  open,
  onClose,
  transaction,
}: GroupStockTransactionDrawerProps) {
  const isMobile = useIsMobile();

  if (!transaction) return null;

  const isPurchase = transaction.transaction_type === "purchase";
  const typeLabel = transaction.transaction_type.charAt(0).toUpperCase() + transaction.transaction_type.slice(1);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: "450px", md: "500px" },
          maxWidth: 500,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box>
          <Typography variant="h6">Transaction Details</Typography>
          <Chip
            icon={isPurchase ? <PurchaseIcon /> : <UsageIcon />}
            label={typeLabel}
            size="small"
            color={isPurchase ? "success" : "warning"}
            variant="outlined"
            sx={{ mt: 0.5 }}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
        {/* Material Info */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
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
          {transaction.material?.code && (
            <Typography variant="caption" color="text.disabled">
              Code: {transaction.material.code}
            </Typography>
          )}
        </Paper>

        {/* Transaction Details */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Date
            </Typography>
            <Typography variant="body2">
              {formatDate(transaction.transaction_date)}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Quantity
            </Typography>
            <Typography
              variant="body2"
              fontWeight={500}
              color={transaction.quantity > 0 ? "success.main" : "error.main"}
            >
              {transaction.quantity > 0 ? "+" : ""}
              {transaction.quantity} {transaction.material?.unit || ""}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Unit Cost
            </Typography>
            <Typography variant="body2">
              {formatCurrency(transaction.unit_cost || 0)}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Total Cost
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {formatCurrency(Math.abs(transaction.total_cost || 0))}
            </Typography>
          </Grid>
        </Grid>

        {/* Site Info */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          {isPurchase && transaction.payment_source_site && (
            <>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Paid By
              </Typography>
              <Chip
                label={transaction.payment_source_site.name}
                color="success"
                variant="outlined"
              />
            </>
          )}
          {!isPurchase && transaction.usage_site && (
            <>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Used By
              </Typography>
              <Chip
                label={transaction.usage_site.name}
                color="warning"
                variant="outlined"
              />
            </>
          )}
        </Paper>

        {/* Additional Details */}
        <Grid container spacing={2}>
          {transaction.notes && (
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Notes
              </Typography>
              <Typography variant="body2">
                {transaction.notes}
              </Typography>
            </Grid>
          )}
          {transaction.reference_type && (
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                Reference Type
              </Typography>
              <Typography variant="body2">
                {transaction.reference_type}
              </Typography>
            </Grid>
          )}
          {transaction.reference_id && (
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                Reference ID
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                {transaction.reference_id}
              </Typography>
            </Grid>
          )}
          <Grid size={12}>
            <Typography variant="caption" color="text.secondary">
              Created At
            </Typography>
            <Typography variant="body2">
              {formatDate(transaction.created_at)}
            </Typography>
          </Grid>
        </Grid>
      </Box>
    </Drawer>
  );
}
