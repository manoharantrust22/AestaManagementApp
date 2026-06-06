"use client";

/**
 * Per-row kebab on the Material Hub. Single destructive action:
 * "Delete this entry & chain" → confirm dialog → cascade_delete_material_request
 * via useDeleteMaterialRequestCascade (the exact path the buried
 * ThreadCorrectionMenu "Delete request & entire chain" uses). Self-gated to
 * editable, non-mirror, standard request threads; spot + mirror threads render
 * nothing. All click handlers stopPropagation so the row's inline expand never
 * toggles.
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
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { useDeleteMaterialRequestCascade } from "@/hooks/queries/useMaterialRequests";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

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

  const deleteCascade = useDeleteMaterialRequestCascade();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  // The kebab renders inside the row's click-to-expand area. MUI Menu/Dialog
  // portal into document.body, but React synthetic events still bubble along
  // the React tree — so backdrop dismissals, the Cancel button, etc. would
  // otherwise toggle the row. stopPropagation on every surface prevents that.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleDelete = async () => {
    setRunning(true);
    setError(null);
    try {
      await deleteCascade.mutateAsync({
        id: thread.source_row_id,
        siteId: thread.site_id,
      });
      setConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
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
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            setAnchorEl(null);
            setError(null);
            setConfirmOpen(true);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteForeverIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete this entry & chain</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog
        open={confirmOpen}
        onClose={() => !running && setConfirmOpen(false)}
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
          <Button onClick={() => setConfirmOpen(false)} disabled={running}>
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
