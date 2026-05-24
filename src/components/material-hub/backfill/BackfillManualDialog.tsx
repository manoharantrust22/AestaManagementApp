"use client";

/**
 * Manual single-record backfill form. Mirrors the layout/state pattern in
 * docs/Historical_Material_Backfill/proto-backfill.jsx → BackfillManualModal.
 *
 * Production wiring: uses useRecordHistoricalBatch (records:[oneRecord]) RPC.
 * Vendor + material autocomplete supports inline "Create as draft" — passes
 * vendor.name / new_material.{name,unit} to the RPC which mints is_draft=true
 * rows server-side.
 */

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Box,
  Typography,
  Button,
  TextField,
  Autocomplete,
  MenuItem,
  Alert,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { hubTokens } from "@/lib/material-hub/tokens";
import { useVendors } from "@/hooks/queries/useVendors";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useRecordHistoricalBatch,
  type HistoricalRecord,
  type HistoricalPaidBy,
} from "@/hooks/queries/useRecordHistoricalBatch";
import GroupSplitInput, { type GroupSite, type GroupSplitRow } from "./GroupSplitInput";

const HIST_MIN = "2025-11-09";
const HIST_MAX = "2026-05-09";

const UNITS = ["bag", "kg", "cft", "tonne", "nos", "piece", "unit", "m", "liter"];

export interface BackfillManualDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string | undefined;
  /** Current site name + a short pill (for the GroupSplitInput payer chip). */
  siteName?: string;
  onSaved?: () => void;
}

