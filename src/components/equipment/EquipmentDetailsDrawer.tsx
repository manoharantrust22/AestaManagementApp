"use client";

import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
  Button,
  Avatar,
  List,
  ListItem,
  ListItemText,
  Grid,
  Paper,
  Stack,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  SwapHoriz as TransferIcon,
  Build as MaintenanceIcon,
  Inventory2 as AccessoryIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useEquipmentTransfers } from "@/hooks/queries/useEquipment";
import { formatCurrency, formatDate } from "@/lib/formatters";
import MaintenanceAlertBadge from "./MaintenanceAlertBadge";
import EquipmentVariantPrices from "./EquipmentVariantPrices";
import type { EquipmentWithDetails } from "@/types/equipment.types";
import {
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_COLORS,
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_CONDITION_COLORS,
  LOCATION_TYPE_LABELS,
  PURCHASE_SOURCE_LABELS,
  PAYMENT_SOURCE_LABELS,
  SIM_OPERATOR_LABELS,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_COLORS,
} from "@/types/equipment.types";

interface EquipmentDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  equipment: EquipmentWithDetails | null;
  onEdit?: (equipment: EquipmentWithDetails) => void;
  onTransfer?: (equipment: EquipmentWithDetails) => void;
  onMaintenance?: (equipment: EquipmentWithDetails) => void;
  onAddVariant?: (parent: EquipmentWithDetails) => void;
}

