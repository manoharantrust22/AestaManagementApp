/**
 * Catalog bulk-fill for product images (Phase 4 — online product images).
 * Lists active materials that have no image and lets the user tap "Find image"
 * on each — reusing ImageSearchPicker, which searches the web, re-hosts the
 * chosen image to Supabase, and (because materialId is passed) stamps
 * `materials.image_url` directly.
 *
 * Variants are grouped under their parent material (Phase 5) so an ambiguous
 * row like "1 inch" reads in context ("PVC Pipe · 1 inch") with its category +
 * brand chips, and the web search is seeded with the full "brand parent variant"
 * query instead of the bare name. Done rows show the applied thumbnail.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
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
  ExpandMore as ExpandMoreIcon,
  ImageSearch as ImageSearchIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/cache/keys";
import { fetchMaterialCatalog } from "@/hooks/queries/useMaterials";
import type { MaterialWithDetails } from "@/types/material.types";
import ImageSearchPicker from "@/components/common/ImageSearchPicker";

interface MaterialGroup {
  key: string;
  /** Parent/standalone material name shown as the group header. */
  label: string;
  categoryName: string | null;
  /** Parent entry (if imageless) first, then variants by numeric name order. */
  entries: MaterialWithDetails[];
}

/** Active brand labels, preferred first ("Polycab", "Dalmia DSP"). */
function brandLabels(m: MaterialWithDetails): string[] {
  return (m.brands ?? [])
    .filter((b) => b.is_active)
    .sort((a, b) => Number(b.is_preferred) - Number(a.is_preferred))
    .map((b) => (b.variant_name ? `${b.brand_name} ${b.variant_name}` : b.brand_name));
}

/**
 * Seed for the web image search — "brand parent variant", deduped, so a bare
 * variant name like "1 inch" becomes e.g. "Polycab PVC Pipe 1 inch".
 */
function buildSearchQuery(m: MaterialWithDetails): string {
  const parts: string[] = [];
  const active = (m.brands ?? []).filter((b) => b.is_active);
  const pick = active.find((b) => b.is_preferred) ?? active[0];
  if (pick) {
    parts.push(pick.brand_name);
    if (pick.variant_name) parts.push(pick.variant_name);
  }
  if (m.parent_material?.name) parts.push(m.parent_material.name);
  parts.push(m.name);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(" ");
}

function buildGroups(items: MaterialWithDetails[]): MaterialGroup[] {
  const map = new Map<string, MaterialGroup>();
  for (const m of items) {
    const key = m.parent_id ?? m.id;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        label: m.parent_id ? m.parent_material?.name ?? "Other" : m.name,
        categoryName: null,
        entries: [],
      };
      map.set(key, g);
    }
    g.entries.push(m);
  }

  for (const g of map.values()) {
    const parentEntry = g.entries.find((e) => e.id === g.key && !e.parent_id);
    if (parentEntry) g.label = parentEntry.name;
    g.categoryName =
      parentEntry?.category?.name ??
      g.entries.find((e) => e.category?.name)?.category?.name ??
      null;
    g.entries.sort((a, b) => {
      const ap = a.id === g.key && !a.parent_id ? 0 : 1;
      const bp = b.id === g.key && !b.parent_id ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }

  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
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
  const [items, setItems] = useState<MaterialWithDetails[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [doneUrls, setDoneUrls] = useState<Map<string, string>>(new Map());
  const [picker, setPicker] = useState<MaterialWithDetails | null>(null);

  useEffect(() => {
    if (!open) return;
    setDoneIds(new Set());
    setDoneUrls(new Map());
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchMaterialCatalog();
      setItems(all.filter((m) => !m.image_url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => buildGroups(items), [items]);
  const remaining = items.filter((m) => !doneIds.has(m.id)).length;

  const renderRow = (
    m: MaterialWithDetails,
    opts?: { parentPrefix?: string | null; baseLabel?: boolean },
  ) => {
    const done = doneIds.has(m.id);
    const url = doneUrls.get(m.id);
    const brands = brandLabels(m);
    const primary = opts?.parentPrefix ? `${opts.parentPrefix} · ${m.name}` : m.name;
    return (
      <ListItem
        key={m.id}
        disableGutters
        secondaryAction={
          done ? (
            <Stack direction="row" spacing={1} alignItems="center">
              {url ? (
                <Box
                  component="img"
                  src={url}
                  alt={m.name}
                  sx={{
                    height: 32,
                    width: 32,
                    objectFit: "cover",
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
              ) : null}
              <Chip size="small" color="success" icon={<DoneIcon />} label="Set" />
            </Stack>
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
          primary={primary}
          primaryTypographyProps={{ component: "div", variant: "body2" }}
          secondary={
            <Stack
              direction="row"
              spacing={0.5}
              flexWrap="wrap"
              useFlexGap
              alignItems="center"
              sx={{ mt: 0.25 }}
            >
              {opts?.baseLabel ? (
                <Chip size="small" variant="outlined" label="base item" />
              ) : null}
              {m.category?.name ? <Chip size="small" label={m.category.name} /> : null}
              {brands.slice(0, 2).map((b) => (
                <Chip key={b} size="small" variant="outlined" label={b} />
              ))}
              {brands.length > 2 ? (
                <Chip size="small" variant="outlined" label={`+${brands.length - 2}`} />
              ) : null}
              {m.code ? (
                <Typography variant="caption" color="text.secondary">
                  {m.code}
                </Typography>
              ) : null}
            </Stack>
          }
          secondaryTypographyProps={{ component: "div" }}
          sx={{ opacity: done ? 0.55 : 1, pr: 8 }}
        />
      </ListItem>
    );
  };

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
          <Typography variant="body2">
            Every active material already has an image. 🎉
          </Typography>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {remaining} of {items.length} still missing an image — variants are grouped
              under their material. Tap “Find image” on each.
            </Typography>
            {groups.map((g) => {
              if (g.entries.length === 1) {
                const m = g.entries[0];
                const parentPrefix = m.parent_id ? m.parent_material?.name ?? null : null;
                return (
                  <List key={g.key} dense disablePadding>
                    {renderRow(m, { parentPrefix })}
                  </List>
                );
              }
              const missingInGroup = g.entries.filter((e) => !doneIds.has(e.id)).length;
              return (
                <Accordion
                  key={g.key}
                  variant="outlined"
                  disableGutters
                  TransitionProps={{ unmountOnExit: true }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ width: "100%", pr: 1 }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {g.label}
                      </Typography>
                      {g.categoryName ? <Chip size="small" label={g.categoryName} /> : null}
                      <Box sx={{ flexGrow: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        {missingInGroup} missing
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <List dense disablePadding>
                      {g.entries.map((e) =>
                        renderRow(e, { baseLabel: e.id === g.key && !e.parent_id }),
                      )}
                    </List>
                  </AccordionDetails>
                </Accordion>
              );
            })}
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
          defaultQuery={buildSearchQuery(picker)}
          materialId={picker.id}
          onPicked={(url) => {
            const id = picker.id;
            setDoneIds((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            setDoneUrls((prev) => {
              const next = new Map(prev);
              next.set(id, url);
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
