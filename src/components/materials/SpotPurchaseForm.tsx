"use client";

/**
 * SpotPurchaseForm — supervisor-facing form for "Bought at shop" purchases.
 * Vendor (existing or quick-add draft) → buying-for toggle (own/group split)
 * → items (existing or quick-add) → bill + payment screenshots → payment mode
 * + total → submit via record_spot_purchase RPC → redirect /site/today.
 * Task F adds RateUpdatePromptDialog on top of this; for now we redirect.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Divider,
  MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";

import { ReceiptCapture, type ReceiptCaptureValue } from "@/components/common/ReceiptCapture";
import { RateUpdatePromptDialog } from "./RateUpdatePromptDialog";
import SpotPurchaseItemRow from "./SpotPurchaseItemRow";
import WalletBalancePreview from "@/components/wallet-v2/WalletBalancePreview";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { requiresPayerName, type PayerSource } from "@/types/settlement.types";
import { useMaterials, useMaterialCategories } from "@/hooks/queries/useMaterials";
import { useVendors } from "@/hooks/queries/useVendors";
import { useSiteGroupSites } from "@/hooks/queries/useSiteGroups";
import { useEngineerWalletBalance } from "@/hooks/queries/useEngineerWalletV2";
import { useCreateSpotPurchase } from "@/hooks/queries/useSpotPurchases";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Material, SpotPurchasePayload } from "@/types/material.types";
import type { GraniteLine } from "@/types/spaces.types";

type AllocationMode = "own_site" | "group";
type PaymentMode = SpotPurchasePayload["payment_mode"];

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "credit", label: "Credit (pay later)" },
];

export interface ItemRow {
  rid: string;
  material: Material | null;
  newMaterialName: string;
  newMaterialUnit: string;
  newMaterialCategoryId: string | null;
  qty: number;
  rate: number;
  /** Vendor's catalog rate for this material; drives the post-submit rate prompt. */
  catalogRate: number | undefined;
  /** Area materials (sqft/sqm): slab sizes; qty is derived from these. */
  graniteLines?: GraniteLine[];
  /** Human-readable slab-size summary, folded into the batch notes. */
  sizeNote?: string | null;
}

interface VendorOption { id: string; name: string }
interface GroupSplitRow { site_id: string; percentage: number }

const makeRid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emptyRow = (): ItemRow => ({
  rid: makeRid(), material: null, newMaterialName: "", newMaterialUnit: "piece",
  newMaterialCategoryId: null, qty: 0, rate: 0, catalogRate: undefined,
});

