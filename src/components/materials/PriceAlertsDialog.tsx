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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Skeleton,
  InputAdornment,
  Tabs,
  Tab,
  Autocomplete,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  NotificationsActive as AlertIcon,
  CheckCircle as CheckIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import {
  useMaterialPriceAlerts,
  useCreatePriceAlert,
  useUpdatePriceAlert,
  useTogglePriceAlert,
  useDeletePriceAlert,
  useTriggeredAlerts,
  useAcknowledgeAlert,
  useAcknowledgeAllAlerts,
} from "@/hooks/queries/usePriceAlerts";
import type {
  MaterialWithDetails,
  MaterialBrand,
  PriceAlertType,
  PriceAlertWithDetails,
} from "@/types/material.types";
import {
  PRICE_ALERT_TYPE_LABELS,
  PRICE_ALERT_TYPE_DESCRIPTIONS,
  PRICE_ALERT_TYPE_COLORS,
} from "@/types/material.types";

interface PriceAlertsDialogProps {
  open: boolean;
  onClose: () => void;
  material: MaterialWithDetails;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

// Format currency
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function PriceAlertsDialog({
  open,
  onClose,
  material,
}: PriceAlertsDialogProps) {
  const [tabValue, setTabValue] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [alertType, setAlertType] = useState<PriceAlertType>("price_drop");
  const [selectedBrand, setSelectedBrand] = useState<MaterialBrand | null>(null);
  const [thresholdPercent, setThresholdPercent] = useState("");
  const [thresholdValue, setThresholdValue] = useState("");

  // Queries
  const { data: alerts = [], isLoading: alertsLoading } = useMaterialPriceAlerts(material.id);
  const { data: triggeredAlerts = [], isLoading: triggeredLoading } = useTriggeredAlerts({
    limit: 50,
  });

  // Filter triggered alerts for this material
  const materialTriggeredAlerts = useMemo(() => {
    return triggeredAlerts.filter(
      (t) => t.alert?.material_id === material.id
    );
  }, [triggeredAlerts, material.id]);

  // Mutations
  const createAlert = useCreatePriceAlert();
  const toggleAlert = useTogglePriceAlert();
  const deleteAlert = useDeletePriceAlert();
  const acknowledgeAlert = useAcknowledgeAlert();
  const acknowledgeAll = useAcknowledgeAllAlerts();

  const brands = material.brands?.filter((b) => b.is_active) || [];

  const handleAddAlert = async () => {
    if (alertType === "price_drop" || alertType === "price_increase") {
      if (!thresholdPercent) return;
    } else {
      if (!thresholdValue) return;
    }

    try {
      await createAlert.mutateAsync({
        material_id: material.id,
        brand_id: selectedBrand?.id,
        alert_type: alertType,
        threshold_percent:
          alertType === "price_drop" || alertType === "price_increase"
            ? parseFloat(thresholdPercent)
            : undefined,
        threshold_value:
          alertType === "threshold_below" || alertType === "threshold_above"
            ? parseFloat(thresholdValue)
            : undefined,
      });

      // Reset form
      setShowAddForm(false);
      setAlertType("price_drop");
      setSelectedBrand(null);
      setThresholdPercent("");
      setThresholdValue("");
    } catch (err) {
      console.error("Failed to create alert:", err);
    }
  };

  const handleToggleAlert = async (alert: PriceAlertWithDetails) => {
    try {
      await toggleAlert.mutateAsync({
        id: alert.id,
        isActive: !alert.is_active,
      });
    } catch (err) {
      console.error("Failed to toggle alert:", err);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm("Are you sure you want to delete this alert?")) return;

    try {
      await deleteAlert.mutateAsync(alertId);
    } catch (err) {
      console.error("Failed to delete alert:", err);
    }
  };

  const handleAcknowledge = async (triggeredId: string) => {
    try {
      await acknowledgeAlert.mutateAsync(triggeredId);
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await acknowledgeAll.mutateAsync();
    } catch (err) {
      console.error("Failed to acknowledge all:", err);
    }
  };

  const isPercentType = alertType === "price_drop" || alertType === "price_increase";

  return (
    <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AlertIcon color="primary" />
          <Typography variant="h6" component="span">Price Alerts - {material.name}</Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                My Alerts
                {alerts.length > 0 && (
                  <Chip label={alerts.length} size="small" color="primary" />
                )}
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                Triggered
                {materialTriggeredAlerts.filter((a) => !a.acknowledged).length > 0 && (
                  <Chip
                    label={materialTriggeredAlerts.filter((a) => !a.acknowledged).length}
                    size="small"
                    color="error"
                  />
                )}
              </Box>
            }
          />
        </Tabs>

        {/* My Alerts Tab */}
        <TabPanel value={tabValue} index={0}>
          {/* Add New Alert Form */}
          {showAddForm ? (
            <Box
              sx={{
                p: 2,
                mb: 2,
                bgcolor: "grey.50",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                Create New Alert
              </Typography>

              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Alert Type</InputLabel>
                  <Select
                    value={alertType}
                    label="Alert Type"
                    onChange={(e) => setAlertType(e.target.value as PriceAlertType)}
                  >
                    {(Object.keys(PRICE_ALERT_TYPE_LABELS) as PriceAlertType[]).map((type) => (
                      <MenuItem key={type} value={type}>
                        <Box>
                          <Typography variant="body2">
                            {PRICE_ALERT_TYPE_LABELS[type]}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {PRICE_ALERT_TYPE_DESCRIPTIONS[type]}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {brands.length > 0 && (
                  <Autocomplete
                    options={brands}
                    getOptionLabel={(brand) =>
                      brand.variant_name
                        ? `${brand.brand_name} ${brand.variant_name}`
                        : brand.brand_name
                    }
                    value={selectedBrand}
                    onChange={(_, value) => setSelectedBrand(value)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Brand (Optional)"
                        size="small"
                        helperText="Leave empty to alert for all brands"
                      />
                    )}
                  />
                )}

                {isPercentType ? (
                  <TextField
                    label="Threshold Percentage"
                    type="number"
                    size="small"
                    value={thresholdPercent}
                    onChange={(e) => setThresholdPercent(e.target.value)}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                    helperText={
                      alertType === "price_drop"
                        ? "Alert when price drops by this percentage"
                        : "Alert when price increases by this percentage"
                    }
                  />
                ) : (
                  <TextField
                    label="Threshold Price"
                    type="number"
                    size="small"
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                    }}
                    helperText={
                      alertType === "threshold_below"
                        ? "Alert when price falls below this value"
                        : "Alert when price exceeds this value"
                    }
                  />
                )}

                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleAddAlert}
                    disabled={
                      createAlert.isPending ||
                      (isPercentType ? !thresholdPercent : !thresholdValue)
                    }
                  >
                    Create Alert
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ) : (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setShowAddForm(true)}
              size="small"
              sx={{ mb: 2 }}
            >
              Add Alert
            </Button>
          )}

          {/* Alerts List */}
          {alertsLoading ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={60} />
              <Skeleton variant="rounded" height={60} />
            </Stack>
          ) : alerts.length === 0 ? (
            <Alert severity="info">
              No price alerts configured for this material. Create an alert to get
              notified of price changes.
            </Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Alert Type</TableCell>
                  <TableCell>Brand</TableCell>
                  <TableCell>Threshold</TableCell>
                  <TableCell>Triggers</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Chip
                        icon={
                          alert.alert_type === "price_drop" ||
                          alert.alert_type === "threshold_below" ? (
                            <TrendingDownIcon />
                          ) : (
                            <TrendingUpIcon />
                          )
                        }
                        label={PRICE_ALERT_TYPE_LABELS[alert.alert_type]}
                        size="small"
                        color={PRICE_ALERT_TYPE_COLORS[alert.alert_type]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {alert.brand ? (
                        <Typography variant="body2">
                          {alert.brand.brand_name}
                          {alert.brand.variant_name && ` ${alert.brand.variant_name}`}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          All brands
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {alert.threshold_percent !== null ? (
                        <Typography variant="body2">{alert.threshold_percent}%</Typography>
                      ) : alert.threshold_value !== null ? (
                        <Typography variant="body2">
                          {formatCurrency(alert.threshold_value)}
                        </Typography>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {alert.trigger_count}
                        {alert.last_triggered_at && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            Last: {formatDate(alert.last_triggered_at)}
                          </Typography>
                        )}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={alert.is_active}
                        onChange={() => handleToggleAlert(alert)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteAlert(alert.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabPanel>

        {/* Triggered Alerts Tab */}
        <TabPanel value={tabValue} index={1}>
          {triggeredLoading ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={60} />
              <Skeleton variant="rounded" height={60} />
            </Stack>
          ) : materialTriggeredAlerts.length === 0 ? (
            <Alert severity="info">
              No triggered alerts for this material yet.
            </Alert>
          ) : (
            <>
              {materialTriggeredAlerts.some((a) => !a.acknowledged) && (
                <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CheckIcon />}
                    onClick={handleAcknowledgeAll}
                  >
                    Acknowledge All
                  </Button>
                </Box>
              )}

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Alert Type</TableCell>
                    <TableCell>Price Change</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {materialTriggeredAlerts.map((triggered) => (
                    <TableRow
                      key={triggered.id}
                      sx={{
                        bgcolor: triggered.acknowledged ? undefined : "warning.50",
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2">
                          {formatDateTime(triggered.triggered_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {triggered.alert && (
                          <Chip
                            label={PRICE_ALERT_TYPE_LABELS[triggered.alert.alert_type]}
                            size="small"
                            color={PRICE_ALERT_TYPE_COLORS[triggered.alert.alert_type]}
                            variant="outlined"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {formatCurrency(triggered.old_price)} → {formatCurrency(triggered.new_price)}
                          </Typography>
                          <Chip
                            icon={
                              triggered.change_percent < 0 ? (
                                <TrendingDownIcon />
                              ) : (
                                <TrendingUpIcon />
                              )
                            }
                            label={`${triggered.change_percent > 0 ? "+" : ""}${triggered.change_percent.toFixed(1)}%`}
                            size="small"
                            color={triggered.change_percent < 0 ? "success" : "error"}
                            variant="filled"
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {triggered.vendor?.name || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {triggered.acknowledged ? (
                          <Chip
                            icon={<CheckIcon />}
                            label="Acknowledged"
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        ) : (
                          <Chip
                            label="New"
                            size="small"
                            color="warning"
                            variant="filled"
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {!triggered.acknowledged && (
                          <Tooltip title="Acknowledge">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleAcknowledge(triggered.id)}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