export default function BackfillManualDialog({
  open,
  onClose,
  siteId,
  siteName,
  onSaved,
}: BackfillManualDialogProps) {
  const { data: vendors = [] } = useVendors({ includeDrafts: true });
  const { data: materials = [] } = useMaterials({ includeDrafts: true });
  const { data: groupMembership } = useSiteGroupMembership(siteId);

  const mutation = useRecordHistoricalBatch();

  // Form state
  const [vendor, setVendor] = useState<{ id?: string; name: string } | null>(null);
  const [material, setMaterial] = useState<
    { id?: string; name: string; unit: string } | null
  >(null);
  const [unit, setUnit] = useState<string>("bag");
  const [qty, setQty] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(HIST_MIN.slice(0, 10));
  const [section, setSection] = useState<string>("");
  const [kind, setKind] = useState<"own" | "group">("own");
  const [paymentStatus, setPaymentStatus] = useState<"settled" | "pending">(
    "settled"
  );
  const [paidBy, setPaidBy] = useState<HistoricalPaidBy>("office");
  const [usedQty, setUsedQty] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Cluster sites (current + others). Default split: even.
  const clusterSites: GroupSite[] = useMemo(() => {
    const others = groupMembership?.otherSites ?? [];
    const all = siteId
      ? [{ id: siteId, name: siteName ?? "This site" }, ...others]
      : [];
    return all.map((s) => ({ ...s }));
  }, [groupMembership, siteId, siteName]);

  const [split, setSplit] = useState<GroupSplitRow[]>([]);

  // Initialize the split when cluster sites first become available or kind=group
  useMemo(() => {
    if (kind === "group" && clusterSites.length > 0 && split.length === 0) {
      const evenPct = Math.floor(100 / clusterSites.length);
      const remainder = 100 - evenPct * clusterSites.length;
      setSplit(
        clusterSites.map((s, i) => ({
          site_id: s.id,
          pct: i === 0 ? evenPct + remainder : evenPct,
        }))
      );
    }
  }, [kind, clusterSites, split.length]);

  const splitOk =
    kind === "own" ||
    Math.abs(split.reduce((a, s) => a + (s.pct || 0), 0) - 100) < 0.01;

  const amountNum = parseFloat(amount) || 0;
  const qtyNum = parseFloat(qty) || 0;
  const usedNum = parseFloat(usedQty) || 0;

  const dateOk = !!date && date >= HIST_MIN && date <= HIST_MAX;
  const valid =
    !!vendor &&
    !!material &&
    !!material.name &&
    qtyNum > 0 &&
    amountNum > 0 &&
    dateOk &&
    splitOk;

  const submit = async () => {
    if (!siteId || !valid || !vendor || !material) return;

    const record: HistoricalRecord = {
      purchase_date: date,
      vendor: vendor.id ? { id: vendor.id } : { name: vendor.name },
      items: [
        material.id
          ? { material_id: material.id, qty: qtyNum, amount: amountNum }
          : {
              new_material: { name: material.name, unit: material.unit || unit },
              qty: qtyNum,
              amount: amountNum,
            },
      ],
      kind,
      group_split:
        kind === "group"
          ? split.map((s) => ({ site_id: s.site_id, pct: s.pct }))
          : undefined,
      payment_status: paymentStatus,
      paid_by: paymentStatus === "settled" ? paidBy : undefined,
      used_qty: usedNum > 0 ? usedNum : 0,
      section: section || "Historical",
      notes,
    };

    try {
      await mutation.mutateAsync({ site_id: siteId, records: [record] });
      onSaved?.();
      onClose();
      // Reset form
      setVendor(null);
      setMaterial(null);
      setQty("");
      setAmount("");
      setSection("");
      setUsedQty("");
      setNotes("");
      setPaymentStatus("settled");
      setPaidBy("office");
      setKind("own");
      setSplit([]);
    } catch (e) {
      // Mutation surfaces via mutation.error below
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px", maxWidth: 680 } }}
    >
      <DialogTitle
        sx={{
          padding: "16px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${hubTokens.border}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: hubTokens.text }}>
            Backfill · manual entry
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            The work already happened. We&apos;ll collapse request, PO, delivery, and settlement into one record.
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ padding: "18px 22px" }}>
        {/* Yellow warn banner */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            background: hubTokens.warnSoft,
            borderRadius: "9px",
            marginBottom: "16px",
          }}
        >
          <CalendarMonthIcon sx={{ fontSize: 16, color: hubTokens.warn }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: hubTokens.warn }}>
              Backfill mode
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
              Tagged as historical · skips approvals · settlement posts as the date you record.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Vendor */}
          <Autocomplete
            freeSolo
            options={vendors as any[]}
            getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name ?? "")}
            value={vendor}
            onChange={(_, val) => {
              if (typeof val === "string") {
                setVendor({ name: val });
              } else if (val) {
                setVendor({ id: val.id, name: val.name });
              } else {
                setVendor(null);
              }
            }}
            onInputChange={(_, val, reason) => {
              if (reason === "input") setVendor((v) => ({ ...v, name: val }));
            }}
            slotProps={{ popper: { disablePortal: false } }}
            renderOption={(props, opt: any) => (
              <Box component="li" {...props} key={opt.id}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                    {opt.name}
                    {opt.is_draft ? (
                      <Box
                        component="span"
                        sx={{
                          marginLeft: "6px",
                          padding: "1px 5px",
                          background: hubTokens.warnSoft,
                          color: hubTokens.warn,
                          fontSize: 9,
                          fontWeight: 800,
                          borderRadius: "3px",
                        }}
                      >
                        DRAFT
                      </Box>
                    ) : null}
                  </Typography>
                </Box>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Vendor — type to search or create a draft"
                size="small"
                helperText={
                  vendor && !vendor.id && vendor.name
                    ? `Will create new shop "${vendor.name}" as a draft`
                    : undefined
                }
                FormHelperTextProps={{ sx: { color: hubTokens.warn } }}
              />
            )}
          />

          {/* Material + qty/unit */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "12px" }}>
            <Autocomplete
              freeSolo
              options={materials as any[]}
              getOptionLabel={(opt) =>
                typeof opt === "string" ? opt : opt.name ?? ""
              }
              value={material}
              onChange={(_, val) => {
                if (typeof val === "string") {
                  setMaterial({ name: val, unit });
                } else if (val) {
                  setMaterial({ id: val.id, name: val.name, unit: val.unit ?? "piece" });
                  setUnit(val.unit ?? "piece");
                } else {
                  setMaterial(null);
                }
              }}
              onInputChange={(_, val, reason) => {
                if (reason === "input")
                  setMaterial((m) =>
                    m && m.id
                      ? { ...m, name: val }
                      : { name: val, unit: m?.unit ?? unit }
                  );
              }}
              slotProps={{ popper: { disablePortal: false } }}
              renderOption={(props, opt: any) => (
                <Box component="li" {...props} key={opt.id}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                      {opt.name}
                      {opt.is_draft ? (
                        <Box
                          component="span"
                          sx={{
                            marginLeft: "6px",
                            padding: "1px 5px",
                            background: hubTokens.warnSoft,
                            color: hubTokens.warn,
                            fontSize: 9,
                            fontWeight: 800,
                            borderRadius: "3px",
                          }}
                        >
                          DRAFT
                        </Box>
                      ) : null}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                      {opt.description || opt.code || "—"} · {opt.unit ?? "piece"}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Material"
                  size="small"
                  helperText={
                    material && !material.id && material.name
                      ? `Will create new material "${material.name}" as a draft`
                      : undefined
                  }
                  FormHelperTextProps={{ sx: { color: hubTokens.warn } }}
                />
              )}
            />
            <Box sx={{ display: "flex", gap: "6px" }}>
              <TextField
                label={`Qty${material?.unit ? ` (${material.unit})` : ""}`}
                size="small"
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                sx={{ flex: 1 }}
              />
              {!material?.id && (
                <TextField
                  select
                  size="small"
                  label="Unit"
                  value={material?.unit ?? unit}
                  onChange={(e) => {
                    setUnit(e.target.value);
                    setMaterial((m) =>
                      m ? { ...m, unit: e.target.value } : m
                    );
                  }}
                  sx={{ width: 90 }}
                >
                  {UNITS.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          </Box>

          {/* Amount + date */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <TextField
              label="Total paid (₹)"
              size="small"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              InputProps={{ startAdornment: <Box component="span" sx={{ marginRight: "4px", color: hubTokens.muted }}>₹</Box> }}
            />
            <TextField
              label="Purchase date"
              size="small"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              inputProps={{ min: HIST_MIN, max: HIST_MAX }}
              InputLabelProps={{ shrink: true }}
              error={!!date && !dateOk}
              helperText={!!date && !dateOk ? `Must be ${HIST_MIN} … ${HIST_MAX}` : undefined}
            />
          </Box>

          {/* Section */}
          <TextField
            label="Section · what for? (optional)"
            size="small"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="Foundation, plaster, slab…"
          />

          {/* Kind */}
          <Box>
            <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginBottom: "4px" }}>
              Buying for
            </Typography>
            <RadioGroup
              row
              value={kind}
              onChange={(e) => setKind(e.target.value as "own" | "group")}
            >
              <FormControlLabel value="own" control={<Radio size="small" />} label="This site" />
              <FormControlLabel value="group" control={<Radio size="small" />} label="Group cluster" />
            </RadioGroup>
          </Box>

          {/* Group split */}
          {kind === "group" && clusterSites.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginBottom: "6px" }}>
                Group % split — used by each site (the work is done — enter actual consumption)
              </Typography>
              <GroupSplitInput
                sites={clusterSites}
                split={split}
                amount={amountNum}
                onChange={setSplit}
              />
            </Box>
          )}

          {/* Used qty */}
          <TextField
            label="Already used? (optional)"
            size="small"
            type="number"
            value={usedQty}
            onChange={(e) => setUsedQty(e.target.value)}
            placeholder="0"
            helperText={`How much of the ${qtyNum || "?"} ${material?.unit ?? unit} was consumed before today.`}
          />

          {/* Payment */}
          <Box>
            <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginBottom: "4px" }}>
              Payment
            </Typography>
            <RadioGroup
              row
              value={paymentStatus}
              onChange={(e) =>
                setPaymentStatus(e.target.value as "settled" | "pending")
              }
            >
              <FormControlLabel value="settled" control={<Radio size="small" />} label="Paid · settled" />
              <FormControlLabel value="pending" control={<Radio size="small" />} label="Outstanding" />
            </RadioGroup>
          </Box>

          {paymentStatus === "settled" && (
            <Box>
              <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, marginBottom: "4px" }}>
                Paid by
              </Typography>
              <RadioGroup
                row
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value as HistoricalPaidBy)}
              >
                <FormControlLabel value="office" control={<Radio size="small" />} label="Office" />
                <FormControlLabel value="wallet" control={<Radio size="small" />} label="Wallet" />
                <FormControlLabel value="site" control={<Radio size="small" />} label="Site funds" />
              </RadioGroup>
            </Box>
          )}

          {/* Notes */}
          <TextField
            label="Notes (optional)"
            size="small"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Quality, bill ref, anything to remember…"
          />

          {mutation.error && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {(mutation.error as Error).message}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{ padding: "12px 22px", borderTop: `1px solid ${hubTokens.border}` }}
      >
        <Button onClick={onClose} size="small">
          Back
        </Button>
        <Button
          variant="contained"
          disabled={!valid || mutation.isPending}
          onClick={submit}
          size="small"
          startIcon={
            mutation.isPending ? (
              <CircularProgress size={14} sx={{ color: "inherit" }} />
            ) : undefined
          }
        >
          Save historical record
        </Button>
      </DialogActions>
    </Dialog>
  );
}
