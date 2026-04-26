// Payment Types for Unified Payment Management System

import type { PayerSource } from "./settlement.types";

// ============ COMMON TYPES ============

export type PaymentMode = "upi" | "cash" | "net_banking" | "other";

export type PaymentChannel = "direct" | "engineer_wallet";

export type PaymentSourceType = "daily" | "market";

export type PaymentStatus = "pending" | "partial" | "completed" | "advance";

export type SettlementStatus =
  | "pending_settlement"
  | "pending_confirmation"
  | "confirmed"
  | "disputed";

// ============ DAILY & MARKET PAYMENTS ============

export interface DailyPaymentRecord {
  id: string;
  sourceType: PaymentSourceType;
  sourceId: string; // daily_attendance.id or market_laborer_attendance.id
  date: string;

  // Laborer info
  laborerId: string | null;
  laborerName: string;
  laborerType: "daily" | "contract" | "market";
  category?: string;
  role?: string;
  count?: number; // For market laborers

  // Amount
  amount: number;

  // Payment status
  isPaid: boolean;
  paidVia: PaymentChannel | null;
  paymentDate: string | null;
  paymentMode: PaymentMode | null;
  engineerTransactionId: string | null;
  engineerUserId: string | null; // The engineer's user_id from site_engineer_transactions
  proofUrl: string | null;
  paymentNotes: string | null;
  settlementStatus: "pending_settlement" | "pending_confirmation" | "confirmed" | "disputed" | null;

  // Settlement tracking (from engineer transaction)
  companyProofUrl: string | null; // proof_url - Company sent to engineer
  engineerProofUrl: string | null; // settlement_proof_url - Engineer settled with laborer
  transactionDate: string | null; // When company sent money
  settledDate: string | null; // When engineer settled
  confirmedAt: string | null; // When admin confirmed
  settlementMode: "upi" | "cash" | null; // How engineer settled
  cashReason: string | null; // Reason for cash payment (notes field)

  // Money source tracking
  moneySource: PayerSource | null; // Whose money was used
  moneySourceName: string | null; // Custom name for other_site_money or custom

  // Subcontract linking (optional)
  subcontractId: string | null;
  subcontractTitle: string | null;

  // Expense linking (for cancellation)
  expenseId: string | null;

  // Settlement group linking (new architecture - single source of truth)
  settlementGroupId: string | null;
  settlementReference: string | null;

  // Audit
  recordedBy?: string | null;
  recordedByUserId?: string | null;
  recordedByAvatar?: string | null;
}

export interface DateGroupSummary {
  dailyCount: number;
  dailyTotal: number;
  dailyPending: number;
  dailyPaid: number;
  dailySentToEngineer: number;
  marketCount: number;
  marketTotal: number;
  marketPending: number;
  marketPaid: number;
  marketSentToEngineer: number;
}

export interface DateGroup {
  date: string;
  dateLabel: string; // "Dec 09, 2024"
  dayName: string; // "Monday"
  dailyRecords: DailyPaymentRecord[];
  marketRecords: DailyPaymentRecord[];
  summary: DateGroupSummary;
  isExpanded: boolean;
}

// ============ CONTRACT WEEKLY PAYMENTS ============

export interface DailySalaryEntry {
  date: string;
  dayName: string; // "Sun", "Mon", etc.
  attendanceId: string;
  amount: number;
  workDays: number;
}

export interface LaborerPaymentEntry {
  paymentId: string;
  amount: number;
  paymentDate: string;
  paymentMode: PaymentMode | null;
  weekStart: string; // Which week this payment was for
  paidBy: string;
  paidByUserId: string;
  paidByAvatar: string | null;
  proofUrl: string | null;
  subcontractId: string | null;
}

export interface WeeklyContractLaborer {
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  teamId: string | null;
  teamName: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;

  // Daily breakdown for the week
  dailySalary: DailySalaryEntry[];

  // This week's values
  daysWorked: number;
  weekSalary: number; // Total salary for THIS week
  weekPaid: number; // Amount paid THIS week

