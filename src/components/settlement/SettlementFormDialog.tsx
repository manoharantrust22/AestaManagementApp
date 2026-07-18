"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  IconButton,
  useTheme,
  useMediaQuery,
  Paper,
  alpha,
} from "@mui/material";
import {
  Close as CloseIcon,
  AccountBalanceWallet,
  CurrencyRupee,
  Person,
  CalendarToday,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import {
  getTransactionWithLaborers,
  submitSettlement,
  TransactionWithLaborers,
} from "@/lib/services/notificationService";
import { SettlementMode } from "@/types/settlement.types";
import dayjs from "dayjs";
import { useOptimisticMutation } from "@/hooks/mutations/useOptimisticMutation";
import { useQueryClient } from "@tanstack/react-query";

interface SettlementFormDialogProps {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  onSuccess?: () => void;
}

export default function SettlementFormDialog({
  open,
  onClose,
  transactionId,
  onSuccess,
}: SettlementFormDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transaction, setTransaction] =
    useState<TransactionWithLaborers | null>(null);

  // Form state
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("upi");
  const [proofFile, setProofFile] = useState<UploadedFile | null>(null);
  const [reason, setReason] = useState("");

  // Settlement mutation with optimistic updates
  const queryClient = useQueryClient();
  const settlementMutation = useOptimisticMutation<
    { error?: { message: string } },
    Error,
    {
      transactionId: string;
      settlementMode: SettlementMode;
      userId: string;
      userName: string;
      proofUrl?: string;
      reason?: string;
      siteName?: string;
    },
    unknown
  >({
    mutationFn: async (params) => {
      const result = await submitSettlement(
        supabase,
        params.transactionId,
        params.settlementMode,
        params.userId,
        params.userName,
        params.proofUrl,
        params.reason
      );

      // Transform error format to match mutation expectations
      if (result.error) {
        throw new Error(result.error.message);
      }

      return {} as any; // Success - return empty object
    },
    // Query keys that will be invalidated on success
    queryKey: ["transactions", selectedSite?.id],
    successMessage: "Settlement submitted successfully!",
    errorMessage: "Failed to submit settlement",
    onSuccess: () => {
      onSuccess?.();
      handleClose();
    },
    onError: (err) => {
      setError(err.message || "Failed to submit settlement");
    },
  });

  // Fetch transaction details on open
  useEffect(() => {
    let isMounted = true;

    const fetchTransaction = async () => {
      if (!transactionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error } = await getTransactionWithLaborers(
          supabase,
          transactionId
        );

        if (!isMounted) return;

        if (error) {
          console.error("Error fetching transaction:", error);
          setError(error.message || "Failed to load transaction details");
        } else {
          setTransaction(data);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Exception fetching transaction:", err);
        setError(err.message || "Failed to load transaction details");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (open && transactionId) {
      fetchTransaction();
    } else if (!open) {
      // Reset state when dialog closes
      setTransaction(null);
      setError(null);
      setLoading(true);
      setSettlementMode("upi");
      setProofFile(null);
      setReason("");
    }

    return () => {
      isMounted = false;
    };
  }, [open, transactionId, supabase]);

  const handleSubmit = async () => {
    // Guard against rapid double-clicks (React Query also handles this)
    if (settlementMutation.isPending) {
      console.warn('[SettlementFormDialog] Submission already in progress');
      return;
    }

    if (!transaction || !userProfile) return;

    // Validate
    if (settlementMode === "upi" && !proofFile) {
      setError("Please upload payment screenshot for UPI payment");
      return;
    }

    setError(null);

    // Submit via mutation - handles loading state, retries, errors automatically
    settlementMutation.mutate({
      transactionId,
      settlementMode,
      userId: userProfile.id,
      userName: userProfile.name || userProfile.email,
      proofUrl: proofFile?.url,
      reason: reason || undefined,
      siteName: selectedSite?.name,
    });
  };

  const handleClose = () => {
    setSettlementMode("upi");
    setProofFile(null);
    setReason("");
    setError(null);
    setTransaction(null);
    onClose();
  };

  const totalLaborerAmount =
    (transaction?.daily_attendance.reduce(
      (sum, da) => sum + da.daily_earnings,
      0
    ) || 0) +
    (transaction?.market_attendance.reduce((sum, ma) => sum + ma.total_cost, 0) ||
      0);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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
          <AccountBalanceWallet color="primary" />
          <Typography variant="h6" component="span" fontWeight={600}>
            Settle Payment
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {loading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 200,
            }}
          >
            <CircularProgress />
          </Box>
        ) : error && !transaction ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : transaction ? (
          <Box>
            {/* Transaction Summary */}
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
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Amount Received
                </Typography>
                <Chip
                  icon={<CurrencyRupee sx={{ fontSize: 16 }} />}
                  label={transaction.amount.toLocaleString("en-IN")}
                  color="primary"
                  size="medium"
                  sx={{ fontWeight: 700, fontSize: "1rem" }}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <CalendarToday sx={{ fontSize: 14, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(transaction.transaction_date).format("DD MMM YYYY")}
                  </Typography>
                </Box>
                {transaction.description && (
                  <Typography variant="caption" color="text.secondary">
                    {transaction.description}
                  </Typography>
                )}
              </Box>
            </Paper>

            {/* Laborer Details */}
            {(transaction.daily_attendance.length > 0 ||
              transaction.market_attendance.length > 0) && (
              <Box sx={{ mb: 3 }}>
                <Typography
                  variant="subtitle2"
                  fontWeight={600}
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Person fontSize="small" />
                  Laborers to Pay (
                  {transaction.daily_attendance.length +
                    transaction.market_attendance.length}
                  )
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{ maxHeight: 200, overflow: "auto" }}
                >
                  <List dense disablePadding>
                    {transaction.daily_attendance.map((da) => (
                      <ListItem
                        key={da.id}
                        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                      >
                        <ListItemText
                          primary={da.laborer_name}
                          secondary={dayjs(da.date).format("DD MMM")}
                        />
                        <Chip
                          size="small"
                          label={`₹${da.daily_earnings.toLocaleString("en-IN")}`}
                          variant="outlined"
                        />
                      </ListItem>
                    ))}
                    {transaction.market_attendance.map((ma) => (
                      <ListItem
                        key={ma.id}
                        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                      >
                        <ListItemText
                          primary={`${ma.role_name} (${ma.count} laborers)`}
                          secondary={`${dayjs(ma.date).format("DD MMM")} • ₹${ma.rate_per_person}/person`}
                        />
                        <Chip
                          size="small"
                          label={`₹${ma.total_cost.toLocaleString("en-IN")}`}
                          variant="outlined"
                          color="secondary"
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
                {totalLaborerAmount > 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: "block" }}
                  >
                    Total laborer amount: ₹{totalLaborerAmount.toLocaleString("en-IN")}
                  </Typography>
                )}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Settlement Mode Selection */}
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Payment Mode
            </Typography>
            <RadioGroup
              value={settlementMode}
              onChange={(e) => setSettlementMode(e.target.value as SettlementMode)}
              sx={{ mb: 2 }}
            >
              <FormControlLabel
                value="upi"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      UPI / Online Transfer
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Screenshot required
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="cash"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      Cash
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Optional reason/notes
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>

            {/* UPI Screenshot */}
            {settlementMode === "upi" && (
              <Box sx={{ mb: 2 }}>
                <FileUploader
                  supabase={supabase}
                  bucketName="settlement-proofs"
                  folderPath={`settlements/${transactionId}`}
                  fileNamePrefix="proof"
                  accept="image"
                  maxSizeMB={10}
                  label="Payment Screenshot *"
                  helperText="Upload screenshot of UPI/bank transfer"
                  value={proofFile}
                  onUpload={(file) => setProofFile(file)}
                  onRemove={() => setProofFile(null)}
                  compact
                />
              </Box>
            )}

            {/* Reason/Notes - show for BOTH UPI and Cash */}
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Notes / Comments (Optional)"
              placeholder={
                settlementMode === "cash"
                  ? "Enter reason for cash payment..."
                  : "Any additional notes about this payment..."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              sx={{ mb: 2 }}
            />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </Box>
        ) : null}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} disabled={settlementMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            loading ||
            settlementMutation.isPending ||
            !transaction ||
            (settlementMode === "upi" && !proofFile)
          }
          startIcon={settlementMutation.isPending ? <CircularProgress size={16} /> : null}
        >
          {settlementMutation.isPending ? "Submitting..." : "Submit Settlement"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