export default function SpotPurchaseForm() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const { userProfile } = useAuth();

  const siteId = selectedSite?.id ?? null;
  const siteGroupId = selectedSite?.site_group_id ?? null;
  const engineerId = userProfile?.id ?? null;
  // Site engineers pay from their own site wallet (source/mode derived from it).
  // Admin/office have no wallet — they record full payment details (mode + payer
  // source) and the purchase is settled "direct".
  const isSiteEngineer = userProfile?.role === "site_engineer";

  // Supervisors should see their own quick-added drafts in the picker so
  // they can pick the same material/vendor for repeat spot purchases.
  const { data: materials = [] } = useMaterials({ includeDrafts: true });
  const { data: vendors = [] } = useVendors({ includeDrafts: true });
  const { data: categories = [] } = useMaterialCategories();
  const { data: groupSites = [] } = useSiteGroupSites(siteGroupId ?? undefined);

  const [vendor, setVendor] = useState<VendorOption | null>(null);
  const [vendorQuickAdd, setVendorQuickAdd] = useState("");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("own_site");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [billReceipt, setBillReceipt] = useState<ReceiptCaptureValue | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [groupSplit, setGroupSplit] = useState<GroupSplitRow[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [postSubmitRatePrompt, setPostSubmitRatePrompt] = useState<
    {
      items: { material_id: string; vendor_id: string; name: string; paid: number; catalog: number }[];
      batchId: string;
    } | null
  >(null);

  const itemsLineTotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0),
    [items]
  );
  const groupSplitTotal = useMemo(
    () => groupSplit.reduce((s, r) => s + (Number(r.percentage) || 0), 0),
    [groupSplit]
  );

  // Only site engineers have a wallet — don't fetch a phantom ₹0 balance for admins.
  const balanceQuery = useEngineerWalletBalance(
    isSiteEngineer ? engineerId ?? undefined : undefined,
    siteId ?? undefined,
  );
  const walletBalance = balanceQuery.data?.balance;
  const walletKnown = !balanceQuery.isLoading && walletBalance != null;

  const create = useCreateSpotPurchase();

  function handleAllocationModeChange(mode: AllocationMode) {
    setAllocationMode(mode);
    if (mode === "group" && groupSites.length > 0 && groupSplit.length === 0) {
      const equal = Math.floor(10000 / groupSites.length) / 100;
      const rows: GroupSplitRow[] = groupSites.map((s: { id: string }) => ({
        site_id: s.id, percentage: equal,
      }));
      const sum = rows.reduce((acc, r) => acc + r.percentage, 0);
      if (rows.length > 0) {
        rows[rows.length - 1].percentage =
          Math.round((rows[rows.length - 1].percentage + (100 - sum)) * 100) / 100;
      }
      setGroupSplit(rows);
    }
  }

  const updateItem = (rid: string, patch: Partial<ItemRow>) =>
    setItems((p) => p.map((it) => (it.rid === rid ? { ...it, ...patch } : it)));
  const removeItem = (rid: string) =>
    setItems((p) => (p.length > 1 ? p.filter((it) => it.rid !== rid) : p));
  const addItem = () => setItems((p) => [...p, emptyRow()]);

  const itemsValid = items.every((it) => {
    const hasMaterial = !!it.material || it.newMaterialName.trim().length > 0;
    return hasMaterial && Number(it.qty) > 0 && Number(it.rate) >= 0;
  });
  const vendorOk = !!vendor || vendorQuickAdd.trim().length > 0;
  const groupSplitValid =
    allocationMode === "own_site" ||
    (groupSplit.length > 0 && Math.abs(groupSplitTotal - 100) < 0.01);
  const totalOk = Number(totalAmount) > 0;
  // Admin/office must pick a payer source (and a name for custom/other-site).
  const payerOk =
    isSiteEngineer ||
    (!!payerSource && (!requiresPayerName(payerSource) || payerName.trim().length > 0));
  const canSubmit =
    !!siteId && vendorOk && items.length > 0 && itemsValid &&
    groupSplitValid && totalOk && payerOk && !create.isPending;

  async function handleSubmit() {
    if (!siteId || !canSubmit) return;
    setSubmitError(null);
    // Preserve granite/marble slab sizes (entered by dimension) in the batch
    // notes, since the payload only carries a numeric qty per item.
    const sizeNotes = items
      .filter((it) => it.sizeNote && it.sizeNote.trim())
      .map((it) => `${it.material?.name ?? (it.newMaterialName.trim() || "Material")}: ${it.sizeNote}`);
    const combinedNotes = [
      notes.trim(),
      sizeNotes.length ? `Sizes — ${sizeNotes.join(" · ")}` : "",
    ].filter(Boolean).join("\n");
    const payload: SpotPurchasePayload = {
      site_id: siteId,
      allocation_mode: allocationMode,
      total_amount: Number(totalAmount),
      payment_mode: paymentMode,
      vendor: vendor ? { id: vendor.id } : { name: vendorQuickAdd.trim() },
      items: items.map((it) =>
        it.material
          ? { material_id: it.material.id, qty: Number(it.qty), rate: Number(it.rate) }
          : {
              new_material: {
                name: it.newMaterialName.trim(),
                unit: it.newMaterialUnit || "piece",
                ...(it.newMaterialCategoryId ? { category_id: it.newMaterialCategoryId } : {}),
              },
              qty: Number(it.qty),
              rate: Number(it.rate),
            }
      ),
      bill_url: billReceipt?.url ?? null,
      payment_screenshot_url: paymentScreenshot?.url ?? null,
      notes: combinedNotes || undefined,
      payment_channel: isSiteEngineer ? "engineer_wallet" : "direct",
      ...(isSiteEngineer
        ? {}
        : {
            payer_source: payerSource,
            payer_name: requiresPayerName(payerSource) ? payerName.trim() : null,
          }),
      ...(allocationMode === "group"
        ? {
            provisional_split: groupSplit.map((r) => ({
              site_id: r.site_id, percentage: Number(r.percentage),
            })),
          }
        : {}),
    };
    try {
      const result = await create.mutateAsync(payload);
      const mismatches = items
        .filter(
          (it) =>
            it.material?.id &&
            it.catalogRate !== undefined &&
            vendor?.id &&
            Math.abs(it.rate - it.catalogRate) >= 0.01
        )
        .map((it) => ({
          material_id: it.material!.id,
          vendor_id: vendor!.id,
          name: materials.find((m) => m.id === it.material!.id)?.name ?? "—",
          paid: Number(it.rate),
          catalog: Number(it.catalogRate),
        }));
      if (mismatches.length > 0) {
        setPostSubmitRatePrompt({ items: mismatches, batchId: result.batch_id });
      } else {
        router.push("/site/today");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not record spot purchase");
    }
  }

  if (!siteId) {
    return <Alert severity="warning">Pick a site from the sidebar to record a spot purchase.</Alert>;
  }

  return (
    <Stack spacing={2}>
      {/* Vendor */}
      <Card variant="outlined"><CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Vendor</Typography>
        <Stack spacing={1}>
          <Autocomplete
            size="small"
            options={vendors as VendorOption[]}
            getOptionKey={(o) => o.id}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={vendor}
            onChange={(_, v) => { setVendor(v); if (v) setVendorQuickAdd(""); }}
            renderInput={(p) => <TextField {...p} label="Existing vendor" placeholder="Search vendors..." />}
          />
          <Typography variant="caption" color="text.secondary">
            …or quick-add a new vendor (office will review)
          </Typography>
          <TextField
            size="small" label="New vendor name" value={vendorQuickAdd}
            onChange={(e) => { setVendorQuickAdd(e.target.value); if (e.target.value.trim()) setVendor(null); }}
            disabled={!!vendor}
          />
        </Stack>
      </CardContent></Card>

      {/* Buying for */}
      {siteGroupId && (
        <Card variant="outlined"><CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Buying for</Typography>
          <ToggleButtonGroup
            exclusive size="small" value={allocationMode}
            onChange={(_, v) => v && handleAllocationModeChange(v)}
          >
            <ToggleButton value="own_site">Just this site</ToggleButton>
            <ToggleButton value="group">Group purchase (split later)</ToggleButton>
          </ToggleButtonGroup>
          {allocationMode === "group" && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                Provisional split — must sum to 100. Office finalizes later.
              </Typography>
              <Stack spacing={1}>
                {groupSplit.map((row, idx) => {
                  const site = groupSites.find((s: { id: string }) => s.id === row.site_id) as
                    | { name?: string } | undefined;
                  return (
                    <Stack key={row.site_id} direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                        {site?.name ?? row.site_id}
                      </Typography>
                      <TextField
                        size="small" type="number" value={row.percentage}
                        onChange={(e) => {
                          const next = [...groupSplit];
                          next[idx] = { ...next[idx], percentage: Number(e.target.value) };
                          setGroupSplit(next);
                        }}
                        sx={{ width: 100 }}
                        InputProps={{ endAdornment: <Typography variant="caption">%</Typography> }}
                      />
                    </Stack>
                  );
                })}
                <Typography
                  variant="caption"
                  color={Math.abs(groupSplitTotal - 100) < 0.01 ? "success.main" : "error.main"}
                >
                  Total: {groupSplitTotal.toFixed(2)}% {Math.abs(groupSplitTotal - 100) < 0.01 ? "OK" : "(must be 100)"}
                </Typography>
              </Stack>
            </Box>
          )}
        </CardContent></Card>
      )}

      {/* Items */}
      <Card variant="outlined"><CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle1">Items</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addItem}>Add item</Button>
        </Stack>
        <Stack spacing={1.5}>
          {items.map((it) => (
            <SpotPurchaseItemRow
              key={it.rid}
              item={it}
              vendorId={vendor?.id}
              materials={materials}
              categories={categories}
              canRemove={items.length > 1}
              onChange={(patch) => updateItem(it.rid, patch)}
              onRemove={() => removeItem(it.rid)}
            />
          ))}
          <Divider />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Items subtotal</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>₹{itemsLineTotal.toFixed(2)}</Typography>
          </Stack>
        </Stack>
      </CardContent></Card>

      {/* Receipts */}
      <Card variant="outlined"><CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Receipts</Typography>
        <Stack spacing={2}>
          <ReceiptCapture
            label="Bill photo" value={billReceipt} onChange={setBillReceipt}
            folder={`spot-purchases/bills/${siteId}`}
          />
          <ReceiptCapture
            label="Payment screenshot" value={paymentScreenshot} onChange={setPaymentScreenshot}
            folder={`spot-purchases/payments/${siteId}`}
          />
        </Stack>
      </CardContent></Card>

      {/* Payment */}
      <Card variant="outlined"><CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Payment</Typography>
        <Stack spacing={1.5}>
          {isSiteEngineer ? (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Paid from your site wallet — settles automatically from the money in it.
            </Alert>
          ) : (
            <>
              <TextField
                select size="small" label="Payment mode" value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              >
                {PAYMENT_MODES.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </TextField>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                  Paid from
                </Typography>
                <PayerSourceSelector
                  value={payerSource}
                  customName={payerName}
                  onChange={setPayerSource}
                  onCustomNameChange={setPayerName}
                  siteId={siteId ?? undefined}
                />
              </Box>
            </>
          )}
          <TextField
            size="small" type="number" label="Total amount paid (₹)" value={totalAmount}
            onChange={(e) => setTotalAmount(Number(e.target.value))}
            helperText={
              Math.abs(itemsLineTotal - Number(totalAmount)) > 0.01
                ? `Items subtotal is ₹${itemsLineTotal.toFixed(2)}. Difference will be recorded.`
                : "Matches items subtotal"
            }
          />
          <TextField
            size="small" multiline minRows={2} label="Notes (optional)"
            value={notes} onChange={(e) => setNotes(e.target.value)}
          />
        </Stack>
      </CardContent></Card>

      {/* Wallet preview — site engineers only (admins/office have no wallet). */}
      {isSiteEngineer && engineerId && siteId && (
        <WalletBalancePreview
          engineerName={userProfile?.name ?? "Engineer"}
          siteName={selectedSite?.name ?? "Site"}
          currentBalance={walletKnown ? (walletBalance as number) : 0}
          amount={Number(totalAmount) || 0}
          isLoading={!walletKnown}
        />
      )}

      {submitError && <Alert severity="error">{submitError}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" disabled={!canSubmit} onClick={handleSubmit}>
          {create.isPending ? "Recording…" : "Record spot purchase"}
        </Button>
      </Box>

      {postSubmitRatePrompt && (
        <RateUpdatePromptDialog
          batchId={postSubmitRatePrompt.batchId}
          items={postSubmitRatePrompt.items}
          onClose={() => {
            setPostSubmitRatePrompt(null);
            router.push("/site/today");
          }}
        />
      )}
    </Stack>
  );
}