  // Running balance (cumulative from contract start)
  previousBalance: number; // Carried over from previous weeks
  cumulativeSalary: number; // Total salary from start
  cumulativePaid: number; // Total paid from start
  runningBalance: number; // cumulativeSalary - cumulativePaid (positive = due, negative = advance)

  // Status indicators
  paymentProgress: number; // Percentage (0-100+, can exceed 100 if advance)
  status: PaymentStatus;

  // Payment history for this laborer (all payments, not just this week)
  payments: LaborerPaymentEntry[];
}

export interface WeekGroupSummary {
  laborerCount: number;
  totalSalary: number;
  totalPaid: number;
  totalDue: number;
  paymentProgress: number; // Percentage
  status: PaymentStatus;
}

export interface WeekGroup {
  weekStart: string; // Sunday date (YYYY-MM-DD)
  weekEnd: string; // Saturday date (YYYY-MM-DD)
  weekLabel: string; // "Dec 01 - Dec 07, 2024"
  laborers: WeeklyContractLaborer[];
  summary: WeekGroupSummary;
  isExpanded: boolean;
}

// ============ PAYMENT DIALOG PROPS ============

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;

  // For Daily/Market payments (bulk)
  dailyRecords?: DailyPaymentRecord[];

  // For Contract Weekly payments (single laborer)
  weeklyPayment?: {
    laborer: WeeklyContractLaborer;
    weekStart: string;
    weekEnd: string;
  };

  // Common options
  allowSubcontractLink?: boolean;
  defaultSubcontractId?: string;
  onSuccess?: () => void;
}

export interface PaymentFormState {
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  selectedEngineerId: string;
  engineerReference: string; // What this payment is for
  subcontractId: string | null;
  proofFile: File | null;
  proofUrl: string | null;
  amount: number; // For partial payments
  isPartialPayment: boolean;
  notes: string;
}

// ============ SUBCONTRACT SELECTOR ============

export interface SubcontractOption {
  id: string;
  title: string;
  totalValue: number;
  totalPaid: number;
  balanceDue: number;
  status: string;
  teamName?: string;
}

// ============ ENGINEER WALLET SETTLEMENT ============

export interface EngineerTransaction {
  id: string;
  engineerId: string;
  engineerName: string;
  engineerAvatar: string | null;
  siteId: string;
  siteName: string;

  // Transaction details
  transactionType: "credit" | "debit" | "spent_on_behalf";
  amount: number;
  transactionDate: string;
  paymentMode: PaymentMode | null;
  proofUrl: string | null;

  // Reference - what this payment is for
  paymentReference: string | null;
  description: string | null;

  // Linked records
  relatedAttendanceIds: string[];
  relatedSubcontractId: string | null;

  // Settlement status
  settlementStatus: SettlementStatus;
  settlementMode: PaymentMode | null;
  settlementProofUrl: string | null;
  settledAt: string | null;

  // Admin confirmation
  confirmedBy: string | null;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  disputeNotes: string | null;

  // Audit
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
}

// ============ MONEY SOURCE SUMMARY ============

export interface MoneySourceSummary {
  source: PayerSource;
  displayName: string; // "Own Money", "Amma Money", etc.
  totalAmount: number;
  transactionCount: number;
  laborerCount: number;
}

// ============ SUMMARY CARDS ============

export interface PaymentSummaryData {
  // Daily/Market totals
  dailyMarketPending: number;
  dailyMarketPendingCount: number;
  dailyMarketSentToEngineer: number;
  dailyMarketSentToEngineerCount: number;
  dailyMarketPaid: number;
  dailyMarketPaidCount: number;

  // Contract weekly totals
  contractWeeklyDue: number;
  contractWeeklyDueLaborerCount: number;
  contractWeeklyPaid: number;

  // By subcontract
  bySubcontract: {
    subcontractId: string;
    subcontractTitle: string;
    totalPaid: number;
    totalDue: number;
  }[];

  // Unlinked (site expenses)
  unlinkedTotal: number;
  unlinkedCount: number;
}

// ============ FILTER STATE ============

