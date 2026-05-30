"use client";

/**
 * Manual multi-line backfill form. One vendor + one date + one payment block,
 * with N material lines each carrying an auto-filled, editable unit price, plus
 * a record-level transport charge and a derived (editable) grand total.
 *
 * Production wiring: uses useRecordHistoricalBatch (records:[oneRecord]) RPC,
 * which already loops over record.items[] (multi-material) and now also stores
 * the record-level transport_cost. Vendor + material autocomplete support inline
 * "Create as draft" — passing vendor.name / new_material.{name,unit} mints
 * is_draft=true rows server-side. Auto-fill (per line) reads the vendor's last
 * quote via useVendorMaterialPrice; drafts have no id => no auto-fill.
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
  Alert,
  CircularProgress,
  RadioGroup,
  FormControlLabel,
  Radio,
  Link,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AddIcon from "@mui/icons-material/Add";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { useVendors } from "@/hooks/queries/useVendors";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useRecordHistoricalBatch,
  type HistoricalRecord,
  type HistoricalRecordItem,
  type HistoricalPaidBy,
} from "@/hooks/queries/useRecordHistoricalBatch";
import GroupSplitInput, { type GroupSite, type GroupSplitRow } from "./GroupSplitInput";
import BackfillLineRow, { type BackfillLine } from "./BackfillLineRow";

const HIST_MIN = "2025-11-09";
const HIST_MAX = "2026-05-09";

const UNITS = ["bag", "kg", "cft", "tonne", "nos", "piece", "unit", "m", "liter"];

function makeLine(): BackfillLine {
  return {
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Math.round(performance.now() * 1000)}`,
    material: null,
    unit: "bag",
    qty: "",
    unitPrice: "",
    priceTouched: false,
  };
}

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

  // Form state — record-level
  const [vendor, setVendor] = useState<{ id?: string; name: string } | null>(null);
  const [date, setDate] = useState<string>(HIST_MIN.slice(0, 10));
  const [section, setSection] = useState<string>("");
  const [kind, setKind] = useState<"own" | "group">("own");
  const [paymentStatus, setPaymentStatus] = useState<"settled" | "pending">(
    "settled"
  );
  const [paidBy, setPaidBy] = useState<HistoricalPaidBy>("office");
  const [usedQty, setUsedQty] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Material lines + record-level transport + editable total override
  const [lines, setLines] = useState<BackfillLine[]>([makeLine()]);
  const [transport, setTransport] = useState<string>("");
  const [totalOverride, setTotalOverride] = useState<string>("");

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

  // Derived totals
  const subtotal = lines.reduce(
    (a, l) => a + (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0),
    0
  );
  const transportNum = parseFloat(transport) || 0;
  const calcTotal = subtotal + transportNum;
  const overrideNum = parseFloat(totalOverride) || 0;
  const hasOverride = totalOverride.trim() !== "";
  const effectiveTotal = hasOverride ? overrideNum : calcTotal;

  const usedNum = parseFloat(usedQty) || 0;

  const dateOk = !!date && date >= HIST_MIN && date <= HIST_MAX;
  const linesOk =
    lines.length > 0 &&
    lines.every(
      (l) =>
        !!l.material &&
        !!l.material.name &&
        (parseFloat(l.qty) || 0) > 0 &&
        (parseFloat(l.unitPrice) || 0) > 0
    );
  const valid =
    !!vendor && linesOk && effectiveTotal > 0 && dateOk && splitOk;

  // Line mutators
  const addLine = () => setLines((ls) => [...ls, makeLine()]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const patchLine = (key: string, patch: Partial<BackfillLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const resetForm = () => {
    setVendor(null);
    setLines([makeLine()]);
    setTransport("");
    setTotalOverride("");
    setSection("");
    setUsedQty("");
    setNotes("");
    setPaymentStatus("settled");
    setPaidBy("office");
    setKind("own");
    setSplit([]);
  };

  const submit = async () => {
    if (!siteId || !valid || !vendor) return;

    const items: HistoricalRecordItem[] = lines.map((l) => {
      const qtyN = parseFloat(l.qty) || 0;
      const amount = qtyN * (parseFloat(l.unitPrice) || 0);
      return l.material!.id
        ? { material_id: l.material!.id, qty: qtyN, amount }
        : {
            new_material: {
              name: l.material!.name,
              unit: l.material!.unit || l.unit,
            },
            qty: qtyN,
            amount,
          };
    });

    const record: HistoricalRecord = {
      purchase_date: date,
      vendor: vendor.id ? { id: vendor.id } : { name: vendor.name },
      items,
      amount: effectiveTotal,
      transport_cost: transportNum,
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
      resetForm();
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
          {/* Vendor + date */}
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
            sx={{ maxWidth: 220 }}
          />

          {/* Materials — multi-line */}
          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
                Materials — one vendor, add every item from this buy
              </Typography>
              {!vendor?.id && vendor && (
                <Typography sx={{ fontSize: 10.5, color: hubTokens.warn }}>
                  Draft vendor · prices won&apos;t auto-fill
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {lines.map((l) => (
                <BackfillLineRow
                  key={l.key}
                  line={l}
                  vendorId={vendor?.id}
                  materials={materials}
                  units={UNITS}
                  canRemove={lines.length > 1}
                  onChange={(patch) => patchLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </Box>
            <Button
              onClick={addLine}
              size="small"
              startIcon={<AddIcon />}
              sx={{ mt: "10px", textTransform: "none", color: hubTokens.primary }}
            >
              Add material
            </Button>
          </Box>

          {/* Transport + totals summary */}
          <Box
            sx={{
              background: hubTokens.bg,
              border: `1px solid ${hubTokens.hairline}`,
              borderRadius: "10px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <TextField
                label="Transportation charge (₹)"
                size="small"
                type="number"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                placeholder="0"
                InputProps={{
                  startAdornment: (
                    <Box component="span" sx={{ mr: "4px", color: hubTokens.muted }}>
                      ₹
                    </Box>
                  ),
                }}
                sx={{ width: 200 }}
                helperText="One charge for the whole load (optional)"
              />
              <Box sx={{ flex: 1, textAlign: "right" }}>
                <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                  Subtotal {inr(subtotal)} · Transport {inr(transportNum)}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
                paddingTop: "8px",
                borderTop: `1px dashed ${hubTokens.border}`,
              }}
            >
              <Box>
                <Typography
                  sx={{ fontSize: 11.5, color: hubTokens.muted, marginBottom: "2px" }}
                >
                  Total paid (₹) — auto-calculated, editable to match the bill
                </Typography>
                {hasOverride && Math.abs(overrideNum - calcTotal) > 0.01 && (
                  <Typography sx={{ fontSize: 10.5, color: hubTokens.warn }}>
                    Differs from calculated {inr(calcTotal)}.{" "}
                    <Link
                      component="button"
                      type="button"
                      onClick={() => setTotalOverride("")}
                      sx={{ fontSize: 10.5 }}
                    >
                      Reset
                    </Link>
                  </Typography>
                )}
              </Box>
              <TextField
                size="small"
                type="number"
                value={hasOverride ? totalOverride : calcTotal ? String(calcTotal) : ""}
                onChange={(e) => setTotalOverride(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <Box component="span" sx={{ mr: "4px", color: hubTokens.muted }}>
                      ₹
                    </Box>
                  ),
                }}
                sx={{ width: 160 }}
              />
            </Box>
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
                amount={effectiveTotal}
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
            helperText="Total units consumed before today across these materials."
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
