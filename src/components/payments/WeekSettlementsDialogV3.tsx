"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Chip,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Tooltip,
  alpha,
  useTheme,
  Skeleton,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
} from "@mui/material";
import {
  Close as CloseIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
  Image as ImageIcon,
  ViewModule as CardViewIcon,
  ViewList as TableViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import dayjs from "dayjs";
import { getDateWiseSettlements } from "@/lib/services/settlementService";
import PayerSourceChip from "@/components/settlement/PayerSourceChip";
import type { DateWiseSettlement, PaymentMode, PaymentStatus } from "@/types/payment.types";
import type { PayerSource } from "@/types/settlement.types";
import ScreenshotViewer from "@/components/common/ScreenshotViewer";

// Week data type
interface WeekLaborerData {
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  teamId: string | null;
  teamName: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
  daysWorked: number;
  earned: number;
  paid: number;
  balance: number;
  progress: number;
}

interface WeekRowData {
  id: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  laborerCount: number;
  totalSalary: number;
  totalPaid: number;
  totalDue: number;
  paymentProgress: number;
  status: PaymentStatus;
  laborers: WeekLaborerData[];
  settlementReferences: string[];
  paymentDates?: string[];
}

interface WeekSettlementsDialogV3Props {
  open: boolean;
  onClose: () => void;
  week: WeekRowData | null;
  onViewPayment: (ref: string) => void;
  onEditSettlement?: (settlement: DateWiseSettlement) => void;
  onDeleteSettlement?: (settlement: DateWiseSettlement) => void;
  onRefresh?: () => void;
}

type ViewMode = "card" | "table";

// Format currency
function formatCurrency(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  }
  return `₹${amount.toLocaleString()}`;
}

function getPaymentModeLabel(mode: string | null): string {
  if (!mode) return "N/A";
  switch (mode) {
    case "upi":
      return "UPI";
    case "cash":
      return "Cash";
    case "net_banking":
      return "Net Banking";
    case "other":
      return "Other";
    default:
      return mode;
  }
}