export interface PaymentFilterState {
  dateFrom: string;
  dateTo: string;
  status: "all" | "pending" | "sent_to_engineer" | "paid";
  subcontractId: string | "all";
  teamId: string | "all";
}

export interface WeeklyFilterState {
  weeksToShow: number; // Default 4
  subcontractId: string | "all";
  teamId: string | "all";
  status: "all" | "pending" | "completed";
}

// ============ CONTRACT PAYMENT TYPES (NEW) ============

// Payment type for contract payments
// "excess" is used when recording a salary payment with no outstanding balance (overpayment)
export type ContractPaymentType = "salary" | "advance" | "other" | "excess";

// Week allocation record (how salary payments are distributed across weeks)
export interface PaymentWeekAllocation {
  id: string;
  laborPaymentId: string;
  laborerId: string;
  siteId: string;
  weekStart: string;
  weekEnd: string;
  allocatedAmount: number;
  createdAt: string;
}

// Full payment details for ref code popup
export interface PaymentDetails {
  paymentId: string;
  paymentReference: string;
  amount: number;
  paymentType: ContractPaymentType;
  actualPaymentDate: string;
  paymentForDate: string; // Week reference (week start)
  weeksCovered: { weekStart: string; weekEnd: string; allocatedAmount: number }[];
  laborerId: string;
  laborerName: string;
  laborerRole?: string;
  paidBy: string;
  paidByUserId: string;
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  proofUrl: string | null;
  notes: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
  payerSource: string | null;
  payerName: string | null;
  settlementGroupId: string | null;
  settlementReference: string | null;
  createdAt: string;
}

// Contract payment creation config
export interface ContractPaymentConfig {
  siteId: string;
  laborerId: string;
  laborerName: string;
  amount: number;
  paymentType: ContractPaymentType;
  actualPaymentDate: string; // When payment was actually made
  paymentForDate: string; // Week reference (week start date)
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  payerSource: string;
  customPayerName?: string;
  engineerId?: string;
  proofUrl?: string;
  notes?: string;
  subcontractId?: string;
  userId: string;
  userName: string;
}

// Overview summary with advance tracking
export interface ContractLaborerOverview {
  laborerId: string;
  laborerName: string;
  totalSalaryEarned: number; // Cumulative salary from attendance
  totalSalaryPaid: number; // Sum of salary type payments
  totalAdvanceGiven: number; // Sum of advance type payments
  totalAdvanceDeducted: number; // Sum of advance deductions
  pendingAdvance: number; // Advance given minus deducted
  salaryBalance: number; // Salary earned minus paid (positive = due)
  netBalance: number; // Overall balance
  status: "overpaid" | "underpaid" | "settled";
}

// Laborer payment entry extended with new fields
export interface LaborerPaymentEntryExtended extends LaborerPaymentEntry {
  paymentReference: string | null;
  paymentType: ContractPaymentType;
  actualPaymentDate: string;
  settlementReference?: string;
}

// ============ DATE-WISE SETTLEMENT TYPES (NEW) ============

// Settlement type differentiation
export type SettlementType = "date_wise" | "labor_wise" | "weekly";

// Week allocation entry for a single settlement spanning multiple weeks
export interface WeekAllocationEntry {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  allocatedAmount: number;
  laborerCount: number;
  isFullyPaid: boolean;
}

// Date-wise settlement details
export interface DateWiseSettlement {
  settlementGroupId: string;
  settlementReference: string;
  settlementDate: string;
  totalAmount: number;
  weekAllocations: WeekAllocationEntry[];
  paymentMode: PaymentMode | null;
  paymentChannel: PaymentChannel;
  payerSource: string | null;
  payerName: string | null;
  proofUrls: string[];
  notes: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  isCancelled: boolean;
}

// Configuration for creating date-wise settlements
export interface DateWiseSettlementConfig {
  siteId: string;
  settlementDate: string;
  totalAmount: number;
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  payerSource: string;
  customPayerName?: string;
  engineerId?: string;
  proofUrls?: string[];
  notes?: string;
  subcontractId?: string;
  userId: string;
  userName: string;
}

