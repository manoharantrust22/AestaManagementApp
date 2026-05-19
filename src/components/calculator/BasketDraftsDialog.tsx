"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { formatDistanceToNow } from "date-fns";
import {
  useDeleteEstimateBasketDraft,
  useEstimateBasketDrafts,
  useSaveEstimateBasketDraft,
  type EstimateBasketDraft,
} from "@/hooks/queries/useEstimateBasketDrafts";
import {
  useEstimateBasket,
  type EstimateItem,
} from "@/contexts/EstimateBasketContext";
import { useToast } from "@/contexts/ToastContext";

type Mode = "save" | "load";

interface BasketDraftsDialogProps {
  open: boolean;
  mode: Mode;
  onClose: () => void;
}

export function BasketDraftsDialog({
  open,
  mode,
  onClose,
}: BasketDraftsDialogProps) {
  const { items, loadItems, clearBasket } = useEstimateBasket();
  const { data: drafts = [], isLoading } = useEstimateBasketDrafts();
  const saveDraft = useSaveEstimateBasketDraft();
  const deleteDraft = useDeleteEstimateBasketDraft();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the draft a name");
      return;
    }
    if (items.length === 0) {
      setError("Basket is empty — add items before saving");
      return;
    }
    try {
      await saveDraft.mutateAsync({
        name: trimmed,
        items: items as EstimateItem[],
      });
      showSuccess(`Saved "${trimmed}" with ${items.length} items`);
      setName("");
      setError(null);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      showError(msg);
    }
  };

  const handleLoad = (draft: EstimateBasketDraft) => {
    if (items.length > 0) {
      const ok = window.confirm(
        `Replace the current ${items.length}-item basket with "${draft.name}" (${draft.item_count} items)?`,
      );
      if (!ok) return;
    }
    loadItems(draft.items);
    showSuccess(`Loaded "${draft.name}"`);
    onClose();
  };

  const handleDelete = async (draft: EstimateBasketDraft) => {
    const ok = window.confirm(`Delete draft "${draft.name}"?`);
    if (!ok) return;
    try {
      await deleteDraft.mutateAsync(draft.id);
      showSuccess(`Deleted "${draft.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      showError(msg);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {mode === "save" ? "Save basket as draft" : "Load a saved draft"}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {mode === "save" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Draft name"
              placeholder="e.g. Door & window estimate — May"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              {items.length} item{items.length === 1 ? "" : "s"} in the current
              basket will be saved.
            </Typography>
          </Box>
        )}

        {mode === "load" && (
          <Box>
            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : drafts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No saved drafts yet — save one from the basket panel to see it
                here.
              </Typography>
            ) : (
              <List dense disablePadding>
                {drafts.map((draft) => (
                  <ListItem
                    key={draft.id}
                    disablePadding
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleDelete(draft)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemButton onClick={() => handleLoad(draft)}>
                      <ListItemText
                        primary={draft.name}
                        secondary={`${draft.item_count} item${
                          draft.item_count === 1 ? "" : "s"
                        } · saved ${formatDistanceToNow(
                          new Date(draft.updated_at),
                          { addSuffix: true },
                        )}`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {mode === "save" && (
          <>
            {items.length > 0 && (
              <Button
                color="error"
                onClick={() => {
                  if (window.confirm("Clear the current basket?")) {
                    clearBasket();
                    onClose();
                  }
                }}
              >
                Clear current
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saveDraft.isPending}
            >
              {saveDraft.isPending ? "Saving..." : "Save draft"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
