"use client";

/**
 * In-card "Record next delivery" action for the Material Hub expanded thread's
 * Delivery & Quality block.
 *
 * The Hub already exposes this action in the row HEADER (ThreadActionButton →
 * nextAction → HubDialogRouter), but for an advance PO that's delivered in
 * installments the engineer naturally looks for "add the next one" right inside
 * the Delivery card next to the Batch 1/2/3 list. This surfaces it there.
 *
 * Self-contained on purpose — it manages its own dialog state and lazily fetches
 * the full PO, exactly like ThreadCorrectionMenu. That's the only pattern that
 * works both inline (desktop) and inside MaterialThreadDetailSheet (mobile)
 * without threading an onAction callback through the row → expanded → sheet
 * layers. Mirrors the record-delivery wiring in HubDialogRouter.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Backdrop, CircularProgress } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import { hubTokens } from "@/lib/material-hub/tokens";
import { usePurchaseOrder } from "@/hooks/queries/usePurchaseOrders";
import RecordAndVerifyDeliveryDialog from "@/components/materials/RecordAndVerifyDeliveryDialog";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface RecordDeliveryButtonProps {
  thread: MaterialThread;
  /** Mirrors MaterialThreadExpanded's canEdit (!is_mirror && hasEditPermission). */
  canEdit: boolean;
  /** Site the installment is recorded against — the viewer's selected site,
   *  matching the header flow's siteId in HubDialogRouter. */
  siteId: string;
}

export default function RecordDeliveryButton({
  thread: t,
  canEdit,
  siteId,
}: RecordDeliveryButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const poId = t.po?.id ?? null;
  // Lazy fetch — disabled (id undefined) until the dialog is opened, so no
  // extra request fires while the card is just being viewed.
  const fullPO = usePurchaseOrder(open && poId ? poId : undefined);
  const poReady = !!fullPO.data;

  // Show only while this PO can still receive a delivery installment. Matches
  // nextAction's delivery branch: stage stays "ordered" through both the first
  // delivery and every partial; it flips to "delivered" only once fully
  // received, after which there's nothing more to record here.
  if (!canEdit || t.is_mirror || t.purchase_type === "spot") return null;
  if (t.stage !== "ordered" || !poId) return null;

  const received = t.po?.received_qty ?? 0;
  const ordered = t.po?.qty ?? 0;
  const isNext = received > 0 && received < ordered;
  const accent = t.kind === "group" ? hubTokens.pink : hubTokens.primary;

  // After recording, refresh the Hub. useMaterialThreads has NO
  // ["material-threads"] query — it composes granular sub-queries, so each key
  // must be invalidated individually (same list ThreadCorrectionMenu uses).
  const refreshHub = () => {
    const keys = [
      ["material-requests"],
      ["purchase-orders"],
      ["spot-purchases"],
      ["deliveries"],
      ["stock-inventory"],
      ["material-settlements"],
      ["batch-usage-summary"],
      ["material-purchases"],
    ];
    keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
  };

  return (
    <>
      <Box
        component="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        sx={{
          marginTop: "10px",
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          background: accent,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: hubTokens.font,
          boxShadow: "0 1px 2px rgba(15,23,42,.08)",
          transition: "filter .12s",
          "&:hover": { filter: "brightness(0.92)" },
        }}
      >
        <LocalShippingOutlinedIcon sx={{ fontSize: 14 }} />
        {isNext ? "Record next delivery" : "Record delivery"}
        <ArrowForwardIcon sx={{ fontSize: 13 }} />
      </Box>

      <RecordAndVerifyDeliveryDialog
        open={open && poReady}
        onClose={() => {
          setOpen(false);
          refreshHub();
        }}
        siteId={siteId}
        purchaseOrder={fullPO.data ?? null}
      />

      {/* Brief spinner while the full PO loads — the by-id fetch is normally a
          few hundred ms, but on a slow proxy this keeps the tap feeling
          responsive (parity with HubDialogRouter's header-button flow). */}
      <Backdrop
        open={open && fullPO.isLoading}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1, color: "#fff" }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    </>
  );
}