// Result from creating a date-wise settlement
export interface DateWiseSettlementResult {
  success: boolean;
  settlementGroupId: string;
  settlementReference: string;
  totalAmount: number;
  weekAllocations: WeekAllocationEntry[];
  laborPaymentIds: string[];
  error?: string;
}

// Maestri earnings calculation result
export interface MaestriEarningsResult {
  totalDaysWorked: number;
  laborerCount: number;
  marginPerDay: number;
  totalMaestriEarnings: number;
  byWeek: {
    weekStart: string;
    weekEnd: string;
    weekLabel: string;
    daysWorked: number;
    laborerCount: number;
    earnings: number;
  }[];
}

// Extended PaymentDetails with new fields for date-wise view
export interface PaymentDetailsExtended extends PaymentDetails {
  settlementType: SettlementType;
  proofUrls: string[];
  weekAllocations: WeekAllocationEntry[];
}

// Summary for a week row in the table
export interface WeekSettlementSummary {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totalSalary: number;
  totalPaid: number;
  totalDue: number;
  paymentProgress: number;
  status: PaymentStatus;
  laborerCount: number;
  // Date-wise settlements for this week
  settlements: DateWiseSettlement[];
  // All settlement refs for tooltip
  settlementReferences: string[];
}

// ============ CONTRACT LABORER PAYMENT VIEW (NEW UI) ============

// For the laborer-centric view in ContractWeeklyPaymentsTab
export interface ContractLaborerPaymentView {
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  teamId: string | null;
  teamName: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;

  // Cumulative totals from all time
  totalEarned: number;        // Sum of all daily_attendance.daily_earnings
  totalPaid: number;          // Sum of all labor_payments.amount
  outstanding: number;        // totalEarned - totalPaid
  paymentProgress: number;    // Percentage (totalPaid / totalEarned * 100)

  // Status
  status: PaymentStatus;
  lastPaymentDate: string | null;

  // Weekly breakdown for expanded view (read-only)
  weeklyBreakdown: WeekBreakdownEntry[];

  // All settlement/payment references for this laborer (for highlighting)
  settlementReferences: string[];
}

// Individual week data for expanded view
export interface WeekBreakdownEntry {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;          // "Dec 01 - Dec 07, 2024"
  earned: number;             // Salary earned this week
  paid: number;               // Amount allocated to this week
  balance: number;            // earned - paid
  daysWorked: number;
  isPaid: boolean;            // True if balance <= 0
  allocations: {              // Payment allocations to this week
    paymentId: string;
    paymentReference: string | null;
    amount: number;
    paymentDate: string;
  }[];
}

// ============ HELPER TYPES ============

export interface WeekBoundary {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
}

export function getPaymentStatusColor(
  status: PaymentStatus
): "error" | "warning" | "success" | "info" {
  switch (status) {
    case "pending":
      return "error";
    case "partial":
      return "warning";
    case "completed":
      return "success";
    case "advance":
      return "info";
    default:
      return "warning";
  }
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "partial":
      return "Partial";
    case "completed":
      return "Completed";
    case "advance":
      return "Advance Paid";
    default:
      return status;
  }
}

export function getPaymentModeLabel(mode: PaymentMode): string {
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

export function getContractPaymentTypeLabel(type: ContractPaymentType): string {
  switch (type) {
    case "salary":
      return "Salary";
    case "advance":
      return "Advance";
    case "other":
      return "Other";
    default:
      return type;
  }
}

export function getContractPaymentTypeColor(
  type: ContractPaymentType
): "success" | "warning" | "default" {
  switch (type) {
    case "salary":
      return "success";
    case "advance":
      return "warning";
    case "other":
      return "default";
    default:
      return "default";
  }
}

// ============ SCOPE SUMMARY (server-side aggregate) ============

/**
 * Server-side aggregate from get_payment_summary RPC.
 * One row per call regardless of scope size.
 */
export interface PaymentScopeSummary {
  pendingAmount: number;
  pendingDatesCount: number;
  paidAmount: number;
  paidCount: number;
  dailyMarketAmount: number;
  dailyMarketCount: number;
  weeklyAmount: number;
  weeklyCount: number;
}
