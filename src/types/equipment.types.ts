/**
 * Equipment Management Types
 * Type definitions for the Equipment/Asset Management System
 */

// ============================================
// ENUMS AND CONSTANTS
// ============================================

export type EquipmentStatus =
  | "available"
  | "deployed"
  | "under_repair"
  | "lost"
  | "disposed";

export type EquipmentCondition =
  | "excellent"
  | "good"
  | "fair"
  | "needs_repair"
  | "damaged";

export type EquipmentTransferStatus =
  | "pending"
  | "in_transit"
  | "received"
  | "rejected"
  | "cancelled";

export type EquipmentLocationType = "warehouse" | "site";

export type EquipmentPurchaseSource = "online" | "store" | "other";

// How a parent_equipment_id child relates to its parent:
//  - "accessory": a linked part (legacy use, e.g. a lens on a camera)
//  - "variant":   a size of the parent tool (e.g. "10 ft" Matta Palagai)
export type EquipmentParentRelationship = "accessory" | "variant";

export type MaintenanceType = "routine" | "repair" | "overhaul";

export type SimOperator = "airtel" | "jio" | "vi" | "bsnl" | "other";

// Labels for display
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  available: "Available",
  deployed: "Deployed",
  under_repair: "Under Repair",
  lost: "Lost",
  disposed: "Disposed",
};

export const EQUIPMENT_STATUS_COLORS: Record<
  EquipmentStatus,
  "success" | "info" | "warning" | "error" | "default"
> = {
  available: "success",
  deployed: "info",
  under_repair: "warning",
  lost: "error",
  disposed: "default",
};

export const EQUIPMENT_CONDITION_LABELS: Record<EquipmentCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  needs_repair: "Needs Repair",
  damaged: "Damaged",
};

export const EQUIPMENT_CONDITION_COLORS: Record<
  EquipmentCondition,
  "success" | "info" | "warning" | "error" | "default"
> = {
  excellent: "success",
  good: "success",
  fair: "warning",
  needs_repair: "error",
  damaged: "error",
};

export const TRANSFER_STATUS_LABELS: Record<EquipmentTransferStatus, string> = {
  pending: "Pending",
  in_transit: "In Transit",
  received: "Received",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const TRANSFER_STATUS_COLORS: Record<
  EquipmentTransferStatus,
  "success" | "info" | "warning" | "error" | "default"
> = {
  pending: "warning",
  in_transit: "info",
  received: "success",
  rejected: "error",
  cancelled: "default",
};

export const LOCATION_TYPE_LABELS: Record<EquipmentLocationType, string> = {
  warehouse: "Warehouse",
  site: "Site",
};

export const PURCHASE_SOURCE_LABELS: Record<EquipmentPurchaseSource, string> = {
  online: "Online",
  store: "Store/Vendor",
  other: "Other",
};

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  routine: "Routine Maintenance",
  repair: "Repair",
  overhaul: "Overhaul",
};

export const SIM_OPERATOR_LABELS: Record<SimOperator, string> = {
  airtel: "Airtel",
  jio: "Jio",
  vi: "Vi (Vodafone Idea)",
  bsnl: "BSNL",
  other: "Other",
};

// Warehouse locations
export const WAREHOUSE_LOCATIONS = [
  "Storeroom",
  "1st Floor Storage",
  "2nd Floor Storage",
] as const;

export type WarehouseLocation = (typeof WAREHOUSE_LOCATIONS)[number];

// Payment sources (matching existing app pattern)
export const PAYMENT_SOURCES = [
  "company",
  "amma_money",
  "engineer_own",
  "client_money",
  "other",
] as const;

export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  company: "Company",
  amma_money: "Amma Money",
  engineer_own: "Engineer Own",
  client_money: "Client Money",
  other: "Other",
};

// ============================================
// BASE TYPES
// ============================================

