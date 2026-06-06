/**
 * Catalog bulk-fill for product images (Phase 4 — online product images).
 * Lists active materials that have no image and lets the user tap "Find image"
 * on each — reusing ImageSearchPicker, which searches the web, re-hosts the
 * chosen image to Supabase, and (because materialId is passed) stamps
 * `materials.image_url` directly. Done rows show a ✓ and the catalog refreshes.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import {
  CheckCircle as DoneIcon,
  ImageSearch as ImageSearchIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import ImageSearchPicker from "@/components/common/ImageSearchPicker";

interface ImagelessMaterial {
  id: string;
  name: string;
  code: string | null;
}

export default function CatalogImageFillDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ImagelessMaterial[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<ImagelessMaterial | null>(null);

  useEffect(() => {
    if (!open) return;
    setDoneIds(new Set());
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("materials")
        .select("id, name, code")
        .is("image_url", null)
        .eq("is_active", true)
        .order("name");
      if (err) throw new Error(err.message);
      setItems((data ?? []) as ImagelessMaterial[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  const remaining = items.filter((m) => !doneIds.has(m.id)).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Fill missing product images</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 240 }}>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : items.length === 0 ? (
          <Typography variant="body2">Every active material already has an image. 🎉</Typography>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {remaining} of {items.length} still missing an image — tap “Find image” on each.
            </Typography>
            <List dense disablePadding>
              {items.map((m) => {
                const done = doneIds.has(m.id);
                return (
                  <ListItem
                    key={m.id}
                    disableGutters
                    secondaryAction={
                      done ? (
                        <Chip size="small" color="success" icon={<DoneIcon />} label="Set" />
                      ) : (
                        <Button
                          size="small"
                          startIcon={<ImageSearchIcon />}
                          onClick={() => setPicker(m)}
                        >
                          Find image
                        </Button>
                      )
                    }
                  >
                    <ListItemText
                      primary={m.name}
                      secondary={m.code ?? undefined}
                      sx={{ opacity: done ? 0.55 : 1, pr: 6 }}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {picker ? (
        <ImageSearchPicker
          open={!!picker}
          onClose={() => setPicker(null)}
          defaultQuery={picker.name}
          materialId={picker.id}
          onPicked={() => {
            const id = picker.id;
            setDoneIds((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
            setPicker(null);
          }}
        />
      ) : null}
    </Dialog>
  );
}
