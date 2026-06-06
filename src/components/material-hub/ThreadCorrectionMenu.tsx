"use client";

/**
 * Per-section "Correct" control for the Material Hub expanded thread
 * (Approach A). Renders a small text button in a block header; clicking opens a
 * menu of corrections relevant to that lifecycle stage. Destructive actions go
 * through a confirmation dialog that spells out the cascade before running.
 *
 * Void & Redo: every action either edits in place (no children) or
 * voids/reverses the record + its children via an existing, side-effect-aware
 * hook, leaving a clean state to redo from:
 *   - REQUEST    → reset linked POs to draft, or delete the whole chain
 *   - PO         → cancel, or delete PO + deliveries/stock/expenses
 *   - DELIVERY   → reverse one delivery (reverse_delivery RPC)
 *   - SETTLEMENT → reverse on its canonical page (own vs inter-site differ)
 *
 * Plain edits and settlement reversals route to the canonical page rather than
 * rebuilding those forms inline.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
} from "@mui/material";
import BuildIcon from "@mui/icons-material/Build";
import EditIcon from "@mui/icons-material/Edit";
import UndoIcon from "@mui/icons-material/Undo";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CancelIcon from "@mui/icons-material/Cancel";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { hubTokens } from "@/lib/material-hub/tokens";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDeleteMaterialRequestCascade,
  useRevertLinkedPOsToDraft,
  useMaterialRequest,
} from "@/hooks/queries/useMaterialRequests";
import {
  useCancelPurchaseOrder,
  useDeletePurchaseOrderCascade,
  useReverseDelivery,
  usePurchaseOrder,
} from "@/hooks/queries/usePurchaseOrders";
import { useMaterialPurchaseById } from "@/hooks/queries/useMaterialPurchases";
import MaterialRequestDialog from "@/components/materials/MaterialRequestDialog";
import UnifiedPurchaseOrderDialog from "@/components/materials/UnifiedPurchaseOrderDialog";
import MaterialSettlementDialog from "@/components/materials/MaterialSettlementDialog";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export type CorrectionSection = "request" | "po" | "delivery" | "settlement";

interface PendingAction {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<unknown>;
}

interface ThreadCorrectionMenuProps {
  thread: MaterialThread;
  section: CorrectionSection;
  canEdit: boolean;
}

export default function ThreadCorrectionMenu({
  thread: t,
  section,
  canEdit,
}: ThreadCorrectionMenuProps) {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const deleteRequestCascade = useDeleteMaterialRequestCascade();
  const revertLinkedPOs = useRevertLinkedPOsToDraft();
  const cancelPO = useCancelPurchaseOrder();
  const deletePOCascade = useDeletePurchaseOrderCascade();
  const reverseDelivery = useReverseDelivery();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [editPOOpen, setEditPOOpen] = useState(false);
  const [editSettlementOpen, setEditSettlementOpen] = useState(false);

  const open = Boolean(anchorEl);
  const siteId = t.site_id;
  const requestId = t.source === "material_request" ? t.source_row_id : null;
  const poId = t.po?.id ?? null;
  const settlementExpenseId = t.settlement?.expense_id ?? null;
  const deliveryBatches = t.po?.delivery_batches ?? [];

  // Lazily fetch the full record only while its edit dialog is open (the
  // dialogs don't self-fetch). open is gated on the data so the dialog never
  // flashes its "create" mode before edit data arrives.
  const { data: requestForEdit } = useMaterialRequest(
    editRequestOpen && requestId ? requestId : undefined
  );
  const { data: poForEdit } = usePurchaseOrder(
    editPOOpen && poId ? poId : undefined
  );
  const { data: settlementForEdit } = useMaterialPurchaseById(
    editSettlementOpen && settlementExpenseId ? settlementExpenseId : undefined
  );

  // After an inline edit, refresh the Hub threads (the dialogs invalidate their
  // own request/PO caches but not the composed thread view).
  const refreshHub = () => {
    queryClient.invalidateQueries({ queryKey: ["material-threads"] });
  };

  if (!canEdit) return null;

  const closeMenu = () => setAnchorEl(null);

  const ask = (a: PendingAction) => {
    setError(null);
    setPending(a);
    closeMenu();
  };

  const runPending = async () => {
    if (!pending) return;
    setRunning(true);
    setError(null);
    try {
      await pending.run();
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setRunning(false);
    }
  };

  // Build the menu items for this section.
  const items: React.ReactNode[] = [];

  if (section === "request" && requestId) {
    items.push(
      <MenuItem
        key="edit-req"
        onClick={() => {
          setEditRequestOpen(true);
          closeMenu();
        }}
      >
        <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Edit request</ListItemText>
      </MenuItem>
    );
    if (t.po) {
      items.push(
        <MenuItem
          key="revert-pos"
          onClick={() =>
            ask({
              title: "Reset linked POs to draft?",
              body: (
                <>This reverts any not-yet-delivered purchase orders linked to this request back to
                  draft so the request can be edited and re-ordered. Delivered POs are left untouched.</>
              ),
              confirmLabel: "Reset linked POs",
              run: () => revertLinkedPOs.mutateAsync({ requestId, siteId }),
            })
          }
        >
          <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reset linked POs to draft</ListItemText>
        </MenuItem>
      );
    }
    items.push(
      <MenuItem
        key="del-req"
        onClick={() =>
          ask({
            title: "Delete this request and its entire chain?",
            danger: true,
            body: (
              <>This permanently removes the request <b>and every record built on it</b> — purchase
                orders, deliveries, stock, batch usage and settlements. Use this only to redo a
                mistaken entry from scratch. This cannot be undone.</>
            ),
            confirmLabel: "Delete entire chain",
            run: () => deleteRequestCascade.mutateAsync({ id: requestId, siteId }),
          })
        }
      >
        <ListItemIcon><DeleteForeverIcon fontSize="small" color="error" /></ListItemIcon>
        <ListItemText>Delete request & entire chain</ListItemText>
      </MenuItem>
    );
  }

  if (section === "po" && poId) {
    items.push(
      <MenuItem
        key="edit-po"
        onClick={() => {
          setEditPOOpen(true);
          closeMenu();
        }}
      >
        <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Edit PO</ListItemText>
      </MenuItem>
    );
    items.push(
      <MenuItem
        key="cancel-po"
        onClick={() =>
          ask({
            title: "Cancel this purchase order?",
            body: <>Marks the PO as cancelled (kept for audit with a reason). Deliveries already
              recorded are not reversed — reverse those first if needed.</>,
            confirmLabel: "Cancel PO",
            run: () =>
              cancelPO.mutateAsync({ id: poId, userId: user?.id ?? "", reason: "Corrected from Hub" }),
          })
        }
      >
        <ListItemIcon><CancelIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Cancel PO</ListItemText>
      </MenuItem>
    );
    items.push(
      <MenuItem
        key="del-po"
        onClick={() =>
          ask({
            title: "Delete this PO and its children?",
            danger: true,
            body: <>Permanently removes the PO together with its deliveries, stock entries, batch
              usage, expenses and any inter-site settlements. The request is left intact so you can
              re-create the PO. This cannot be undone.</>,
            confirmLabel: "Delete PO & children",
            run: () => deletePOCascade.mutateAsync({ id: poId, siteId }),
          })
        }
      >
        <ListItemIcon><DeleteForeverIcon fontSize="small" color="error" /></ListItemIcon>
        <ListItemText>Delete PO & children</ListItemText>
      </MenuItem>
    );
  }

  if (section === "delivery") {
    if (deliveryBatches.length === 0) {
      items.push(
        <MenuItem key="no-deliv" disabled>
          <ListItemText>No delivery recorded to reverse</ListItemText>
        </MenuItem>
      );
    } else {
      deliveryBatches.forEach((b) => {
        items.push(
          <MenuItem
            key={`rev-${b.id}`}
            onClick={() =>
              ask({
                title: "Reverse this delivery?",
                body: (
                  <>Rolls back the stock added by GRN <b>{b.grn_number}</b> ({b.received_qty}{" "}
                    {t.material_unit}, {b.delivery_date}), restores PO quantities and recomputes the
                    PO status. If usage was logged or the batch was settled, delete/reverse those
                    first — the reversal will refuse otherwise.</>
                ),
                confirmLabel: "Reverse delivery",
                danger: true,
                run: () =>
                  reverseDelivery.mutateAsync({
                    deliveryId: b.id,
                    siteId,
                    reason: "Corrected from Hub",
                    actorId: user?.id,
                  }),
              })
            }
          >
            <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
            <ListItemText>
              Reverse GRN {b.grn_number}
              <Typography component="span" sx={{ fontSize: 11, color: hubTokens.subtle, ml: 0.5 }}>
                · {b.received_qty} {t.material_unit}
              </Typography>
            </ListItemText>
          </MenuItem>
        );
      });
    }
  }

  if (section === "settlement") {
    const href = t.kind === "own" ? "/site/material-settlements" : "/site/inter-site-settlement";
    // Primary: edit the vendor settlement (date / amount / payer / bill image)
    // in place — the user's most common correction. Only when there's a
    // settled expense row to edit.
    if (settlementExpenseId) {
      items.push(
        <MenuItem
          key="edit-settle"
          onClick={() => {
            setEditSettlementOpen(true);
            closeMenu();
          }}
        >
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit settlement</ListItemText>
        </MenuItem>
      );
    }
    // Escape hatch: full reverse / inter-site reconciliation still lives on the
    // canonical page.
    items.push(
      <MenuItem
        key="open-settle-page"
        onClick={() => {
          closeMenu();
          router.push(href);
        }}
      >
        <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Reverse on settlement page</ListItemText>
        <OpenInNewIcon sx={{ fontSize: 13, color: hubTokens.subtle, ml: 1 }} />
      </MenuItem>
    );
  }

  if (items.length === 0) return null;

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAnchorEl(e.currentTarget as HTMLElement);
          }
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          cursor: "pointer",
          color: hubTokens.subtle,
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.4px",
          userSelect: "none",
          "&:hover": { color: hubTokens.primary },
        }}
      >
        <BuildIcon sx={{ fontSize: 12 }} />
        Correct
      </Box>

      <Menu anchorEl={anchorEl} open={open} onClose={closeMenu}>
        {items}
      </Menu>

      <Dialog open={!!pending} onClose={() => !running && setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>{pending?.title}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ fontSize: 13.5 }}>{pending?.body}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={pending?.danger ? "error" : "primary"}
            onClick={runPending}
            disabled={running}
          >
            {running ? "Working…" : pending?.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline edit dialogs — reuse the same forms as the v1 pages. open is
          gated on the loaded record so the dialog opens straight into edit
          mode (never flashes "create"). */}
      {requestId && (
        <MaterialRequestDialog
          open={editRequestOpen && !!requestForEdit}
          onClose={() => {
            setEditRequestOpen(false);
            refreshHub();
          }}
          request={requestForEdit ?? null}
          siteId={siteId}
        />
      )}
      {poId && (
        <UnifiedPurchaseOrderDialog
          open={editPOOpen && !!poForEdit}
          onClose={() => {
            setEditPOOpen(false);
            refreshHub();
          }}
          purchaseOrder={poForEdit ?? null}
          siteId={siteId}
          onSuccess={() => refreshHub()}
        />
      )}
      {settlementExpenseId && (
        <MaterialSettlementDialog
          open={editSettlementOpen && !!settlementForEdit}
          purchase={settlementForEdit ?? null}
          onClose={() => {
            setEditSettlementOpen(false);
            refreshHub();
          }}
          onSuccess={() => refreshHub()}
        />
      )}
    </>
  );
}