export default function EquipmentDetailsDrawer({
  open,
  onClose,
  equipment,
  onEdit,
  onTransfer,
  onMaintenance,
  onAddVariant,
}: EquipmentDetailsDrawerProps) {
  const isMobile = useIsMobile();
  const { data: transfers = [] } = useEquipmentTransfers(equipment?.id);
  // onEdit is only supplied to this drawer when the user has edit permission.
  const canEdit = !!onEdit;

  if (!equipment) {
    return null;
  }

  const InfoRow = ({
    label,
    value,
    chip,
  }: {
    label: string;
    value?: string | number | null;
    chip?: React.ReactNode;
  }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      {chip || (
        <Typography variant="body2" fontWeight="medium">
          {value || "-"}
        </Typography>
      )}
    </Box>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: isMobile ? "100%" : 450 },
      }}
    >
      <Box sx={{ p: 2 }}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            {equipment?.primary_photo_url && (
              <Avatar
                src={equipment.primary_photo_url}
                alt={equipment.name}
                sx={{ width: 60, height: 60 }}
                variant="rounded"
              />
            )}
            <Box>
              <Typography variant="h6">{equipment?.equipment_code}</Typography>
              <Typography variant="body1">{equipment?.name}</Typography>
              {equipment?.brand && (
                <Typography variant="caption" color="text.secondary">
                  {equipment.brand}
                  {equipment.model_number && ` - ${equipment.model_number}`}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Status badges */}
        {equipment && (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip
              label={EQUIPMENT_STATUS_LABELS[equipment.status]}
              color={EQUIPMENT_STATUS_COLORS[equipment.status]}
              size="small"
            />
            {equipment.condition && (
              <Chip
                label={EQUIPMENT_CONDITION_LABELS[equipment.condition]}
                color={EQUIPMENT_CONDITION_COLORS[equipment.condition]}
                size="small"
                variant="outlined"
              />
            )}
            <MaintenanceAlertBadge equipment={equipment} showLabel />
          </Stack>
        )}

        {/* Action buttons */}
        {(onEdit || onTransfer || onMaintenance) && (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            {onEdit && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => onEdit(equipment)}
              >
                Edit
              </Button>
            )}
            {onTransfer && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<TransferIcon />}
                onClick={() => onTransfer(equipment)}
                disabled={
                  equipment.status === "lost" || equipment.status === "disposed"
                }
              >
                Transfer
              </Button>
            )}
            {onMaintenance && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<MaintenanceIcon />}
                onClick={() => onMaintenance(equipment)}
                color={
                  equipment.maintenance_status === "overdue"
                    ? "error"
                    : equipment.maintenance_status === "due_soon"
                    ? "warning"
                    : "primary"
                }
              >
                Maintenance
              </Button>
            )}
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Location */}
        <Typography variant="subtitle2" gutterBottom>
          Current Location
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <InfoRow
            label="Location Type"
            value={
              equipment?.current_location_type
                ? LOCATION_TYPE_LABELS[equipment.current_location_type]
                : "-"
            }
          />
          {equipment?.current_location_type === "site" ? (
            <InfoRow label="Site" value={equipment.current_site?.name} />
          ) : (
            <InfoRow
              label="Storage Area"
              value={equipment?.warehouse_location}
            />
          )}
          {equipment?.deployed_at && (
            <InfoRow
              label="Deployed Since"
              value={formatDate(equipment.deployed_at)}
            />
          )}
          {equipment?.days_at_current_location !== undefined && (
            <InfoRow
              label="Days at Location"
              value={`${equipment.days_at_current_location} days`}
            />
          )}
        </Paper>

        {/* Responsibility */}
        <Typography variant="subtitle2" gutterBottom>
          Responsibility
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          {equipment?.responsible_user ? (
            <InfoRow
              label="Responsible Person"
              value={equipment.responsible_user.name}
            />
          ) : equipment?.responsible_laborer ? (
            <InfoRow
              label="Responsible Person"
              value={equipment.responsible_laborer.name}
            />
          ) : (
            <InfoRow label="Responsible Person" value="Not assigned" />
          )}
        </Paper>

        {/* Purchase Info */}
        <Typography variant="subtitle2" gutterBottom>
          Purchase Information
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <InfoRow label="Purchase Date" value={formatDate(equipment?.purchase_date)} />
          <InfoRow
            label="Purchase Cost"
            value={
              equipment?.purchase_cost
                ? formatCurrency(equipment.purchase_cost)
                : "-"
            }
          />
          <InfoRow
            label="Source"
            value={
              equipment?.purchase_source
                ? PURCHASE_SOURCE_LABELS[equipment.purchase_source]
                : "-"
            }
          />
          {equipment?.purchase_vendor && (
            <InfoRow label="Vendor" value={equipment.purchase_vendor.name} />
          )}
          {equipment?.payment_source && (
            <InfoRow
              label="Payment Source"
              value={
                PAYMENT_SOURCE_LABELS[
                  equipment.payment_source as keyof typeof PAYMENT_SOURCE_LABELS
                ] || equipment.payment_source
              }
            />
          )}
          <InfoRow
            label="Warranty Expiry"
            value={formatDate(equipment?.warranty_expiry_date)}
          />
        </Paper>

        {/* Maintenance */}
        <Typography variant="subtitle2" gutterBottom>
          Maintenance
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <InfoRow
            label="Last Maintenance"
            value={formatDate(equipment?.last_maintenance_date)}
          />
          <InfoRow
            label="Next Maintenance"
            value={formatDate(equipment?.next_maintenance_date)}
          />
          <InfoRow
            label="Maintenance Interval"
            value={
              equipment?.maintenance_interval_days
                ? `${equipment.maintenance_interval_days} days`
                : "Default (90 days)"
            }
          />
          <InfoRow
            label="Total Maintenance Records"
            value={equipment?.maintenance_count || 0}
          />
        </Paper>

        {/* SIM Card (for cameras) */}
        {equipment?.sim_card && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              SIM Card
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <InfoRow label="Phone Number" value={equipment.sim_card.phone_number} />
              <InfoRow
                label="Operator"
                value={SIM_OPERATOR_LABELS[equipment.sim_card.operator]}
              />
              <InfoRow label="Plan" value={equipment.sim_card.monthly_plan} />
            </Paper>
          </>
        )}

        {/* Memory Card (for cameras) */}
        {equipment?.memory_card && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Memory Card
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <InfoRow
                label="Capacity"
                value={`${equipment.memory_card.capacity_gb} GB`}
              />
              <InfoRow label="Brand" value={equipment.memory_card.brand} />
              <InfoRow label="Speed Class" value={equipment.memory_card.speed_class} />
            </Paper>
          </>
        )}

        {/* Sizes / Variants */}
        {((equipment?.variants && equipment.variants.length > 0) || onAddVariant) &&
          equipment?.parent_relationship !== "variant" && (
            <>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2">
                  Sizes / Variants
                  {equipment?.variants && equipment.variants.length > 0
                    ? ` (${equipment.variants.length})`
                    : ""}
                </Typography>
                {onAddVariant && (
                  <Button size="small" onClick={() => onAddVariant(equipment)}>
                    Add size
                  </Button>
                )}
              </Box>
              {equipment?.variants && equipment.variants.length > 0 ? (
                <Paper variant="outlined" sx={{ mb: 2 }}>
                  <List dense disablePadding>
                    {equipment.variants.map((v) => (
                      <ListItem key={v.id} divider>
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography variant="body2">
                                {v.variant_label || v.name}
                              </Typography>
                              <Typography variant="body2" fontWeight="medium">
                                {v.purchase_cost != null
                                  ? formatCurrency(v.purchase_cost)
                                  : "—"}
                              </Typography>
                            </Box>
                          }
                          secondary={v.equipment_code}
                          primaryTypographyProps={{ component: "div" }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              ) : (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 2 }}
                >
                  No sizes added yet.
                </Typography>
              )}
            </>
          )}

        {/* Store Prices (per size / tool) — buy-side comparison */}
        {equipment?.parent_relationship !== "variant" && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Store Prices
            </Typography>
            <Box sx={{ mb: 2 }}>
              <EquipmentVariantPrices equipment={equipment} canEdit={canEdit} />
            </Box>
          </>
        )}

        {/* Accessories */}
        {equipment?.accessories && equipment.accessories.length > 0 && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Accessories ({equipment.accessories.length})
            </Typography>
            <Paper variant="outlined" sx={{ mb: 2 }}>
              <List dense disablePadding>
                {equipment.accessories.map((acc) => (
                  <ListItem key={acc.id} divider>
                    <ListItemText
                      primary={`${acc.equipment_code} - ${acc.name}`}
                      secondary={acc.brand}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </>
        )}

        {/* Transfer History */}
        {transfers.length > 0 && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Transfer History ({transfers.length})
            </Typography>
            <Paper variant="outlined" sx={{ mb: 2 }}>
              <List dense disablePadding>
                {transfers.slice(0, 5).map((transfer) => (
                  <ListItem key={transfer.id} divider>
                    <ListItemText
                      primary={
                        <Box
                          sx={{ display: "flex", justifyContent: "space-between" }}
                        >
                          <Typography variant="body2">
                            {transfer.transfer_number}
                          </Typography>
                          <Chip
                            label={TRANSFER_STATUS_LABELS[transfer.status]}
                            color={TRANSFER_STATUS_COLORS[transfer.status]}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <>
                          {formatDate(transfer.transfer_date)} -{" "}
                          {transfer.from_location_type === "site"
                            ? transfer.from_site?.name
                            : "Warehouse"}{" "}
                          →{" "}
                          {transfer.to_location_type === "site"
                            ? transfer.to_site?.name
                            : "Warehouse"}
                        </>
                      }
                      primaryTypographyProps={{ component: "div" }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </>
        )}

        {/* Notes */}
        {equipment?.notes && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Notes
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <Typography variant="body2">{equipment.notes}</Typography>
            </Paper>
          </>
        )}
      </Box>
    </Drawer>
  );
}