export interface EquipmentCategory {
  id: string;
  name: string;
  code: string;
  code_prefix: string;
  description: string | null;
  parent_id: string | null;
  display_order: number;
  icon: string | null;
  default_maintenance_interval_days: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  equipment_code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  status: EquipmentStatus;
  condition: EquipmentCondition | null;

  // Location
  current_location_type: EquipmentLocationType;
  current_site_id: string | null;
  warehouse_location: string | null;
  deployed_at: string | null;

  // Responsibility
  responsible_user_id: string | null;
  responsible_laborer_id: string | null;

  // Purchase info
  purchase_date: string | null;
  purchase_cost: number | null;
  purchase_vendor_id: string | null;
  purchase_source: EquipmentPurchaseSource | null;
  payment_source: string | null;
  warranty_expiry_date: string | null;

  // Identification
  serial_number: string | null;
  model_number: string | null;
  brand: string | null;
  manufacturer: string | null;

  // Accessory / variant linking (see parent_relationship)
  parent_equipment_id: string | null;
  parent_relationship: EquipmentParentRelationship | null;
  variant_label: string | null;

  // Additional specs
  specifications: Record<string, unknown>;
  camera_details: CameraDetails | null;

  // Photos
  photos: string[];
  primary_photo_url: string | null;

  // Maintenance
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  maintenance_interval_days: number | null;

  // Notes
  notes: string | null;

  // Audit
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CameraDetails {
  sim_id?: string | null;
  memory_card_id?: string | null;
  camera_model?: string | null;
  camera_brand?: string | null;
  resolution?: string | null;
  has_night_vision?: boolean;
  has_motion_detection?: boolean;
  has_audio?: boolean;
  ip_address?: string | null;
  rtsp_url?: string | null;
}

export interface EquipmentTransfer {
  id: string;
  transfer_number: string | null;
  equipment_id: string;

  // From location
  from_location_type: EquipmentLocationType;
  from_site_id: string | null;
  from_warehouse_location: string | null;
  from_responsible_user_id: string | null;
  from_responsible_laborer_id: string | null;

  // To location
  to_location_type: EquipmentLocationType;
  to_site_id: string | null;
  to_warehouse_location: string | null;
  to_responsible_user_id: string | null;
  to_responsible_laborer_id: string | null;

  // Transfer details
  transfer_date: string;
  received_date: string | null;
  status: EquipmentTransferStatus;
  reason: string | null;
  notes: string | null;

  // Condition verification
  condition_at_handover: EquipmentCondition | null;
  condition_at_receipt: EquipmentCondition | null;
  is_working: boolean;
  condition_notes: string | null;

  // Photos
  handover_photos: string[];
  receiving_photos: string[];

