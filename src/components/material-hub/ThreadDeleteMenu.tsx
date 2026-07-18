"use client";

/**
 * Per-row kebab on the Material Hub.
 *
 * For a pending request (stage `requested`) it carries the office/admin
 * secondary actions of the combined Approve+PO stage — the primary path is the
 * row's "Create PO" button (which approves implicitly), so the kebab offers:
 *   - "Approve without PO" — from-stock fulfilment escape: stamps the approval
 *     but creates no PO (the thread stays orderable later).
 *   - "Reject request…"    — confirm dialog with an optional reason.
 * Both are gated by `canCreatePurchaseOrders` (admin/office only).
 *
 * Always (for editable standard threads): "Delete this entry & chain" →
 * confirm dialog → cascade_delete_material_request via
 * useDeleteMaterialRequestCascade. Self-gated to editable, non-mirror,
 * standard request threads; spot + mirror threads render nothing. All click
 * handlers stopPropagation so the row's inline expand never toggles.
 */

import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BlockIcon from "@mui/icons-material/Block";
import { useAuth } from "@/contexts/AuthContext";
import { canCreatePurchaseOrders, hasEditPermission } from "@/lib/permissions";
import {
  useApproveMaterialRequest,
  useDeleteMaterialRequestCascade,
  useRejectMaterialRequest,
} from "@/hooks/queries/useMaterialRequests";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

type ConfirmKind = "delete" | "approve" | "reject";

export default function ThreadDeleteMenu({ thread }: { thread: MaterialThread }) {
  const { userProfile } = useAuth();
  // Self-contained gate so MaterialThreadRow stays free of auth logic. Mirrors
  // MaterialThreadExpanded's `canEdit` (!is_mirror && hasEditPermission) and
  // additionally restricts to standard request threads — spot purchases and
  // read-only mirror threads have no clean cascade-delete and get no kebab.
  const canEdit =
    !thread.is_mirror &&
    hasEditPermission(userProfile?.role) &&
    thread.source === "material_request";

  // Office/admin decision actions on a pending request (combined Approve+PO
  // stage): approve-without-PO and reject.
  const canDecide =
    canEdit &&
    thread.stage === "requested" &&
    canCreatePurchaseOrders(userProfile?.role);

  const deleteCascade = useDeleteMaterialRequestCascade();
  const approveRequest = useApproveMaterialRequest();
  const rejectRequest = useRejectMaterialRequest();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  // The kebab renders inside the row's click-to-expand area. MUI Menu/Dialog
  // portal into document.body, but React synthetic events still bubble along
  // the React tree — so backdrop dismissals, the Cancel button, etc. would
  // otherwise toggle the row. stopPropagation on every surface prevents that.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const openConfirm = (kind: ConfirmKind) => {
    setAnchorEl(null);
    setError(null);
    setRejectReason("");
    setConfirm(kind);
  };

  const handleDelete = async () => {
    setRunning(true);
    setError(null);
    try {
      await deleteCascade.mutateAsync({
        id: thread.source_row_id,
        siteId: thread.site_id,
      });
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async () => {
    if (!userProfile?.id) return;
    setRunning(true);
    setError(null);
    try {
      // No per-item approved_qty stamps: leaving approved_qty NULL means every
      // downstream reader falls back to the requested quantity, and the thread
      // stays orderable later if a PO is created after all.
      await approveRequest.mutateAsync({
        id: thread.source_row_id,
        userId: userProfile.id,
        approvedItems: [],
        siteId: thread.site_id,
      });
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setRunning(false);
    }
  };

  const handleReject = async () => {
    if (!userProfile?.id) return;
    setRunning(true);
    setError(null);
    try {
      await rejectRequest.mutateAsync({
        id: thread.source_row_id,
        userId: userProfile.id,
        reason: rejectReason.trim() || undefined,
        siteId: thread.site_id,
      });
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label="Row actions"
        onClick={(e) => {
          e.stopPropagation();
          setAnchorEl(e.currentTarget);
        }}
        sx={{ color: hubTokens.subtle }}
      >
        <MoreVertIcon sx={{ fontSize: 18 }} />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        onClick={stop}
      >
        {canDecide && (
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              openConfirm("approve");
            }}
          >
            <ListItemIcon>
              <CheckCircleOutlineIcon fontSize="small" color="success" />
            </ListItemIcon>
            <ListItemText>Approve without PO</ListItemText>
          </MenuItem>
        )}
        {canDecide && (
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              openConfirm("reject");
            }}
            sx={{ color: "warning.main" }}
          >
            <ListItemIcon>
              <BlockIcon fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText>Reject request…</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            openConfirm("delete");
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteForeverIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete this entry & chain</ListItemText>
        </MenuItem>
      </Menu>

      {/* Approve without PO */}
      <Dialog
        open={confirm === "approve"}
        onClose={() => !running && setConfirm(null)}
        onClick={stop}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          Approve without creating a PO?
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ fontSize: 13.5 }}>
            Use this when <b>{thread.material_name}</b> will be issued from
            existing stock or handled outside a purchase order. The request is
            marked approved and stays open — a PO can still be created for it
            later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApprove}
            disabled={running}
          >
            {running ? "Approving…" : "Approve request"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject request */}
      <Dialog
        open={confirm === "reject"}
        onClose={() => !running && setConfirm(null)}
        onClick={stop}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          Reject this request?
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ fontSize: 13.5, mb: 1.5 }}>
            The site engineer who raised the request for{" "}
            <b>{thread.material_name}</b> will see it as rejected. No PO will be
            created.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline
            minRows={2}
            disabled={running}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleReject}
            disabled={running}
          >
            {running ? "Rejecting…" : "Reject request"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete chain */}
      <Dialog
        open={confirm === "delete"}
        onClose={() => !running && setConfirm(null)}
        onClick={stop}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          Delete this entry and its entire chain?
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ fontSize: 13.5 }}>
            This permanently removes the request <b>and every record built on
            it</b> — purchase orders, deliveries, stock, batch usage,
            settlements and expenses. Use this only to redo a mistaken entry
            from scratch. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={running}
          >
            {running ? "Deleting…" : "Delete entire chain"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
