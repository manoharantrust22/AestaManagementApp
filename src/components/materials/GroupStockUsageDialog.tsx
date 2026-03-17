"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  IconButton,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import dayjs, { Dayjs } from "dayjs";
import { formatCurrency } from "@/lib/formatters";
import {
  consolidateGroupStockByMaterial,
  allocateGroupStockFIFO,
  type GroupStockBatchAllocation,
  type ConsolidatedGroupStockMaterial,
} from "@/lib/utils/fifoAllocator";
import { useRecordGroupStockUsageFIFO } from "@/hooks/queries/useBatchUsage";
import type { GroupStockBatch } from "@/types/material.types";

interface GroupStockUsageDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  batchesWithUsage: GroupStockBatch[];
  preSelectedMaterialId?: string | null;
}

export default function GroupStockUsageDialog({
  open,
  onClose,
  siteId,
  batchesWithUsage,
  preSelectedMaterialId,
}: GroupStockUsageDialogProps) {
  // Step: 'form' or 'preview'
  const [step, setStep] = useState<"form" | "preview">("form");
  const [selectedMaterial, setSelectedMaterial] =
    useState<ConsolidatedGroupStockMaterial | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [usageDate, setUsageDate] = useState<Dayjs | null>(dayjs());
  const [workDescription, setWorkDescription] = useState("");
  const [allocations, setAllocations] = useState<GroupStockBatchAllocation[]>([]);
  const [error, setError] = useState("");

  const recordUsageMutation = useRecordGroupStockUsageFIFO();

  // Consolidate materials from active batches
  const materialOptions = useMemo(
    () => consolidateGroupStockByMaterial(batchesWithUsage),
    [batchesWithUsage]
  );

  // Auto-select material if preSelected
  useMemo(() => {
    if (preSelectedMaterialId && materialOptions.length > 0 && !selectedMaterial) {
      const match = materialOptions.find(
        (m) => m.material_id === preSelectedMaterialId
      );
      if (match) setSelectedMaterial(match);
    }
  }, [preSelectedMaterialId, materialOptions, selectedMaterial]);

  const handleReset = () => {
    setStep("form");
    setSelectedMaterial(null);
    setQuantity("");
    setUsageDate(dayjs());
    setWorkDescription("");
    setAllocations([]);
    setError("");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handlePreview = () => {
    setError("");
    if (!selectedMaterial) {
      setError("Please select a material");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Please enter a valid quantity");
      return;
    }
    if (qty > selectedMaterial.total_remaining) {
      setError(
        `Quantity exceeds available stock (${selectedMaterial.total_remaining} ${selectedMaterial.unit})`
      );
      return;
    }

    try {
      const result = allocateGroupStockFIFO(
        batchesWithUsage,
        selectedMaterial.material_id,
        qty
      );
      setAllocations(result);
      setStep("preview");
    } catch (err: any) {
      setError(err.message || "Failed to compute allocation");
    }
  };

  const handleSubmit = async () => {
    if (allocations.length === 0 || !usageDate) return;
    setError("");

    try {
      await recordUsageMutation.mutateAsync({
        allocations,
        usage_site_id: siteId,
        usage_date: usageDate.format("YYYY-MM-DD"),
        work_description: workDescription || undefined,
      });
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to record usage");
    }
  };

  const totalCost = allocations.reduce((sum, a) => sum + a.total_cost, 0);
  const totalQty = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const batchesCompleting = allocations.filter((a) => a.will_complete);

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") handleClose(); }}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: 400 } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {step === "preview" && (
          <IconButton size="small" onClick={() => setStep("form")}>
            <ArrowBackIcon />
          </IconButton>
        )}
        {step === "form" ? "Record Group Stock Usage" : "FIFO Allocation Preview"}
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {step === "form" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
            {/* Material Selection */}
            <Autocomplete
              options={materialOptions}
              value={selectedMaterial}
              onChange={(_, val) => {
                setSelectedMaterial(val);
                setQuantity("");
              }}
              getOptionLabel={(opt) =>
                `${opt.material_name}${opt.brand_names.length > 0 ? ` (${opt.brand_names.join(", ")})` : ""}`
              }
              renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.material_id}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {opt.material_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {opt.total_remaining} {opt.unit} available across{" "}
                      {opt.batch_count} batch{opt.batch_count > 1 ? "es" : ""} |
                      Avg: {formatCurrency(opt.weighted_avg_cost)}/{opt.unit}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} label="Material" placeholder="Select material..." />
              )}
              slotProps={{ popper: { disablePortal: false } }}
              isOptionEqualToValue={(opt, val) => opt.material_id === val.material_id}
            />

            {/* Info Card */}
            {selectedMaterial && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Available Stock
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {selectedMaterial.total_remaining} {selectedMaterial.unit}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Batches
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {selectedMaterial.batch_count}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Avg Cost
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {formatCurrency(selectedMaterial.weighted_avg_cost)}/
                      {selectedMaterial.unit}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            )}

            {/* Quantity */}
            <TextField
              label="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: selectedMaterial ? (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      {selectedMaterial.unit}
                    </Typography>
                  ) : undefined,
                },
                htmlInput: {
                  min: 1,
                  max: selectedMaterial?.total_remaining ?? undefined,
                  step: 1,
                },
              }}
              helperText={
                selectedMaterial
                  ? `Max: ${selectedMaterial.total_remaining} ${selectedMaterial.unit}`
                  : undefined
              }
              disabled={!selectedMaterial}
            />

            {/* Usage Date */}
            <DatePicker
              label="Usage Date"
              value={usageDate}
              onChange={setUsageDate}
              format="DD/MM/YYYY"
              slotProps={{ textField: { fullWidth: true } }}
            />

            {/* Work Description */}
            <TextField
              label="Work Description"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="e.g., Foundation work, plastering..."
              multiline
              rows={2}
            />
          </Box>
        )}

        {step === "preview" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Summary */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Material
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedMaterial?.material_name}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Quantity
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {totalQty} {selectedMaterial?.unit}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Cost
                  </Typography>
                  <Typography variant="body1" fontWeight={600} color="primary">
                    {formatCurrency(totalCost)}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Completion Alert */}
            {batchesCompleting.length > 0 && (
              <Alert severity="info" icon={<WarningAmberIcon />}>
                <Typography variant="body2">
                  <strong>{batchesCompleting.length}</strong> batch
                  {batchesCompleting.length > 1 ? "es" : ""} will be auto-completed
                  (remaining = 0). Self-use expenses will be created automatically
                  for the paying site.
                </Typography>
              </Alert>
            )}

            {/* Allocation Table */}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Batch</TableCell>
                    <TableCell>Purchase Date</TableCell>
                    <TableCell>Paid By</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Cost</TableCell>
                    <TableCell align="right">Total Cost</TableCell>
                    <TableCell align="right">Remaining After</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allocations.map((alloc) => (
                    <TableRow
                      key={alloc.batch_ref_code}
                      sx={
                        alloc.will_complete
                          ? { bgcolor: "warning.50" }
                          : undefined
                      }
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "monospace" }}>
                          {alloc.batch_ref_code.slice(0, 8)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {dayjs(alloc.purchase_date).format("DD MMM YYYY")}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {alloc.paying_site_name || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {alloc.quantity} {alloc.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(alloc.unit_cost)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(alloc.total_cost)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={alloc.remaining_after <= 0 ? "error" : "text.primary"}
                        >
                          {alloc.remaining_after} {alloc.unit}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {alloc.will_complete ? (
                          <Chip
                            size="small"
                            label="Will Complete"
                            color="warning"
                            icon={<CheckCircleIcon />}
                          />
                        ) : (
                          <Chip size="small" label="Partial" color="default" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={recordUsageMutation.isPending}>
          Cancel
        </Button>

        {step === "form" && (
          <Button
            variant="contained"
            onClick={handlePreview}
            disabled={!selectedMaterial || !quantity || Number(quantity) <= 0}
          >
            Preview Allocation
          </Button>
        )}

        {step === "preview" && (
          <>
            <Button onClick={() => setStep("form")} disabled={recordUsageMutation.isPending}>
              Back
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={recordUsageMutation.isPending}
            >
              {recordUsageMutation.isPending ? "Recording..." : "Confirm & Record"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
