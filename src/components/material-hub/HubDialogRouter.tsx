"use client";

/**
 * Centralized dialog router for the Material Hub.
 *
 * When a thread row's action button is clicked, the Hub page hands the thread
 * to `openForThread()` and we open the right existing dialog — passing the
 * original source row (MaterialRequestWithDetails / PurchaseOrderWithDetails /
 * spot batch id) that the dialog expects.
 *
 * Wires the prototype's reducer actions onto existing production dialogs:
 *   approve / reject     → RequestApprovalDialog
 *   create-po            → UnifiedPurchaseOrderDialog (request mode)
 *   record-delivery      → RecordAndVerifyDeliveryDialog
 *   settle-vendor        → MaterialSettlementDialog
 *   log-usage            → RecordBatchUsageDialog
 *   finalize-allocation  → SpotPurchaseAllocatorDialog
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import RequestApprovalDialog from "@/components/materials/RequestApprovalDialog";
import UnifiedPurchaseOrderDialog from "@/components/materials/UnifiedPurchaseOrderDialog";
import RecordAndVerifyDeliveryDialog from "@/components/materials/RecordAndVerifyDeliveryDialog";
import MaterialSettlementDialog from "@/components/materials/MaterialSettlementDialog";
import RecordBatchUsageDialog from "@/components/materials/RecordBatchUsageDialog";
import { SpotPurchaseAllocatorDialog } from "@/components/materials/SpotPurchaseAllocatorDialog";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";
import type {
  MaterialRequestWithDetails,
  PurchaseOrderWithDetails,
} from "@/types/material.types";

type OpenDialog =
  | { kind: "approve"; mr: MaterialRequestWithDetails }
  | { kind: "create-po"; mr: MaterialRequestWithDetails }
  | { kind: "record-delivery"; po: PurchaseOrderWithDetails }
  | { kind: "settle"; po: PurchaseOrderWithDetails }
  | { kind: "log-usage"; batchRefCode?: string }
  | { kind: "finalize-spot"; batchId: string; refCode: string; totalAmount: number };

export interface HubDialogRouterHandle {
  /** Open the right dialog for the thread's next action. */
  openForThread(thread: MaterialThread): void;
}

export interface HubDialogRouterProps {
  siteId: string;
  siteGroupId: string | null;
  materialRequestById: Map<string, MaterialRequestWithDetails>;
  purchaseOrderById: Map<string, PurchaseOrderWithDetails>;
}

export const HubDialogRouter = forwardRef<
  HubDialogRouterHandle,
  HubDialogRouterProps
>(function HubDialogRouter(
  { siteId, siteGroupId, materialRequestById, purchaseOrderById },
  ref
) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  useImperativeHandle(ref, () => ({
    openForThread(thread) {
      // Spot — provisional group needs finalize.
      if (thread.purchase_type === "spot") {
        if (thread.kind === "group" && thread.spot_stage === "provisional") {
          setDialog({
            kind: "finalize-spot",
            batchId: thread.source_row_id,
            refCode: thread.id,
            totalAmount: thread.spot?.amount ?? 0,
          });
        }
        return;
      }

      // Standard flow — route by stage.
      if (thread.stage === "requested") {
        const mr = materialRequestById.get(thread.source_row_id);
        if (mr) setDialog({ kind: "approve", mr });
        return;
      }
      if (thread.stage === "approved") {
        const mr = materialRequestById.get(thread.source_row_id);
        if (mr) setDialog({ kind: "create-po", mr });
        return;
      }
      if (thread.stage === "ordered") {
        const po = thread.po && purchaseOrderById.get(thread.po.id);
        if (po) setDialog({ kind: "record-delivery", po });
        return;
      }
      if (
        thread.stage === "delivered" &&
        (!thread.settlement || thread.settlement.status === "pending")
      ) {
        const po = thread.po && purchaseOrderById.get(thread.po.id);
        if (po) setDialog({ kind: "settle", po });
        return;
      }
      if (thread.stage === "in-use") {
        setDialog({ kind: "log-usage", batchRefCode: thread.inventory?.batch });
      }
    },
  }));

  const close = () => setDialog(null);

  return (
    <>
      <RequestApprovalDialog
        open={dialog?.kind === "approve"}
        onClose={close}
        request={dialog?.kind === "approve" ? dialog.mr : null}
      />

      <UnifiedPurchaseOrderDialog
        open={dialog?.kind === "create-po"}
        onClose={close}
        siteId={siteId}
        request={dialog?.kind === "create-po" ? dialog.mr : null}
      />

      <RecordAndVerifyDeliveryDialog
        open={dialog?.kind === "record-delivery"}
        onClose={close}
        siteId={siteId}
        purchaseOrder={dialog?.kind === "record-delivery" ? dialog.po : null}
      />

      <MaterialSettlementDialog
        open={dialog?.kind === "settle"}
        onClose={close}
        purchaseOrder={dialog?.kind === "settle" ? dialog.po : null}
      />

      <RecordBatchUsageDialog
        open={dialog?.kind === "log-usage"}
        onClose={close}
        siteId={siteId}
        preselectedBatchRefCode={
          dialog?.kind === "log-usage" ? dialog.batchRefCode : undefined
        }
      />

      <SpotPurchaseAllocatorDialog
        open={dialog?.kind === "finalize-spot"}
        onClose={close}
        batchId={dialog?.kind === "finalize-spot" ? dialog.batchId : null}
        siteGroupId={siteGroupId}
        refCode={dialog?.kind === "finalize-spot" ? dialog.refCode : null}
        totalAmount={dialog?.kind === "finalize-spot" ? dialog.totalAmount : null}
      />
    </>
  );
});
