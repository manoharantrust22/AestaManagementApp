"use client";

import { useState, useMemo } from "react";
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
  Autocomplete,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Divider,
  MenuItem,
  Chip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Assessment as ReportIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useSiteGroupMembership,
  useGroupStockInventory,
  useBatchRecordGroupStockUsage,
} from "@/hooks/queries/useSiteGroups";
import type { GroupStockInventoryWithDetails } from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";

interface WeeklyUsageReportDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
}

interface UsageEntryRow {
  inventoryId: string;
  materialId: string;
  brandId?: string;
  materialName?: string;
  unit?: string;
  quantity: number;
  usageSiteId: string;
  usageSiteName?: string;
  workDescription?: string;
  availableQty: number;
  unitCost: number;
}

// Format date for display
function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  };
  return date.toLocaleDateString("en-IN", options);
}

export default function WeeklyUsageReportDialog({
  open,
  onClose,
  siteId,
}: WeeklyUsageReportDialogProps) {
  const isMobile = useIsMobile();

  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const { data: groupInventory = [] } = useGroupStockInventory(
    groupMembership?.groupId
  );
  const batchRecordUsage = useBatchRecordGroupStockUsage();

  // Debug logging
  console.log("[UsageReportDialog] Render", {
    groupMembership,
    inventoryCount: groupInventory.length,
    inventory: groupInventory
  });

  // Default to today's date
  const [usageDate, setUsageDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<UsageEntryRow[]>([]);

  // New entry form
  const [selectedInventory, setSelectedInventory] =
    useState<GroupStockInventoryWithDetails | null>(null);
  const [newEntryQty, setNewEntryQty] = useState("");
  const [newEntryUsageSite, setNewEntryUsageSite] = useState<string>("");
  const [newEntryWorkDesc, setNewEntryWorkDesc] = useState("");

  // Calculate total cost
  const totalCost = useMemo(() => {
    return entries.reduce(
      (sum, entry) => sum + entry.quantity * entry.unitCost,
      0
    );
  }, [entries]);

  const handleAddEntry = () => {
    if (!selectedInventory) {
      setError("Please select a material");
      return;
    }
    if (!newEntryQty || parseFloat(newEntryQty) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }
    if (!newEntryUsageSite) {
      setError("Please select which site used this material");
      return;
    }

    const qty = parseFloat(newEntryQty);

    // Check available quantity
    if (qty > selectedInventory.current_qty) {
      setError(
        `Insufficient stock. Available: ${selectedInventory.current_qty} ${selectedInventory.material?.unit || ""}`
      );
      return;
    }

    const usageSite = groupMembership?.allSites?.find(
      (s) => s.id === newEntryUsageSite
    );

    const newEntry: UsageEntryRow = {
      inventoryId: selectedInventory.id,
      materialId: selectedInventory.material_id,
      brandId: selectedInventory.brand_id || undefined,
      materialName: selectedInventory.material?.name,
      unit: selectedInventory.material?.unit,
      quantity: qty,
      usageSiteId: newEntryUsageSite,
      usageSiteName: usageSite?.name,
      workDescription: newEntryWorkDesc || undefined,
      availableQty: selectedInventory.current_qty,
      unitCost: selectedInventory.avg_unit_cost || 0,
    };

    setEntries([...entries, newEntry]);
    setSelectedInventory(null);
    setNewEntryQty("");
    setNewEntryUsageSite("");
    setNewEntryWorkDesc("");
    setError("");
  };

  const handleRemoveEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    console.log("[UsageReport] Submit started", {
      groupMembership,
      entriesCount: entries.length,
      usageDate
    });

    if (!groupMembership?.isInGroup || !groupMembership.groupId) {
      setError("Site is not part of a group");
      console.error("[UsageReport] Site is not part of a group");
      return;
    }
    if (entries.length === 0) {
      setError("Please add at least one usage entry");
      console.error("[UsageReport] No entries to submit");
      return;
    }

    const payload = {
      groupId: groupMembership.groupId,
      entries: entries.map((entry) => ({
        materialId: entry.materialId,
        brandId: entry.brandId,
        quantity: entry.quantity,
        usageSiteId: entry.usageSiteId,
        workDescription: entry.workDescription,
        transactionDate: usageDate,
      })),
    };

    console.log("[UsageReport] Submitting payload:", JSON.stringify(payload, null, 2));

    try {
      const result = await batchRecordUsage.mutateAsync(payload);
      console.log("[UsageReport] Submit successful:", result);

      // Reset form
      setEntries([]);
      setError("");
      onClose();
    } catch (err: unknown) {
      console.error("[UsageReport] Submit failed:", err);
      const message =
        err instanceof Error ? err.message : "Failed to submit usage report";
      setError(message);
    }
  };

  const isSubmitting = batchRecordUsage.isPending;

  if (!groupMembership?.isInGroup) {
    return (
      <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }} maxWidth="sm" fullWidth>
        <DialogTitle>Usage Report Entry</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            This site is not part of a site group. Usage reports can only be
            submitted for grouped sites.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Filter out current site from usage site options (report is for OTHER sites' usage)
  const usageSiteOptions =
    groupMembership.otherSites && groupMembership.otherSites.length > 0
      ? groupMembership.otherSites
      : groupMembership.allSites || [];

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ReportIcon color="primary" />
          <Typography component="span" variant="h6">Usage Report Entry</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Alert severity="info" sx={{ mb: 2 }}>
          Report materials used by other sites from the shared group stock.
          This helps track costs for settlement between sites.
        </Alert>

        <Grid container spacing={2}>
          {/* Date Selector */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Usage Date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                input: {
                  inputProps: {
                    max: new Date().toISOString().split("T")[0]
                  }
                }
              }}
              helperText={formatDate(usageDate)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }} />

          {/* Add Entry Section */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="subtitle2">Add Usage Entry</Typography>
            </Divider>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Autocomplete
              options={groupInventory}
              getOptionLabel={(option) => {
                const brandDisplay = option.brand
                  ? option.brand.variant_name
                    ? `${option.brand.brand_name} ${option.brand.variant_name}`
                    : option.brand.brand_name
                  : null;
                return `${option.material?.name || "Unknown"}${
                  brandDisplay ? ` - ${brandDisplay}` : ""
                }`;
              }}
              value={selectedInventory}
              onChange={(_, value) => {
                console.log("[WeeklyUsageDialog] Material selected:", value);
                setSelectedInventory(value);
              }}
              renderInput={(params) => (
                <TextField {...params} label="Material from Stock" size="small" />
              )}
              renderOption={(props, option) => {
                const brandDisplay = option.brand
                  ? option.brand.variant_name
                    ? `${option.brand.brand_name} ${option.brand.variant_name}`
                    : option.brand.brand_name
                  : null;
                return (
                  <li {...props} key={option.id}>
                    <Box sx={{ width: "100%" }}>
                      <Typography variant="body2">
                        {option.material?.name}
                        {brandDisplay && (
                          <Typography
                            component="span"
                            variant="body2"
                            color="primary"
                            sx={{ fontWeight: 500 }}
                          >
                            {" "}- {brandDisplay}
                          </Typography>
                        )}
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mt: 0.5,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Available: {option.current_qty} {option.material?.unit}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          @ {formatCurrency(option.avg_unit_cost || 0)}/
                          {option.material?.unit}
                        </Typography>
                      </Box>
                    </Box>
                  </li>
                );
              }}
            />
          </Grid>

          <Grid size={{ xs: 6, md: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Quantity"
              value={newEntryQty}
              onChange={(e) => setNewEntryQty(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
              helperText={
                selectedInventory
                  ? `Max: ${selectedInventory.current_qty}`
                  : undefined
              }
            />
          </Grid>

          <Grid size={{ xs: 6, md: 3 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Used By Site"
              value={newEntryUsageSite}
              onChange={(e) => setNewEntryUsageSite(e.target.value)}
            >
              {usageSiteOptions.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Work Description (Optional)"
              value={newEntryWorkDesc}
              onChange={(e) => setNewEntryWorkDesc(e.target.value)}
              placeholder="e.g., Foundation work"
            />
          </Grid>

          <Grid size={12}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddEntry}
              disabled={!selectedInventory || !newEntryQty || !newEntryUsageSite}
            >
              Add Entry
            </Button>
          </Grid>

          {/* Entries Table */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell>Used By</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Cost</TableCell>
                    <TableCell align="right">Total Cost</TableCell>
                    <TableCell width={50}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 2 }}
                        >
                          No usage entries added yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2">
                            {entry.materialName}
                          </Typography>
                          {entry.workDescription && (
                            <Typography variant="caption" color="text.secondary">
                              {entry.workDescription}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={entry.usageSiteName}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          {entry.quantity} {entry.unit}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(entry.unitCost)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(entry.quantity * entry.unitCost)}
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveEntry(index)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Total */}
          {entries.length > 0 && (
            <Grid size={12}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  mt: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    p: 2,
                    bgcolor: "primary.50",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="subtitle1">Total Cost:</Typography>
                  <Typography variant="h6" fontWeight={600} color="primary">
                    {formatCurrency(totalCost)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || entries.length === 0}
        >
          {isSubmitting ? "Submitting..." : "Submit Report"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