  // Workflow
  initiated_by: string | null;
  initiated_at: string;
  verified_by: string | null;
  verified_at: string | null;
  received_by: string | null;
  received_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  // Audit
  created_at: string;
  updated_at: string;
}

export interface EquipmentMaintenance {
  id: string;
  equipment_id: string;
  maintenance_date: string;
  maintenance_type: MaintenanceType;
  description: string | null;
  cost: number | null;
  vendor_id: string | null;
  condition_before: EquipmentCondition | null;
  condition_after: EquipmentCondition | null;
  next_maintenance_date: string | null;
  receipt_url: string | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SimCard {
  id: string;
  phone_number: string;
  operator: SimOperator;
  sim_serial_number: string | null;
  is_data_sim: boolean;
  monthly_plan: string | null;
  purchase_date: string | null;
  notes: string | null;
  assigned_equipment_id: string | null;
  assigned_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SimRecharge {
  id: string;
  sim_card_id: string;
  recharge_date: string;
  amount: number;
  validity_days: number | null;
  validity_end_date: string | null;
  plan_description: string | null;
  payment_mode: string | null;
  payment_reference: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface MemoryCard {
  id: string;
  capacity_gb: number;
  brand: string | null;
  model: string | null;
  speed_class: string | null;
  serial_number: string | null;
  notes: string | null;
  assigned_equipment_id: string | null;
  assigned_at: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface SimAssignmentHistory {
  id: string;
  sim_card_id: string;
  equipment_id: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  notes: string | null;
  created_by: string | null;
}

// ============================================
// EXTENDED TYPES WITH RELATIONSHIPS
// ============================================

export interface EquipmentWithDetails extends Equipment {
  category?: EquipmentCategory | null;
  current_site?: { id: string; name: string } | null;
  responsible_user?: { id: string; auth_id: string; name: string; email: string } | null;
  responsible_laborer?: { id: string; name: string; phone: string | null } | null;
  purchase_vendor?: { id: string; name: string } | null;
  parent_equipment?: { id: string; equipment_code: string; name: string } | null;
  accessories?: Equipment[];
  variants?: Equipment[];
  sim_card?: SimCard | null;
  memory_card?: MemoryCard | null;
  transfer_count?: number;
  maintenance_count?: number;
  days_at_current_location?: number;
  days_since_last_maintenance?: number;
  maintenance_status?: "overdue" | "due_soon" | "ok" | "na";
}

export interface EquipmentTransferWithDetails extends EquipmentTransfer {
  equipment?: Equipment;
  from_site?: { id: string; name: string } | null;
  to_site?: { id: string; name: string } | null;
  initiated_by_user?: { id: string; auth_id: string; name: string } | null;
  verified_by_user?: { id: string; auth_id: string; name: string } | null;
  received_by_user?: { id: string; auth_id: string; name: string } | null;
  from_responsible_user?: { id: string; auth_id: string; name: string } | null;
  to_responsible_user?: { id: string; auth_id: string; name: string } | null;
  from_responsible_laborer?: { id: string; name: string } | null;
  to_responsible_laborer?: { id: string; name: string } | null;
}

export interface EquipmentMaintenanceWithDetails extends EquipmentMaintenance {
  equipment?: Equipment;
  vendor?: { id: string; name: string } | null;
  created_by_user?: { id: string; auth_id: string; name: string } | null;
}

export interface SimCardWithDetails extends SimCard {
  assigned_equipment?: { id: string; equipment_code: string; name: string } | null;
  latest_recharge?: SimRecharge | null;
  current_validity_end?: string | null;
  is_expiring_soon?: boolean;
  days_until_expiry?: number | null;
}

export interface MemoryCardWithDetails extends MemoryCard {
  assigned_equipment?: { id: string; equipment_code: string; name: string } | null;
}

// ============================================
// FORM DATA TYPES
// ============================================

export interface EquipmentFormData {
  name: string;
  description?: string;
  category_id: string;

  // Location
  current_location_type: EquipmentLocationType;
  current_site_id?: string;
  warehouse_location?: string;

  // Responsibility (initial)
  responsible_user_id?: string;
  responsible_laborer_id?: string;

  // Purchase info
  purchase_date?: string;
  purchase_cost?: number;
  purchase_vendor_id?: string;
  purchase_source?: EquipmentPurchaseSource;
  payment_source?: string;
  warranty_expiry_date?: string;

  // Identification
  serial_number?: string;
  model_number?: string;
  brand?: string;
  manufacturer?: string;

  // Accessory / variant
  parent_equipment_id?: string;
  parent_relationship?: EquipmentParentRelationship;
  variant_label?: string;

  // Additional specs
  specifications?: Record<string, unknown>;

  // Photos
  photos?: string[];
  primary_photo_url?: string;

  // Maintenance
  maintenance_interval_days?: number;

  // Notes
  notes?: string;
}

// ---- Per-store price comparison (buy-side quotes per tool/size) ----
export interface EquipmentVendorPrice {
  id: string;
  company_id: string;
  equipment_id: string;
  vendor_id: string | null;
  store_name: string | null;
  price: number;
  recorded_date: string;
  bill_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EquipmentVendorPriceWithDetails extends EquipmentVendorPrice {
  vendor?: { id: string; name: string } | null;
  // The size this price is for (when grouping a parent tool's variants)
  variant_label?: string | null;
  equipment_name?: string | null;
}

export interface EquipmentVendorPriceFormData {
  equipment_id: string;
  vendor_id?: string;
  store_name?: string;
  price: number;
  recorded_date?: string;
  bill_url?: string;
  notes?: string;
}

export interface CameraFormData extends EquipmentFormData {
  camera_model?: string;
  camera_brand?: string;
  resolution?: string;
  has_night_vision?: boolean;
  has_motion_detection?: boolean;
  has_audio?: boolean;
  sim_card_id?: string;
  memory_card_id?: string;
}

export interface EquipmentTransferFormData {
  equipment_id: string;
  to_location_type: EquipmentLocationType;
  to_site_id?: string;
  to_warehouse_location?: string;
  to_responsible_user_id?: string;
  to_responsible_laborer_id?: string;
  transfer_date: string;
  condition_at_handover?: EquipmentCondition;
  reason?: string;
  notes?: string;
  handover_photos?: string[];
}

export interface EquipmentReceiveFormData {
  transfer_id: string;
  condition_at_receipt: EquipmentCondition;
  is_working: boolean;
  condition_notes?: string;
  receiving_photos?: string[];
}

export interface EquipmentMaintenanceFormData {
  equipment_id: string;
  maintenance_date: string;
  maintenance_type: MaintenanceType;
  description?: string;
  cost?: number;
  vendor_id?: string;
  condition_before?: EquipmentCondition;
  condition_after?: EquipmentCondition;
  next_maintenance_date?: string;
  receipt_url?: string;
  performed_by?: string;
  notes?: string;
}

export interface SimCardFormData {
  phone_number: string;
  operator: SimOperator;
  sim_serial_number?: string;
  is_data_sim: boolean;
  monthly_plan?: string;
  purchase_date?: string;
  notes?: string;
  assigned_equipment_id?: string;
}

export interface SimRechargeFormData {
  sim_card_id: string;
  recharge_date: string;
  amount: number;
  validity_days?: number;
  validity_end_date?: string;
  plan_description?: string;
  payment_mode?: string;
  payment_reference?: string;
  receipt_url?: string;
  notes?: string;
}

export interface MemoryCardFormData {
  capacity_gb: number;
  brand?: string;
  model?: string;
  speed_class?: string;
  serial_number?: string;
  notes?: string;
  assigned_equipment_id?: string;
}

// ============================================
// FILTER TYPES
// ============================================

export interface EquipmentFilterState {
  category_id?: string;
  status?: EquipmentStatus | "all";
  condition?: EquipmentCondition | "all";
  location_type?: EquipmentLocationType | "all";
  site_id?: string;
  maintenance_status?: "overdue" | "due_soon" | "ok" | "all";
  search?: string;
  include_accessories?: boolean;
}

export interface EquipmentTransferFilterState {
  equipment_id?: string;
  site_id?: string;
  status?: EquipmentTransferStatus | "all";
  date_from?: string;
  date_to?: string;
}

// ============================================
// SUMMARY/DASHBOARD TYPES
// ============================================

export interface EquipmentSummary {
  total_count: number;
  available_count: number;
  deployed_count: number;
  under_repair_count: number;
  lost_count: number;
  disposed_count: number;
  by_category: { category_id: string; category_name: string; count: number }[];
  by_site: { site_id: string; site_name: string; count: number }[];
}

export interface MaintenanceAlertSummary {
  overdue_count: number;
  due_soon_count: number;
  overdue_equipment: EquipmentWithDetails[];
  due_soon_equipment: EquipmentWithDetails[];
}

export interface SimAlertSummary {
  expiring_soon_count: number;
  expired_count: number;
  expiring_sims: SimCardWithDetails[];
}

export interface PendingTransferSummary {
  pending_count: number;
  in_transit_count: number;
  pending_transfers: EquipmentTransferWithDetails[];
}