export default function WeekSettlementsDialogV3({
  open,
  onClose,
  week,
  onViewPayment,
  onEditSettlement,
  onDeleteSettlement,
  onRefresh,
}: WeekSettlementsDialogV3Props) {
  const theme = useTheme();
  const { selectedSite } = useSite();
  const supabase = createClient();

  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [loading, setLoading] = useState(true);
  const [settlements, setSettlements] = useState<DateWiseSettlement[]>([]);
  const [screenshotViewerOpen, setScreenshotViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Fetch settlements for this week
  const fetchSettlements = useCallback(async () => {
    if (!selectedSite?.id || !week) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { settlements: data } = await getDateWiseSettlements(
        supabase,
        selectedSite.id,
        week.weekStart,
        week.weekEnd
      );

      // Map to DateWiseSettlement format
      const mapped: DateWiseSettlement[] = data.map((s) => ({
        settlementGroupId: s.settlementGroupId,
        settlementReference: s.settlementReference,
        settlementDate: s.settlementDate,
        totalAmount: s.totalAmount,
        weekAllocations: s.weekAllocations,
        paymentMode: s.paymentMode as PaymentMode | null,
        paymentChannel: s.paymentChannel as "direct" | "engineer_wallet",
        payerSource: s.payerSource as PayerSource | null,
        payerName: s.payerName,
        payerSourceSplit: s.payerSourceSplit,
        proofUrls: s.proofUrls,
        notes: s.notes,
        subcontractId: null,
        subcontractTitle: null,
        createdBy: s.createdBy || "",
        createdByName: s.createdBy,
        createdAt: s.createdAt,
        isCancelled: false,
      }));

      // Sort by date (newest first)
      mapped.sort(
        (a, b) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime()
      );

      setSettlements(mapped);
    } catch (err) {
      console.error("Error fetching settlements:", err);
      setSettlements([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite?.id, week, supabase]);

  useEffect(() => {
    if (open && week) {
      fetchSettlements();
    }
  }, [open, week, fetchSettlements]);

  const handleOpenScreenshotViewer = (images: string[], initialIndex = 0) => {
    setViewerImages(images);
    setViewerInitialIndex(initialIndex);
    setScreenshotViewerOpen(true);
  };

  if (!week) return null;

  const paymentProgress = week.totalSalary > 0 ? (week.totalPaid / week.totalSalary) * 100 : 0;

  // Render Card View
  const renderCardView = () => (
    <Grid container spacing={2}>
      {settlements.map((settlement) => (
        <Grid key={settlement.settlementGroupId} size={{ xs: 12, sm: 6, md: 4 }}>
          <Card
            variant="outlined"
            sx={{
              height: "100%",
              borderRadius: 2,
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
              "&:hover": {
                borderColor: theme.palette.primary.main,
                boxShadow: theme.shadows[3],
                transform: "translateY(-2px)",
                "& .card-actions": {
                  opacity: 1,
                },
              },
            }}
            onClick={() => onViewPayment(settlement.settlementReference)}
          >
            {/* Edit/Delete Actions - Top Right */}
            {(onEditSettlement || onDeleteSettlement) && (
              <Box
                className="card-actions"
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  display: "flex",
                  gap: 0.5,
                  opacity: 0.7,
                  transition: "opacity 0.2s",
                  bgcolor: alpha(theme.palette.background.paper, 0.9),
                  borderRadius: 1,
                  p: 0.25,
                }}
              >
                {onEditSettlement && (
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSettlement(settlement);
                      }}
                      sx={{ p: 0.5 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {onDeleteSettlement && (
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSettlement(settlement);
                      }}
                      sx={{ p: 0.5 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )}

            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              {/* Date - Prominent */}
              <Typography variant="h6" fontWeight={600} color="primary.main">
                {dayjs(settlement.settlementDate).format("MMM D")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dayjs(settlement.settlementDate).format("dddd, YYYY")}
              </Typography>

              {/* Amount - Large */}
              <Typography variant="h5" fontWeight={700} sx={{ mt: 1.5, color: "success.dark" }}>
                {formatCurrency(settlement.totalAmount)}
              </Typography>

              {/* Ref Code */}
              <Chip
                label={settlement.settlementReference}
                size="small"
                color="primary"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewPayment(settlement.settlementReference);
                }}
                sx={{
                  mt: 1,
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                }}
              />

              {/* Method & Proof */}
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1.5 }}>
                <Chip
                  label={getPaymentModeLabel(settlement.paymentMode)}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem" }}
                />
                {settlement.proofUrls && settlement.proofUrls.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {settlement.proofUrls.slice(0, 2).map((url, idx) => (
                      <Box
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenScreenshotViewer(settlement.proofUrls, idx);
                        }}
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 1,
                          overflow: "hidden",
                          cursor: "pointer",
                          border: `1px solid ${theme.palette.divider}`,
                          "&:hover": { borderColor: theme.palette.primary.main },
                        }}
                      >
                        <Box
                          component="img"
                          src={url}
                          alt={`Proof ${idx + 1}`}
                          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </Box>
                    ))}
                    {settlement.proofUrls.length > 2 && (
                      <Chip
                        label={`+${settlement.proofUrls.length - 2}`}
                        size="small"
                        sx={{ height: 32 }}
                      />
                    )}
                  </Box>
                )}
              </Box>

              {/* Recorded By - Small */}
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
                {settlement.createdByName || "Unknown"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  // Render Table View
  const renderTableView = () => (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
            <TableCell>Date</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell>Ref Code</TableCell>
            <TableCell>Method</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Proof</TableCell>
            <TableCell>Recorded By</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {settlements.map((settlement) => (
            <TableRow
              key={settlement.settlementGroupId}
              hover
              sx={{ cursor: "pointer" }}
              onClick={() => onEditSettlement?.(settlement)}
            >
              <TableCell>
                <Typography variant="body2" fontWeight={500}>
                  {dayjs(settlement.settlementDate).format("MMM D, YYYY")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {dayjs(settlement.settlementDate).format("dddd")}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={600} color="success.main">
                  {formatCurrency(settlement.totalAmount)}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={settlement.settlementReference}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewPayment(settlement.settlementReference);
                  }}
                  sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                />
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {getPaymentModeLabel(settlement.paymentMode)}
                </Typography>
              </TableCell>
              <TableCell>
                {settlement.payerSource || settlement.payerSourceSplit ? (
                  <PayerSourceChip
                    row={{
                      payer_source: settlement.payerSource,
                      payer_name: settlement.payerName,
                      payer_source_split: settlement.payerSourceSplit ?? null,
                    }}
                  />
                ) : (
                  <Typography variant="body2" color="text.disabled">-</Typography>
                )}
              </TableCell>
              <TableCell>
                {settlement.proofUrls && settlement.proofUrls.length > 0 ? (
                  <Tooltip title="View payment proof">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenScreenshotViewer(settlement.proofUrls, 0);
                      }}
                      sx={{ color: "primary.main" }}
                    >
                      <ImageIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Typography variant="body2" color="text.disabled">-</Typography>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 100 }}>
                  {settlement.createdByName || "Unknown"}
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                  {onEditSettlement && (
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditSettlement(settlement);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {onDeleteSettlement && (
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSettlement(settlement);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: "90vh",
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pb: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CalendarIcon color="primary" />
            <Box>
              <Typography variant="h6" component="span">
                {week.weekLabel}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }} component="span">
                {week.laborerCount} laborers
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {/* Summary Header */}
          <Box
            sx={{
              p: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Total Salary
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {formatCurrency(week.totalSalary)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Paid
                </Typography>
                <Typography variant="h6" fontWeight={600} color="success.main">
                  {formatCurrency(week.totalPaid)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Due
                </Typography>
                <Typography variant="h6" fontWeight={600} color="error.main">
                  {formatCurrency(week.totalDue)}
                </Typography>
              </Box>
              <Box sx={{ flexGrow: 1, minWidth: 150 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Progress
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {Math.round(paymentProgress)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(paymentProgress, 100)}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 4,
                      bgcolor: paymentProgress >= 100 ? "success.main" : "primary.main",
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>

          {/* View Toggle & Settlements */}
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <ReceiptIcon fontSize="small" />
                Settlements ({settlements.length})
              </Typography>

              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, value) => value && setViewMode(value)}
                size="small"
              >
                <ToggleButton value="card">
                  <Tooltip title="Card View">
                    <CardViewIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="table">
                  <Tooltip title="Table View">
                    <TableViewIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {loading ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rounded" height={100} />
                ))}
              </Box>
            ) : settlements.length === 0 ? (
              <Card variant="outlined" sx={{ bgcolor: alpha(theme.palette.grey[500], 0.04) }}>
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <PaymentIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                  <Typography color="text.secondary">No settlements recorded for this week</Typography>
                </CardContent>
              </Card>
            ) : viewMode === "card" ? (
              renderCardView()
            ) : (
              renderTableView()
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* Screenshot Viewer */}
      <ScreenshotViewer
        open={screenshotViewerOpen}
        onClose={() => setScreenshotViewerOpen(false)}
        images={viewerImages}
        initialIndex={viewerInitialIndex}
        title="Payment Proof"
      />
    </>
  );
}
