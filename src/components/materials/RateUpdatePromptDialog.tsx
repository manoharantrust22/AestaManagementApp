"use client";

/**
 * RateUpdatePromptDialog — shown after a spot purchase records lines whose
 * paid rate diverges from the vendor's catalog rate. Engineer ticks which
 * lines should become the new standard `current_price` in vendor_inventory.
 *
 * Note: vendor_inventory is keyed on (vendor_id, material_id) — updating by
 * material_id alone would mass-update every vendor's rate for that material,
 * which is wrong. We require vendor_id on each PromptItem and filter on both.
 * If no row exists for (vendor_id, material_id), the update is a silent no-op;
 * we accept that for now ("set standard rate" only works when a catalog row
 * already exists for this vendor).
 */

import { useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItem,
  Stack,
  Typography,
} from "@mui/material";
import { createClient } from "@/lib/supabase/client";

interface PromptItem {
  material_id: string;
  vendor_id: string;
  name: string;
  paid: number;
  catalog: number;
}

export function RateUpdatePromptDialog({
  batchId: _batchId,
  items,
  onClose,
}: {
  batchId: string;
  items: PromptItem[];
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const save = async () => {
    if (checked.size === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updates = items
        .filter((it) => checked.has(it.material_id))
        .map((it) => ({
          material_id: it.material_id,
          vendor_id: it.vendor_id,
          current_price: it.paid,
        }));
      for (const u of updates) {
        // vendor_inventory isn't in database.types.ts yet — cast to any to
        // match the convention used elsewhere (see useVendorInventory.ts,
        // useSpotPurchases.ts).
        await (supabase as any)
          .from("vendor_inventory")
          .update({ current_price: u.current_price })
          .eq("material_id", u.material_id)
          .eq("vendor_id", u.vendor_id);
      }
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Update standard rate?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1 }}>
          You paid different prices than the catalog rate. Tick lines whose new rate should become the standard.
        </Typography>
        <List dense>
          {items.map((it) => (
            <ListItem key={it.material_id} disableGutters>
              <FormControlLabel
                control={
                  <Checkbox checked={checked.has(it.material_id)} onChange={() => toggle(it.material_id)} />
                }
                label={
                  <Stack>
                    <Typography variant="body2">{it.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Catalog ₹{it.catalog.toFixed(2)} → Paid ₹{it.paid.toFixed(2)}
                    </Typography>
                  </Stack>
                }
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Skip</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? "Saving…" : `Update ${checked.size} rate${checked.size === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
