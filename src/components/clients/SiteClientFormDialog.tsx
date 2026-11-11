"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Alert, Autocomplete, FormControlLabel, Checkbox,
} from "@mui/material";
import ImageUploadWithCrop from "@/components/common/ImageUploadWithCrop";
import { createClient } from "@/lib/supabase/client";
import {
  useCreateSiteClient,
  useUpdateSiteClient,
  type SiteClient,
} from "@/hooks/queries/useSiteClients";

const ROLE_SUGGESTIONS = [
  "Owner",
  "Co-owner",
  "Wife of owner",
  "Husband of owner",
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Relative",
  "Representative",
];

export interface SiteClientFormDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  /** Edit this client; omit to add a new one. */
  initial?: SiteClient;
  /** Pre-fill the name when adding from a picker search. */
  initialName?: string;
  /** Called with the saved client (new or updated). */
  onSaved?: (client: SiteClient) => void;
  /** Make the first client of a site primary by default. */
  defaultPrimary?: boolean;
}

export function SiteClientFormDialog({
  open, onClose, siteId, initial, initialName, onSaved, defaultPrimary,
}: SiteClientFormDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const create = useCreateSiteClient();
  const update = useUpdateSiteClient();
  const saving = create.isPending || update.isPending;

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? initialName ?? "");
    setRole(initial?.role ?? "");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setPhotoUrl(initial?.photo_url ?? null);
    setIsPrimary(initial ? initial.is_primary : Boolean(defaultPrimary));
    setError(null);
  }, [open, initial, initialName, defaultPrimary]);

  async function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    const input = { name, role, phone, email, photo_url: photoUrl, is_primary: isPrimary };
    try {
      if (initial) {
        await update.mutateAsync({ siteId, client: initial, input });
        onSaved?.({
          ...initial,
          name: name.trim(),
          role: role.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          photo_url: photoUrl,
          is_primary: isPrimary,
        });
      } else {
        const saved = await create.mutateAsync({ siteId, input });
        onSaved?.(saved);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{initial ? "Edit client" : "Add client"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <ImageUploadWithCrop
            supabase={supabase}
            bucketName="avatars"
            folderPath={`clients/${siteId}`}
            fileNamePrefix="client"
            value={photoUrl}
            onChange={setPhotoUrl}
            label="Photo"
            cropShape="round"
            disabled={saving}
          />
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <Autocomplete
            freeSolo
            options={ROLE_SUGGESTIONS}
            inputValue={role}
            onInputChange={(_e, v) => setRole(v)}
            slotProps={{ popper: { disablePortal: false } }}
            renderInput={(params) => (
              <TextField {...params} label="Relation to site" placeholder="e.g. Owner, Wife of owner" />
            )}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              inputProps={{ inputMode: "tel" }}
            />
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              type="email"
            />
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />}
            label="Primary client (selected by default)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {initial ? "Save" : "Add client"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SiteClientFormDialog;
