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
 *   log-usage            → WaterfallUsageDialog (material-scoped, oldest→newest)
 *   finalize-allocation  → SpotPurchaseAllocatorDialog
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import { Backdrop, CircularProgress, Snackbar, Alert, Button } from "@mui/material";
import RequestApprovalDialog from "@/components/materials/RequestApprovalDialog";
import UnifiedPurchaseOrderDialog from "@/components/materials/UnifiedPurchaseOrderDialog";
import RecordAndVerifyDeliveryDialog from "@/components/materials/RecordAndVerifyDeliveryDialog";
import MaterialSettlementDialog from "@/components/materials/MaterialSettlementDialog";
import WaterfallUsageDialog from "@/components/materials/WaterfallUsageDialog";
import { SpotPurchaseAllocatorDialog } from "@/components/materials/SpotPurchaseAllocatorDialog";
import { usePurchaseOrder } from "@/hooks/queries/usePurchaseOrders";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";
import type { MaterialRequestWithDetails } from "@/types/material.types";

type OpenDialog =
  | { kind: "approve"; mr: MaterialRequestWithDetails }
  | { kind: "create-po"; mr: MaterialRequestWithDetails }
  // record-delivery / settle carry only the PO id — the FULL PurchaseOrder is
  // fetched fresh by id (usePurchaseOrder) when the dialog opens. The Hub's
  // thread list now uses a lightweight PO projection that omits columns these
  // money-flow dialogs need, so we must never hand them a list row; a fresh
  // by-id fetch also guards against acting on a stale cached PO.
  | { kind: "record-delivery"; poId: string }
  | { kind: "settle"; poId: string }
  // log-usage is now material-scoped: the waterfall dialog gathers ALL group
  // batches of this material and distributes a total across them oldest→newest.
  // batchRefCode is just a highlight hint for the originating batch.
  | {
      kind: "log-usage";
      materialId: string;
      brandId?: string | null;
      materialName?: string;
      materialUnit?: string;
      batchRefCode?: string;
    }
  | { kind: "finalize-spot"; batchId: string; refCode: string; totalAmount: number };

export interface HubDialogRouterHandle {
  /** Open the right dialog for the thread's next action. */
  openForThread(thread: MaterialThread): void;
}

export interface HubDialogRouterProps {
  siteId: string;
  siteGroupId: string | null;
  materialRequestById: Map<string, MaterialRequestWithDetails>;
}

export const HubDialogRouter = forwardRef<
  HubDialogRouterHandle,
  HubDialogRouterProps
>(function HubDialogRouter(
  { siteId, siteGroupId, materialRequestById },
  ref
) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  // Fetch the full PO on demand for the two dialogs that need it. Disabled
  // (id undefined) for every other dialog kind, so no extra request fires.
  const activePoId =
    dialog?.kind === "record-delivery" || dialog?.kind === "settle"
      ? dialog.poId
      : undefined;
  const fullPO = usePurchaseOrder(activePoId);
  const poReady = !!fullPO.data;
  const poLoading = !!activePoId && fullPO.isLoading;
  const poError = !!activePoId && fullPO.isError;

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
        if (thread.po?.id) setDialog({ kind: "record-delivery", poId: thread.po.id });
        return;
      }
      if (
        thread.stage === "delivered" &&
        (!thread.settlement || thread.settlement.status === "pending")
      ) {
        if (thread.po?.id) setDialog({ kind: "settle", poId: thread.po.id });
        return;
      }
      // Settled + in-use both route to usage logging. The waterfall dialog is
      // material-scoped: it gathers every group batch of this material and
      // distributes the entered total oldest→newest. A single-variant thread
      // pre-selects its variant; a multi-variant thread (e.g. TMT 3 sizes) lets
      // the engineer pick the size. batchRef just highlights the originating row.
      if (thread.stage === "settled" || thread.stage === "in-use") {
        const batchRef = thread.inventory?.batch && thread.inventory.batch !== "—"
          ? thread.inventory.batch
          : thread.settlement?.expense_ref ?? undefined;
        const singleVariantBrand =
          thread.variants && thread.variants.length === 1
            ? thread.variants[0].brand_id ?? null
            : undefined;
        setDialog({
          kind: "log-usage",
          materialId: thread.material_id,
          brandId: singleVariantBrand,
          materialName: thread.material_name,
          materialUnit: thread.material_unit,
          batchRefCode: batchRef,
        });
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
        open={dialog?.kind === "record-delivery" && poReady}
        onClose={close}
        siteId={siteId}
        purchaseOrder={
          dialog?.kind === "record-delivery" ? fullPO.data ?? null : null
        }
      />

      <MaterialSettlementDialog
        open={dialog?.kind === "settle" && poReady}
        onClose={close}
        purchaseOrder={dialog?.kind === "settle" ? fullPO.data ?? null : null}
      />

      {/* Brief spinner while the full PO loads for the settle / delivery
          dialog — the by-id fetch is normally a few hundred ms, but on a slow
          proxy this keeps the tap feeling responsive instead of "nothing
          happened". */}
      <Backdrop
        open={poLoading}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1, color: "#fff" }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* The PO fetch itself timed out/failed — offer a retry instead of
          silently doing nothing. */}
      <Snackbar
        open={poError}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="error"
          variant="filled"
          action={
            <Button color="inherit" size="small" onClick={() => fullPO.refetch()}>
              Retry
            </Button>
          }
          onClose={close}
        >
          Couldn&apos;t load order details. Check your connection.
        </Alert>
      </Snackbar>

      <WaterfallUsageDialog
        open={dialog?.kind === "log-usage"}
        onClose={close}
        siteId={siteId}
        siteGroupId={siteGroupId}
        materialId={dialog?.kind === "log-usage" ? dialog.materialId : ""}
        brandId={dialog?.kind === "log-usage" ? dialog.brandId : undefined}
        materialName={dialog?.kind === "log-usage" ? dialog.materialName : undefined}
        materialUnit={dialog?.kind === "log-usage" ? dialog.materialUnit : undefined}
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
