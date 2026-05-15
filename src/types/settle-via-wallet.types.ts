import type { ReactNode } from "react";
import type { PayerSource } from "./settlement.types";

export interface SettleViaWalletPayload {
  amount: number;
  notes?: string;
  payerSource: PayerSource;
  customPayerName?: string;
  subcontractId?: string | null;
  proofUrl?: string | null;
  siteId: string;
  engineerId: string;
  /**
   * ISO date (YYYY-MM-DD) the user selected for the payment. Defaults to
   * today. Callers that wire the dialog into mutations accepting an explicit
   * settlement date should forward this; daily/market flows that derive the
   * date from attendance rows can ignore it (they should also set
   * `showPaymentDate={false}` so users don't see a misleading picker).
   */
  paymentDate: string;
}

export interface SettleViaWalletDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;

  siteId: string;
  engineerId: string;

  amount: number;
  editableAmount?: boolean;
  maxAmount?: number;

  title?: string;
  summary?: string;
  renderSummary?: () => ReactNode;

  enablePayerSourceOverride?: boolean;
  defaultPayerSource?: PayerSource;

  enableSubcontractLink?: boolean;
  initialSubcontractId?: string | null;

  showNotes?: boolean;
  showProofUpload?: boolean;
  /**
   * Render the Payment date picker. Default true (today, capped at today).
   * Pass false when the underlying mutation derives the date from another
   * source (e.g. daily/market settlements use attendance row dates).
   */
  showPaymentDate?: boolean;

  onConfirm: (payload: SettleViaWalletPayload) => Promise<void>;
  allowPartial?: boolean;
}

export interface WalletBalanceCardProps {
  amount: number;
  balance: number;
  isLoading: boolean;
  sourceLabel?: string;
  hasNoDeposit: boolean;
  isInsufficient: boolean;

  payerSource: PayerSource;
  customName: string;
  showOverride: boolean;
  onToggleOverride: () => void;
  onPayerSourceChange: (s: PayerSource) => void;
  onCustomNameChange: (n: string) => void;
  enableOverride?: boolean;
  siteId: string;
}
