"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  MenuItem,
  Chip,
  LinearProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Inventory2 as BatchIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCreateMaterialUsage } from "@/hooks/queries/useMaterialUsage";
import { formatCurrency } from "@/lib/formatters";

/**
 * Own-site usage logging — the deliberately simple counterpart to
 * WaterfallUsageDialog (which is group-batch / cross-site oriented).
 *
 * An own-site purchase merges into ONE pooled stock_inventory row (batch_code
 * NULL) keyed by (site, material, brand). There are no batches to waterfall, no
 * sibling sites to attribute to, and the variant is fixed at what was bought.
 * So this dialog LOCKS site (= the buying site) and brand (= the purchase brand)
 * and just asks "how much / when / what work" — writing via the own-stock path
 * (daily_material_usage → trg_update_stock_on_usage decrements the pool).
 */
interface OwnSiteUsageDialogProps {
  open: boolean;
  onClose: () => void;
  /** The buying site — the consuming site is locked to this. */
  siteId: string;
  materialId: string;
  materialName?: string;
  materialUnit?: string;
  /** Brand of the purchase — locked (read-only). */
  brandId?: string | null;
  brandName?: string | null;
}

interface PoolRow {
  id: string;
  current_qty: number;
  avg_unit_cost: number | null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export default function OwnSiteUsageDialog({
  open,
  onClose,
  siteId,
  materialId,
  materialName,
  materialUnit,
  brandId,
  brandName,
}: OwnSiteUsageDialogProps) {
  const isMobile = useIsMobile();
  const createUsage = useCreateMaterialUsage();

  const [pool, setPool] = useState<PoolRow | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [siteName, setSiteName] = useState<string>("");
  const [buildingSections, setBuildingSections] = useState<{ id: string; name: string }[]>([]);

  const [quantity, setQuantity] = useState<number>(0);
  const [usageDate, setUsageDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [workDescription, setWorkDescription] = useState<string>("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const unit = materialUnit ?? "nos";

  // Load the own-site pool row (batch_code NULL) + site name + sections on open.
  useEffect(() => {
    if (!open || !siteId || !materialId) return;
    const supabase = createClient();
    let cancelled = false;

    setPoolLoading(true);
    let poolQuery = supabase
      .from("stock_inventory")
      .select("id, current_qty, avg_unit_cost")
      .eq("site_id", siteId)
      .eq("material_id", materialId)
      .is("batch_code", null);
    // Narrow to the purchase's brand when known; otherwise take the own pool for
    // this material regardless of brand (a single own-site bucket).
    if (brandId) poolQuery = poolQuery.eq("brand_id", brandId);

    poolQuery
      .order("current_qty", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setPool(
          data
            ? {
                id: data.id,
                current_qty: Number(data.current_qty) || 0,
                avg_unit_cost: data.avg_unit_cost != null ? Number(data.avg_unit_cost) : null,
              }
            : null
        );
        setPoolLoading(false);
      });

    supabase
      .from("sites")
      .select("name")
      .eq("id", siteId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSiteName(data?.name ?? "");
      });

    supabase
      .from("building_sections")
      .select("id, name")
      .eq("site_id", siteId)
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setBuildingSections(data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [open, siteId, materialId, brandId]);

  // Reset on close.
  useEffect(() => {
    if (open) return;
    setPool(null);
    setQuantity(0);
    setUsageDate(new Date().toISOString().split("T")[0]);
    setWorkDescription("");
    setSectionId(null);
    setError("");
  }, [open]);

  const remaining = pool?.current_qty ?? 0;
  const overStock = quantity > remaining + 1e-6;
  const estimatedCost = useMemo(
    () => (pool?.avg_unit_cost ? round3(quantity * pool.avg_unit_cost) : 0),
    [quantity, pool]
  );

  const onQtyChange = useCallback((val: number) => {
    setQuantity(Number.isFinite(val) && val > 0 ? round3(val) : 0);
  }, []);

  const canSubmit = !!pool && quantity > 0 && !overStock && !createUsage.isPending;

  const handleSubmit = async () => {
    setError("");
    if (!pool) return setError("No own-site stock pool found for this material");
    if (quantity <= 0) return setError("Enter how much was used");
    if (overStock) return setError(`Only ${remaining} ${unit} remaining in this pool`);

    try {
      await createUsage.mutateAsync({
        site_id: siteId,
        material_id: materialId,
        brand_id: brandId ?? undefined,
        inventory_id: pool.id,
        quantity,
        usage_date: usageDate,
        section_id: sectionId ?? undefined,
        work_description: workDescription || undefined,
        unit_cost: pool.avg_unit_cost ?? undefined,
        total_cost: estimatedCost || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record usage");
    }
  };

  const fillPct = remaining > 0 ? Math.min((quantity / remaining) * 100, 100) : 0;

  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => {
        if (reason !== "backdropClick") onClose();
      }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <BatchIcon color="primary" />
          <Box>
            <Typography variant="h6" component="span" sx={{ display: "block", lineHeight: 1.2 }}>
              Log material usage
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {materialName ?? "Material"}
              {brandName ? ` · ${brandName}` : ""} — own-site stock
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2}>
          {error && (
            <Grid size={12}>
              <Alert severity="error" onClose={() => setError("")}>
                {error}
              </Alert>
            </Grid>
          )}

          {/* Locked context — own-site purchases are dedicated to the buying site
              and fixed to the brand that was bought, so these are read-only. */}
          <Grid size={12}>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`Used by ${siteName || "this site"}`}
              />
              <Chip size="small" variant="outlined" label={brandName ? brandName : "Unbranded"} />
              <Typography variant="caption" color="text.secondary">
                Own-site purchase — dedicated to this site
              </Typography>
            </Box>
          </Grid>

          {/* Remaining-in-pool indicator */}
          <Grid size={12}>
            {poolLoading ? (
              <LinearProgress />
            ) : !pool ? (
              <Alert severity="warning">
                No own-site stock pool found for this material at this site.
              </Alert>
            ) : (
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Remaining in pool
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {remaining} {unit}
                </Typography>
              </Box>
            )}
          </Grid>

          {/* Quantity + date */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label={`Quantity used (${unit})`}
              type="number"
              value={quantity === 0 ? "" : quantity}
              onChange={(e) => onQtyChange(Number(e.target.value))}
              disabled={!pool}
              error={overStock}
              helperText={overStock ? `Only ${remaining} ${unit} available` : undefined}
              inputProps={{ min: 0, max: remaining, step: "any" }}
            />
            {!!pool && remaining > 0 && (
              <Box sx={{ mt: 0.75 }}>
                <Chip
                  label={`Use all ${remaining} ${unit}`}
                  size="small"
                  variant="outlined"
                  onClick={() => onQtyChange(remaining)}
                />
              </Box>
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Usage date"
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {quantity > 0 && pool?.avg_unit_cost ? (
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Estimated cost: {formatCurrency(estimatedCost)} (@ {formatCurrency(pool.avg_unit_cost)}/{unit})
              </Typography>
              <LinearProgress
                variant="determinate"
                value={fillPct}
                sx={{ height: 5, borderRadius: 1, mt: 0.5 }}
              />
            </Grid>
          ) : null}

          {/* Work description */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Work description (optional)"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              multiline
              rows={2}
              placeholder="e.g., Foundation work, Brick wall construction"
            />
          </Grid>

          {/* Construction section picker */}
          <Grid size={12}>
            <TextField
              select
              fullWidth
              label="Construction section (optional)"
              value={sectionId ?? ""}
              onChange={(e) => setSectionId(e.target.value || null)}
            >
              <MenuItem value="">
                <em>No section</em>
              </MenuItem>
              {buildingSections.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            {sectionId === null && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: "block" }}>
                No section selected — this entry won&apos;t appear in section breakdowns of the Usage Ledger
              </Typography>
            )}
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={createUsage.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          {createUsage.isPending ? "Recording…" : "Record usage"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
