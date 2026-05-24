"use client";

/**
 * Centralized dialog router for the Rental Hub v2.
 *
 * When a thread row's action button (or an action-queue button) is clicked,
 * the Hub page hands the thread + an optional explicit intent to
 * `openForThread()`, and we open the right existing dialog with the original
 * production row (`RentalOrderWithDetails`) it expects.
 *
 * Intent routing (mirror of nextAction.ts intent values):
 *   approve, confirm        → ApproveRentalDialog (fresh v2)
 *   verify-delivery         → VerifyDeliveryDialog (fresh v2)
 *   record-return           → RentalReturnDialog (reuse v1)
 *   add-advance             → RentalAdvanceDialog (reuse v1)
 *   extend                  → DateExtensionDialog (reuse v1)
 *   settle-vendor / -in / -out → (TBD in Step 7 — MultiPartySettlementDialog)
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import { RentalReturnDialog, RentalAdvanceDialog } from "@/components/rentals";
import { DateExtensionDialog } from "@/components/rentals/DateExtensionDialog";
import { MultiPartySettlementDialog } from "@/components/rentals/MultiPartySettlementDialog";
import ApproveRentalDialog from "./ApproveRentalDialog";
import VerifyDeliveryDialog from "./VerifyDeliveryDialog";
import { nextAction, type NextActionIntent } from "@/lib/rental-hub/nextAction";
import type {
  RentalOrderWithDetails,
  RentalSettlementPartyType,
} from "@/types/rental.types";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

const SETTLE_INTENT_TO_PARTY: Record<string, RentalSettlementPartyType> = {
  "settle-vendor": "vendor",
  "settle-transport-in": "transport_inbound",
  "settle-transport-out": "transport_outbound",
};

type OpenDialog =
  | { kind: "approve"; order: RentalOrderWithDetails }
  | { kind: "verify-delivery"; order: RentalOrderWithDetails }
  | { kind: "record-return"; order: RentalOrderWithDetails }
  | { kind: "add-advance"; order: RentalOrderWithDetails }
  | { kind: "extend"; order: RentalOrderWithDetails }
  | {
      kind: "settle";
      order: RentalOrderWithDetails;
      focusedPartyType?: RentalSettlementPartyType;
    };

export interface RentalHubDialogRouterHandle {
  /** Open the right dialog for the thread, using either the explicit intent
   *  or the thread's current nextAction intent if none provided. */
  openForThread(thread: RentalThread, intent?: NextActionIntent): void;
}

export interface RentalHubDialogRouterProps {
  rentalOrderById: Map<string, RentalOrderWithDetails>;
}

export const RentalHubDialogRouter = forwardRef<
  RentalHubDialogRouterHandle,
  RentalHubDialogRouterProps
>(function RentalHubDialogRouter({ rentalOrderById }, ref) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  useImperativeHandle(ref, () => ({
    openForThread(thread, intent) {
      const order = rentalOrderById.get(thread.source_row_id);
      if (!order) return;

      const resolved = intent ?? nextAction(thread)?.intent;
      if (!resolved) return;

      switch (resolved) {
        case "approve":
        case "confirm":
          setDialog({ kind: "approve", order });
          return;
        case "verify-delivery":
          setDialog({ kind: "verify-delivery", order });
          return;
        case "record-return":
          setDialog({ kind: "record-return", order });
          return;
        case "add-advance":
          setDialog({ kind: "add-advance", order });
          return;
        case "extend":
          setDialog({ kind: "extend", order });
          return;
        case "settle-vendor":
        case "settle-transport-in":
        case "settle-transport-out":
          setDialog({
            kind: "settle",
            order,
            focusedPartyType: SETTLE_INTENT_TO_PARTY[resolved],
          });
          return;
      }
    },
  }));

  const close = () => setDialog(null);

  // Read the current dialog kind once so we don't unmount-remount each render.
  const approveOrder = dialog?.kind === "approve" ? dialog.order : null;
  const verifyOrder = dialog?.kind === "verify-delivery" ? dialog.order : null;
  const returnOrder = dialog?.kind === "record-return" ? dialog.order : null;
  const advanceOrder = dialog?.kind === "add-advance" ? dialog.order : null;
  const extendOrder = dialog?.kind === "extend" ? dialog.order : null;
  const settleOrder = dialog?.kind === "settle" ? dialog.order : null;
  const settleFocusedParty =
    dialog?.kind === "settle" ? dialog.focusedPartyType : undefined;

  return (
    <>
      <ApproveRentalDialog
        open={dialog?.kind === "approve"}
        onClose={close}
        order={approveOrder}
      />

      <VerifyDeliveryDialog
        open={dialog?.kind === "verify-delivery"}
        onClose={close}
        order={verifyOrder}
      />

      {returnOrder && (
        <RentalReturnDialog
          open={dialog?.kind === "record-return"}
          onClose={close}
          order={returnOrder}
        />
      )}

      {advanceOrder && (
        <RentalAdvanceDialog
          open={dialog?.kind === "add-advance"}
          onClose={close}
          order={advanceOrder}
        />
      )}

      {extendOrder && (
        <DateExtensionDialog
          open={dialog?.kind === "extend"}
          onClose={close}
          orderId={extendOrder.id}
          orderNumber={extendOrder.rental_order_number}
          currentExpectedReturnDate={
            extendOrder.expected_return_date ??
            new Date().toISOString().split("T")[0]
          }
        />
      )}

      {settleOrder && (
        <MultiPartySettlementDialog
          open={dialog?.kind === "settle"}
          onClose={close}
          order={settleOrder}
          focusedPartyType={settleFocusedParty}
        />
      )}
    </>
  );
});
