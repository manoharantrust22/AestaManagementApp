"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import { useLaborCategories } from "@/hooks/queries/useLaborCategories";
import { useLaborRoles } from "@/hooks/queries/useLaborRoles";
import { useDeleteVendor } from "@/hooks/queries/useVendors";
import LaborerPhotoUploader from "@/components/laborers/LaborerPhotoUploader";
import type { DirectoryEntry } from "@/types/directory.types";

interface ConvertVendorToLaborerDialogProps {
  open: boolean;
  /** The mistakenly-added vendor entry (source === "vendor"). */
  entry: DirectoryEntry | null;
  onClose: () => void;
  /** Fired after the laborer exists AND the vendor is deactivated. */
  onConverted: (laborerName: string) => void;
}

/**
 * Fixes a miscategorised contact: a person (e.g. a helper electrician) that a
 * site engineer added as a Vendor. Creates a real ACTIVE laborer row (so he
 * shows up in Labor management and can be picked for attendance/small jobs),
 * then deactivates the vendor (soft — purchase history is kept), so the person
 * isn't listed twice in the directory.
 *
 * Two-step client flow, made safe against the partial-failure window: once the
 * laborer insert succeeds we remember its id, so "Retry" only re-runs the
 * vendor deactivation and can never create a duplicate laborer.
 */
export default function ConvertVendorToLaborerDialog({
  open,
  entry,
  onClose,
  onConverted,
}: ConvertVendorToLaborerDialogProps) {
  const isMobile = useIsMobile();
  const supabase = useMemo(() => createClient(), []);
  const { selectedCompany } = useSelectedCompany();
  const { data: categories = [] } = useLaborCategories(true);
  const { data: roles = [] } = useLaborRoles();
  const deleteVendorMut = useDeleteVendor();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [laborerType, setLaborerType] = useState<"daily_market" | "contract">(
    "daily_market"
  );
  const [dailyRate, setDailyRate] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deactivateFailed, setDeactivateFailed] = useState(false);
  // Set once the laborers insert succeeds — retries skip straight to step 2.
  const [createdLaborerId, setCreatedLaborerId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? "");
    setPhone(entry?.phone ?? "");
    setCategoryId("");
    setRoleId("");
    setLaborerType("daily_market");
    setDailyRate("");
    setPhotoUrl(null);
    setError("");
    setSaving(false);
    setDeactivateFailed(false);
    setCreatedLaborerId(null);
  }, [open, entry]);

  const rolesForCategory = useMemo(
    () => roles.filter((r) => r.category_id === categoryId),
    [roles, categoryId]
  );

  const handleRoleChange = (id: string) => {
    setRoleId(id);
    const role = roles.find((r) => r.id === id);
    if (role && role.default_daily_rate > 0) {
      setDailyRate(String(role.default_daily_rate));
    }
  };

  const deactivateVendor = async () => {
    if (!entry) return;
    setSaving(true);
    setError("");
    try {
      await deleteVendorMut.mutateAsync(entry.sourceRowId);
      onConverted(name.trim());
      onClose();
    } catch (e) {
      setDeactivateFailed(true);
      setError(
        e instanceof Error ? e.message : "Couldn't deactivate the vendor."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async () => {
    setError("");
    if (!entry) return;
    if (createdLaborerId) {
      // Laborer already exists from a previous attempt — only retry step 2.
      await deactivateVendor();
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!categoryId || !roleId) {
      setError("Pick the trade and role for this laborer.");
      return;
    }
    if (!selectedCompany?.id) {
      setError("No company selected.");
      return;
    }
    setSaving(true);
    try {
      await ensureFreshSession();
      const { data: inserted, error: insErr } = await (
        supabase.from("laborers") as any
      )
        .insert({
          name: name.trim(),
          phone: phone.trim() || null,
          category_id: categoryId,
          role_id: roleId,
          laborer_type: laborerType,
          employment_type: "daily_wage",
          language: "Tamil",
          daily_rate: Number(dailyRate) || 0,
          commission_per_day: 0,
          team_id: null,
          associated_team_id: null,
          status: "active",
          joining_date: dayjs().format("YYYY-MM-DD"),
          photo_url: photoUrl,
          notes: `Moved from vendor "${entry.name}" via the directory`,
          company_id: selectedCompany.id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      setCreatedLaborerId(inserted?.id ?? null);

      // Primary skill row — the directory + skills UIs read laborer_skills.
      // Non-fatal: the laborer row's own category_id already drives the trade.
      if (inserted?.id) {
        const { error: skillErr } = await (
          supabase.from("laborer_skills" as any) as any
        ).upsert(
          { laborer_id: inserted.id, category_id: categoryId, is_primary: true },
          { onConflict: "laborer_id,category_id" }
        );
        if (skillErr) console.error("laborer_skills upsert failed:", skillErr);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create the laborer.");
      setSaving(false);
      return;
    }
    setSaving(false);
    await deactivateVendor();
  };

  const categoryName =
    categories.find((c) => c.id === categoryId)?.name ?? "chosen trade";

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Move to laborers</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          {deactivateFailed ? (
            <Alert severity="warning">
              The laborer was created, but the old vendor record couldn&apos;t
              be deactivated — retry below, or delete the vendor from the
              directory menu later.
            </Alert>
          ) : (
            <Alert severity="info">
              <strong>{entry?.name}</strong> will be added to Laborers (active
              in Labor management) and removed from Vendors. Purchase history
              is kept.
            </Alert>
          )}

          {!deactivateFailed && (
            <>
              <LaborerPhotoUploader
                currentPhotoUrl={photoUrl}
                laborerName={name || "New laborer"}
                onPhotoChange={setPhotoUrl}
                onError={setError}
                disabled={saving || !!createdLaborerId}
                supabase={supabase}
              />

              <TextField
                label="Name"
                required
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                disabled={saving || !!createdLaborerId}
              />
              <TextField
                label="Phone"
                size="small"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
                inputProps={{ inputMode: "tel" }}
                disabled={saving || !!createdLaborerId}
                helperText="Keep a phone so he stays visible in the directory."
              />

              <Box
                sx={{
                  display: "flex",
                  gap: 1.5,
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                <TextField
                  select
                  label="Trade"
                  required
                  size="small"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setRoleId("");
                  }}
                  fullWidth
                  disabled={saving || !!createdLaborerId}
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Role"
                  required
                  size="small"
                  value={roleId}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  fullWidth
                  disabled={!categoryId || saving || !!createdLaborerId}
                  helperText={
                    !categoryId ? "Pick the trade first" : undefined
                  }
                >
                  {rolesForCategory.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5 }}
                >
                  Laborer type
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  color="primary"
                  value={laborerType}
                  onChange={(_, v) => {
                    if (v) setLaborerType(v);
                  }}
                  disabled={saving || !!createdLaborerId}
                  aria-label="Laborer type"
                >
                  <ToggleButton value="daily_market">Market laborer</ToggleButton>
                  <ToggleButton value="contract">Company laborer</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <TextField
                label="Daily rate"
                size="small"
                type="number"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                fullWidth
                disabled={saving || !!createdLaborerId}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₹</InputAdornment>
                  ),
                }}
                helperText={`Defaults from the ${categoryName} role card — adjust if needed.`}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {deactivateFailed ? "Close anyway" : "Cancel"}
        </Button>
        <Button
          variant="contained"
          onClick={deactivateFailed ? deactivateVendor : handleConvert}
          disabled={saving}
          startIcon={
            saving ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          {deactivateFailed ? "Retry deactivation" : "Move to laborers"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
