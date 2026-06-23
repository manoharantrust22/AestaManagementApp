"use client";

/**
 * In-card "Settle vendor" action for the Material Hub expanded thread's
 * Settlement block — shown only for a bulk/advance PO whose vendor has NOT been
 * paid yet (advanceAwaitingSettle). For advance buys the money goes out BEFORE
 * the goods arrive, so settling is the PRIMARY next step; the engineer naturally
 * looks for "pay the vendor" right inside the Settlement card.
 *
 * The Hub already exposes this action in the row HEADER (ThreadActionButton →
 * nextAction → HubDialogRouter); this surfaces the same action inside the card,
 * next to the "Record delivery" button in the Delivery block.
 *
 * Self-contained on purpose — it manages its own dialog state and lazily fetches
 * the full PO, exactly like RecordDeliveryButton / ThreadCorrectionMenu. That's
 * the only pattern that works both inline (desktop) and inside
 * MaterialThreadDetailSheet (mobile) without threading an onAction callback
 * through the row → expanded → sheet layers. Mirrors the settle wiring in
 * HubDialogRouter.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Backdrop, CircularProgress } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import { hubTokens } from "@/lib/material-hub/tokens";
import { advanceAwaitingSettle } from "@/lib/material-hub/stageHelpers";
import { usePurchaseOrder } from "@/hooks/queries/usePurchaseOrders";
import MaterialSettlementDialog from "@/components/materials/MaterialSettlementDialog";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface RecordSettlementButtonProps {
  thread: MaterialThread;
  /** Mirrors MaterialThreadExpanded's canEdit (!is_mirror && hasEditPermission). */
  canEdit: boolean;
  /** Site the settlement is recorded against — the viewer's selected site,
   *  matching the header flow's siteId in HubDialogRouter. */
  siteId: string;
}

export default function RecordSettlementButton({
  thread: t,
  canEdit,
  siteId,
}: RecordSettlementButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const poId = t.po?.id ?? null;
  // Lazy fetch — disabled (id undefined) until the dialog is opened, so no
  // extra request fires while the card is just being viewed.
  const fullPO = usePurchaseOrder(open && poId ? poId : undefined);
  const poReady = !!fullPO.data;

  // Show only for an unpaid bulk/advance PO (advanceAwaitingSettle). Once paid
  // or settled this returns false and the button disappears.
  if (!canEdit || t.is_mirror || t.purchase_type === "spot") return null;
  if (!advanceAwaitingSettle(t) || !poId) return null;

  const accent = t.kind === "group" ? hubTokens.pink : hubTokens.primary;

  // After recording, refresh the Hub. useMaterialThreads has NO
  // ["material-threads"] query — it composes granular sub-queries, so each key
  // must be invalidated individually (same list RecordDeliveryButton uses).
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
        <PaymentsOutlinedIcon sx={{ fontSize: 14 }} />
        Settle vendor
        <ArrowForwardIcon sx={{ fontSize: 13 }} />
      </Box>

      <MaterialSettlementDialog
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
