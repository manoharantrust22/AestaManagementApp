"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Chip,
  IconButton,
  useTheme,
  useMediaQuery,
  Paper,
  alpha,
  Grid,
} from "@mui/material";
import {
  Close as CloseIcon,
  Visibility as ViewIcon,
  CurrencyRupee,
  CalendarToday,
  Person,
  Category,
  Store,
  Payment,
  Description,
  Notes,
  Image as ImageIcon,
  CheckCircle,
  HourglassEmpty,
  Cancel as CancelIcon,
  AccountBalanceWallet,
  Link as LinkIcon,
} from "@mui/icons-material";
import PayerSourceChip from "@/components/settlement/PayerSourceChip";
import type { MiscExpenseWithDetails } from "@/types/misc-expense.types";
import dayjs from "dayjs";

interface MiscExpenseViewDialogProps {
  open: boolean;
  onClose: () => void;
  expense: MiscExpenseWithDetails | null;
}

export default function MiscExpenseViewDialog({
  open,
  onClose,
  expense,
}: MiscExpenseViewDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (!expense) return null;

  const paymentModeLabels: Record<string, string> = {
    cash: "Cash",
    upi: "UPI",
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
  };

  const openProofImage = () => {
    if (expense.proof_url) {
      window.open(expense.proof_url, "_blank");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ViewIcon color="primary" />
          <Typography variant="h6" component="span" fontWeight={600}>
            Expense Details
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {/* Reference & Status Header */}
        <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Chip
            label={expense.reference_number}
            size="small"
            color="info"
            variant="outlined"
            sx={{ fontWeight: 600, fontSize: "0.8rem" }}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            {expense.is_cancelled ? (
              <Chip
                icon={<CancelIcon />}
                label="Cancelled"
                color="error"
                size="small"
              />
            ) : expense.is_cleared ? (
              <Chip
                icon={<CheckCircle />}
                label="Cleared"
                color="success"
                size="small"
              />
            ) : (
              <Chip
                icon={<HourglassEmpty />}
                label="Pending"
                color="warning"
                size="small"
              />
            )}
          </Box>
        </Box>

        {/* Amount Summary */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 3,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">
              Amount
            </Typography>
            <Chip
              icon={<CurrencyRupee sx={{ fontSize: 16 }} />}
              label={expense.amount?.toLocaleString("en-IN") || "0"}
              color="primary"
              size="medium"
              sx={{ fontWeight: 700, fontSize: "1.1rem" }}
            />
          </Box>
        </Paper>

        {/* Expense Details Grid */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Date */}
          <Grid size={{ xs: 6 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <CalendarToday sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Date
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={500}>
              {dayjs(expense.date).format("DD MMM YYYY")}
            </Typography>
          </Grid>

          {/* Category */}
          <Grid size={{ xs: 6 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Category sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Category
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={500}>
              {expense.category_name || "-"}
            </Typography>
          </Grid>

          {/* Vendor */}
          <Grid size={{ xs: 6 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Store sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Vendor/Recipient
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={500}>
              {expense.vendor_name || "-"}
            </Typography>
          </Grid>

          {/* Payment Mode */}
          <Grid size={{ xs: 6 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Payment sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Payment Mode
              </Typography>
            </Box>
            <Chip
              label={paymentModeLabels[expense.payment_mode || ""] || expense.payment_mode || "-"}
              size="small"
              variant="outlined"
            />
          </Grid>
        </Grid>

        {/* Payer Information */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AccountBalanceWallet fontSize="small" />
            Payment Source
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Payer Type
              </Typography>
              <Chip
                label={expense.payer_type === "site_engineer" ? "Via Site Engineer" : "Company Direct"}
                size="small"
                color={expense.payer_type === "site_engineer" ? "secondary" : "primary"}
                variant="outlined"
              />
            </Box>

            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Payer Source
              </Typography>
              <PayerSourceChip
                row={{
                  payer_source: expense.payer_source,
                  payer_name: expense.payer_name,
                  payer_source_split: expense.payer_source_split ?? null,
                }}
                size="small"
              />
            </Box>

            {expense.payer_type === "site_engineer" && expense.site_engineer_name && (
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Site Engineer
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Person sx={{ fontSize: 16 }} />
                  <Typography variant="body2" fontWeight={500}>
                    {expense.site_engineer_name}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Subcontract Link */}
        {expense.subcontract_title && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <LinkIcon fontSize="small" />
              Linked Subcontract
            </Typography>
            <Chip
              label={expense.subcontract_title}
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ mt: 0.5 }}
            />
          </Paper>
        )}

        {/* Description */}
        {expense.description && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Description fontSize="small" />
              Description
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {expense.description}
            </Typography>
          </Paper>
        )}

        {/* Notes */}
        {expense.notes && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Notes fontSize="small" />
              Notes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {expense.notes}
            </Typography>
          </Paper>
        )}

        {/* Payment Proof */}
        {expense.proof_url && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ImageIcon fontSize="small" />
              Payment Proof
            </Typography>
            <Button
              variant="outlined"
              startIcon={<ImageIcon />}
              onClick={openProofImage}
              size="small"
              sx={{ mt: 0.5 }}
            >
              View Screenshot
            </Button>
          </Paper>
        )}

        {/* Cancellation Info */}
        {expense.is_cancelled && expense.cancellation_reason && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              bgcolor: alpha(theme.palette.error.main, 0.05),
              borderColor: theme.palette.error.main,
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} gutterBottom color="error" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CancelIcon fontSize="small" />
              Cancellation Reason
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {expense.cancellation_reason}
            </Typography>
            {expense.cancelled_at && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Cancelled on: {dayjs(expense.cancelled_at).format("DD MMM YYYY, hh:mm A")}
              </Typography>
            )}
          </Paper>
        )}

        {/* Created Info */}
        <Box sx={{ mt: 2, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="caption" color="text.secondary">
            Created on {dayjs(expense.created_at).format("DD MMM YYYY, hh:mm A")}
            {expense.created_by_name && ` by ${expense.created_by_name}`}
          </Typography>
        </Box>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
