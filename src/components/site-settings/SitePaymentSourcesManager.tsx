"use client";

import React, { memo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  CircularProgress,
  Alert,
  Tooltip,
  Paper,
  Skeleton,
  Stack,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  AccountBalance as OwnMoneyIcon,
  Business as ClientIcon,
  Person as PersonIcon,
  Edit as CustomIcon,
  LocationOn as SiteIcon,
  Savings as TrustIcon,
  Payments as GenericSourceIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePayerSourcesAdmin,
  usePayerSourceMutations,
  type PayerSourceRow,
} from "@/hooks/queries/usePayerSources";
import { reorderVisible, isLastVisibleSource } from "@/lib/settlement/payerSourceAdmin";

const ICON_BY_NAME: Record<string, React.ReactNode> = {
  AccountBalance: <OwnMoneyIcon fontSize="small" />,
  Business: <ClientIcon fontSize="small" />,
  Person: <PersonIcon fontSize="small" />,
  Edit: <CustomIcon fontSize="small" />,
  LocationOn: <SiteIcon fontSize="small" />,
  Savings: <TrustIcon fontSize="small" />,
};

function iconFor(row: PayerSourceRow): React.ReactNode {
  return (row.icon && ICON_BY_NAME[row.icon]) || <GenericSourceIcon fontSize="small" />;
}

interface SitePaymentSourcesManagerProps {
  siteId: string;
}

const SitePaymentSourcesManager = memo(function SitePaymentSourcesManager({
  siteId,
}: SitePaymentSourcesManagerProps) {
  const { userProfile } = useAuth();
  const canEdit = userProfile?.role === "admin" || userProfile?.role === "office";

  const { data: rows, isLoading } = usePayerSourcesAdmin(siteId);
  const mutations = usePayerSourceMutations(siteId);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PayerSourceRow | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formRequiresName, setFormRequiresName] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleting, setDeleting] = useState<PayerSourceRow | null>(null);

  const list = rows ?? [];

  const openAdd = () => {
    setEditing(null);
    setFormLabel("");
    setFormRequiresName(false);
    setDialogOpen(true);
  };

  const openEdit = (row: PayerSourceRow) => {
    setEditing(row);
    setFormLabel(row.label);
    setFormRequiresName(row.requires_name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await mutations.updateSource(editing.id, {
          label: formLabel.trim(),
          // requires_name is only meaningful to change on custom rows
          ...(editing.is_built_in ? {} : { requires_name: formRequiresName }),
        });
      } else {
        await mutations.addCustomSource({
          label: formLabel.trim(),
          requiresName: formRequiresName,
          existingRows: list,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save source");
    } finally {
      setSaving(false);
    }
  };

  const runRow = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await runRow(deleting.id, () => mutations.deleteSource(deleting.id));
    setDeleting(null);
  };

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={40} sx={{ mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Payment Sources ({list.filter((r) => !r.is_hidden).length} shown)
        </Typography>
        {canEdit && (
          <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={openAdd}>
            Add Source
          </Button>
        )}
      </Box>

      <Paper variant="outlined">
        <List disablePadding>
          {list.length === 0 ? (
            <ListItem>
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                    No payment sources for this site yet.
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            list.map((row) => {
              const canMoveUp = !row.is_hidden && reorderVisible(list, row.id, "up") !== null;
              const canMoveDown = !row.is_hidden && reorderVisible(list, row.id, "down") !== null;
              const blockRemoval = !row.is_hidden && isLastVisibleSource(list, row.id);
              const isBusy = busyId === row.id;
              return (
                <ListItem
                  key={row.id}
                  divider
                  sx={{ opacity: row.is_hidden ? 0.55 : 1, "&:hover": { bgcolor: "action.hover" } }}
                  secondaryAction={
                    canEdit ? (
                      <Stack direction="row" spacing={0.25} alignItems="center">
                        {isBusy && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
                        <Tooltip title="Move up">
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canMoveUp || isBusy}
                              onClick={() => runRow(row.id, () => mutations.moveSource(list, row.id, "up"))}
                            >
                              <ArrowUpIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move down">
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canMoveDown || isBusy}
                              onClick={() => runRow(row.id, () => mutations.moveSource(list, row.id, "down"))}
                            >
                              <ArrowDownIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={row.is_hidden ? "Show" : blockRemoval ? "Can't hide the last visible source" : "Hide"}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={(blockRemoval && !row.is_hidden) || isBusy}
                              onClick={() => runRow(row.id, () => mutations.setHidden(row.id, !row.is_hidden))}
                            >
                              {row.is_hidden ? (
                                <VisibilityOffIcon fontSize="small" />
                              ) : (
                                <VisibilityIcon fontSize="small" color="primary" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Edit label">
                          <span>
                            <IconButton size="small" disabled={isBusy} onClick={() => openEdit(row)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {!row.is_built_in && (
                          <Tooltip title={blockRemoval ? "Can't delete the last visible source" : "Delete"}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={blockRemoval || isBusy}
                                onClick={() => setDeleting(row)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                    ) : undefined
                  }
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: row.is_hidden ? "grey.300" : "primary.main", width: 36, height: 36 }}>
                      {iconFor(row)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primaryTypographyProps={{ component: "div" }}
                    secondaryTypographyProps={{ component: "div" }}
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                        <Typography variant="body2" fontWeight={600} component="span">
                          {row.label}
                        </Typography>
                        <Chip
                          label={row.is_built_in ? "Built-in" : "Custom"}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem" }}
                        />
                        {row.is_hidden && (
                          <Chip
                            label="Hidden"
                            size="small"
                            color="default"
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                        )}
                        {row.requires_name && (
                          <Chip
                            label="Asks for name"
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              );
            })
          )}
        </List>
      </Paper>

      {!canEdit && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
          Only admin / office users can edit a site&apos;s payment sources.
        </Typography>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit Source" : "Add Payment Source"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Label"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
              fullWidth
              autoFocus
              placeholder="e.g., Site Cash, Loan, Bank A"
              helperText={
                editing?.is_built_in
                  ? "Built-in source — only its label can be changed."
                  : "Shown as a chip in the Add Funds and settlement dialogs for this site."
              }
            />
            {!editing?.is_built_in && (
              <FormControlLabel
                control={
                  <Switch
                    checked={formRequiresName}
                    onChange={(e) => setFormRequiresName(e.target.checked)}
                  />
                }
                label={
                  <Box component="span">
                    <Typography variant="body2" component="span">
                      Ask for a name when picked
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
                      Turn on for sources like &quot;Other&quot; where the user types whose money it was.
                    </Typography>
                  </Box>
                }
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formLabel.trim() || saving}>
            {saving ? <CircularProgress size={20} /> : editing ? "Save" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete source?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleting?.label}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Entries already recorded with this source keep their plain name. If you might use it
            again, hide it instead of deleting.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={busyId === deleting?.id}>
            {busyId === deleting?.id ? <CircularProgress size={20} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default SitePaymentSourcesManager;
