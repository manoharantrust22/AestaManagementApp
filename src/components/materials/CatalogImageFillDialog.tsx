/**
 * Catalog bulk-fill for product images.
 * Lists active materials that have no image and lets the user drop an image onto
 * each one by PASTING it from the clipboard (the main flow) or uploading a file.
 *
 * Workflow: the user reads the product name (+ its local name / brand / code),
 * taps the copy icon to grab a ready web-search string, finds an image online,
 * copies it, then taps "Paste image" on the row. The blob is uploaded to Supabase
 * (`work-updates/product-photos`) and `materials.image_url` is stamped via
 * useUpdateMaterial. A file-picker fallback covers browsers that block clipboard
 * read. Done rows show the applied thumbnail.
 *
 * Variants are grouped under their parent material so an ambiguous row like
 * "1 inch" reads in context ("PVC Pipe · 1 inch") with its category + brand chips.
 */

"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircle as DoneIcon,
  ContentCopy as ContentCopyIcon,
  ContentPaste as ContentPasteIcon,
  ExpandMore as ExpandMoreIcon,
  Upload as UploadIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/cache/keys";
import { fetchMaterialCatalog, useUpdateMaterial } from "@/hooks/queries/useMaterials";
import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import type { MaterialWithDetails } from "@/types/material.types";

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
 * Ready-to-search string for the copy button — "brand parent variant", deduped,
 * so a bare variant name like "1 inch" becomes e.g. "Polycab PVC Pipe 1 inch".
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
  const updateMaterial = useUpdateMaterial();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MaterialWithDetails[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [doneUrls, setDoneUrls] = useState<Map<string, string>>(new Map());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // One hidden file input reused for every row's "Upload" fallback.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<MaterialWithDetails | null>(null);

  useEffect(() => {
    if (!open) return;
    setDoneIds(new Set());
    setDoneUrls(new Map());
    setBusyIds(new Set());
    setRowErrors(new Map());
    setCopiedId(null);
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

  const setRowError = (id: string, msg: string | null) => {
    setRowErrors((prev) => {
      const next = new Map(prev);
      if (msg) next.set(id, msg);
      else next.delete(id);
      return next;
    });
  };

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /** Upload a clipboard/file blob and stamp it onto the material's image_url. */
  const applyImageBlob = async (m: MaterialWithDetails, blob: Blob) => {
    setRowError(m.id, null);
    setBusy(m.id, true);
    try {
      const supabase = createClient();
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const filePath = `product-photos/paste-${m.id}-${Date.now()}.${ext}`;
      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "work-updates",
        filePath,
        file: blob,
        contentType: blob.type || "image/png",
      });
      await updateMaterial.mutateAsync({ id: m.id, data: { image_url: publicUrl } });
      setDoneIds((prev) => new Set(prev).add(m.id));
      setDoneUrls((prev) => new Map(prev).set(m.id, publicUrl));
      void queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
    } catch (e) {
      setRowError(m.id, e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(m.id, false);
    }
  };

  /** "Paste image" button → pull an image off the clipboard via the async API. */
  const handlePaste = async (m: MaterialWithDetails) => {
    setRowError(m.id, null);
    try {
      if (!navigator.clipboard?.read) {
        setRowError(m.id, "Clipboard paste isn't supported here — use Upload.");
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          await applyImageBlob(m, blob);
          return;
        }
      }
      setRowError(m.id, "No image in clipboard. Copy an image first, then tap Paste.");
    } catch {
      setRowError(m.id, "Couldn't read the clipboard. Allow access, or use Upload.");
    }
  };

  const openFilePicker = (m: MaterialWithDetails) => {
    uploadTargetRef.current = m;
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const m = uploadTargetRef.current;
    if (file && m) void applyImageBlob(m, file);
    uploadTargetRef.current = null;
    e.target.value = "";
  };

  const handleCopy = async (m: MaterialWithDetails) => {
    try {
      await navigator.clipboard.writeText(buildSearchQuery(m));
      setCopiedId(m.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === m.id ? null : cur)), 1200);
    } catch {
      // Clipboard write blocked — the text is still selectable on the row.
    }
  };

  const renderRow = (
    m: MaterialWithDetails,
    opts?: { parentPrefix?: string | null; baseLabel?: boolean },
  ) => {
    const done = doneIds.has(m.id);
    const busy = busyIds.has(m.id);
    const url = doneUrls.get(m.id);
    const rowError = rowErrors.get(m.id);
    const brands = brandLabels(m);
    const primary = opts?.parentPrefix ? `${opts.parentPrefix} · ${m.name}` : m.name;
    return (
      <ListItem
        key={m.id}
        disableGutters
        alignItems="flex-start"
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
          ) : busy ? (
            <CircularProgress size={22} />
          ) : (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentPasteIcon />}
                onClick={() => handlePaste(m)}
              >
                Paste image
              </Button>
              <Tooltip title="Upload a file instead">
                <IconButton size="small" onClick={() => openFilePicker(m)}>
                  <UploadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          )
        }
      >
        <ListItemText
          primary={
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" component="span">
                {primary}
              </Typography>
              <Tooltip title={copiedId === m.id ? "Copied!" : "Copy name to search"}>
                <IconButton
                  size="small"
                  onClick={() => handleCopy(m)}
                  sx={{ p: 0.25 }}
                >
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          }
          primaryTypographyProps={{ component: "div" }}
          secondary={
            <Stack spacing={0.25} sx={{ mt: 0.25 }}>
              {m.local_name ? (
                <Typography variant="caption" color="text.secondary" component="span">
                  {m.local_name}
                </Typography>
              ) : null}
              <Stack
                direction="row"
                spacing={0.5}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
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
                  <Typography variant="caption" color="text.secondary" component="span">
                    {m.code}
                  </Typography>
                ) : null}
              </Stack>
              {rowError ? (
                <Typography variant="caption" color="error" component="span">
                  {rowError}
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
              under their material. Copy a name to search the web, then paste the image
              here — or upload a file.
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileSelected}
      />
    </Dialog>
  );
}
