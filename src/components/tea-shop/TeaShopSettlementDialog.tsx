"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/cache/keys";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  Paper,
  Divider,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
} from "@mui/material";
import {
  Close as CloseIcon,
  QrCode2 as QrCodeIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import type { Database } from "@/types/database.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];
type TeaShopEntry = Database["public"]["Tables"]["tea_shop_entries"]["Row"];
type TeaShopSettlement = Database["public"]["Tables"]["tea_shop_settlements"]["Row"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];
type Subcontract = Database["public"]["Tables"]["subcontracts"]["Row"];
import type { PayerSource } from "@/types/settlement.types";
import dayjs from "dayjs";

interface TeaShopSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  shop: TeaShopAccount;
  pendingBalance: number;
  entries: TeaShopEntry[];
  onSuccess?: () => void;
  settlement?: TeaShopSettlement | null; // For edit mode
  isInGroup?: boolean; // Whether site is in a group
  siteGroupId?: string; // Site group ID for combined data
  filterBySiteId?: string; // Filter entries to specific site in group mode
}

interface SiteEngineer {
  id: string;
  name: string;
}

interface SubcontractOption {
  id: string;
  title: string;
  team_name?: string;
}

interface AllocationPreview {
  entryId: string;
  date: string;
  entryAmount: number;
  previouslyPaid: number;
  allocatedAmount: number;
  isFullyPaid: boolean;
  siteName?: string; // For group mode
  isGroupEntry?: boolean; // Whether this is a group entry (split across sites)
}

// Generate settlement reference in TSS-YYMMDD-NNN format
const generateSettlementRef = (): string => {
  const date = dayjs().format("YYMMDD");
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `TSS-${date}-${random}`;
};

export default function TeaShopSettlementDialog({
  open,
  onClose,
  shop,
  pendingBalance,
  entries,
  onSuccess,
  settlement,
  isInGroup = false,
  siteGroupId,
  filterBySiteId,
}: TeaShopSettlementDialogProps) {
  const isEditMode = !!settlement;
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [amountPaying, setAmountPaying] = useState(Math.round(pendingBalance));
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerType, setPayerType] = useState<"site_engineer" | "company_direct">("company_direct");
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [createWalletTransaction, setCreateWalletTransaction] = useState(true);
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [customPayerName, setCustomPayerName] = useState("");

  // Settlement mode: waterfall (allocate to entries) or standalone (historical/no allocation)
  const [settlementMode, setSettlementMode] = useState<"waterfall" | "standalone">("waterfall");

  // Site engineers list
  const [engineers, setEngineers] = useState<SiteEngineer[]>([]);

  // Subcontracts for linking
  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);
  const [selectedSubcontractId, setSelectedSubcontractId] = useState<string>("");

  // Unsettled entries for waterfall (fetched fresh)
  const [unsettledEntries, setUnsettledEntries] = useState<TeaShopEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // 1. Fetch dependencies (Engineers, Subcontracts) when dialog opens
  useEffect(() => {
    if (open) {
      // Fetch site engineers and subcontracts
      fetchEngineers();
      fetchSubcontracts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedSite?.id]);

  // 2. Fetch unsettled entries when dialog opens or filter changes
  useEffect(() => {
    if (open) {
      fetchUnsettledEntries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, siteGroupId, filterBySiteId, isInGroup, shop?.id]);

  // 3. Initialize form state when dialog opens
  useEffect(() => {
    if (open) {
      if (isEditMode && settlement) {
        // Edit mode - populate from settlement
        setAmountPaying(settlement.amount_paid || 0);
        setPaymentDate(settlement.payment_date);
        setPaymentMode((settlement.payment_mode as PaymentMode) || "cash");
        setPayerType(settlement.payer_type === "site_engineer" ? "site_engineer" : "company_direct");
        setSelectedEngineerId(settlement.site_engineer_id || "");
        setCreateWalletTransaction(false); // Don't create new transaction when editing
        setNotes(settlement.notes || "");
        setSelectedSubcontractId(settlement.subcontract_id || "");
        setProofUrl((settlement as any).proof_url || null);
        setPayerSource((settlement as any).payer_source || "own_money");
        setCustomPayerName((settlement as any).payer_name || "");
      } else {
        // New settlement - reset form
        // OR rely on user input if not first open? No, we want to reset on open.
        // We use pendingBalance for initial value, but don't track it for updates
        setAmountPaying(Math.round(pendingBalance));
        setPaymentDate(dayjs().format("YYYY-MM-DD"));
        setPaymentMode("cash");
        setPayerType("company_direct");
        setSelectedEngineerId("");
        setCreateWalletTransaction(true);
        setNotes("");
        setSelectedSubcontractId("");
        setProofUrl(null);
        setPayerSource("own_money");
        setCustomPayerName("");
        setSettlementMode("waterfall");
      }
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settlement]); // Exclude pendingBalance to allow user overrides and prevent loop

  const fetchEngineers = async () => {
    if (!selectedSite) return;

    try {
      // Get users who have site_engineer role or are assigned to this site
      const { data } = await supabase
        .from("users")
        .select("id, name")
        .in("role", ["site_engineer", "admin", "office"]);

      setEngineers(data || []);
    } catch (err) {
      console.error("Error fetching engineers:", err);
    }
  };

  const fetchSubcontracts = async () => {
    if (!selectedSite) return;

    try {
      // Fetch teams first to avoid FK ambiguity issues
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .eq("site_id", selectedSite.id);

      const teamsMap = new Map<string, string>();
      (teamsData || []).forEach((t: any) => teamsMap.set(t.id, t.name));

      const { data } = await supabase
        .from("subcontracts")
        .select("id, title, team_id")
        .eq("site_id", selectedSite.id)
        .in("status", ["draft", "active"]);

      const options: SubcontractOption[] = (data || []).map((sc: any) => ({
        id: sc.id,
        title: sc.title,
        team_name: sc.team_id ? teamsMap.get(sc.team_id) : undefined,
      }));
      setSubcontracts(options);
    } catch (err) {
      console.error("Error fetching subcontracts:", err);
    }
  };

  // Fetch unsettled entries (oldest first for waterfall)
  // When in group mode, fetches from ALL sites in the group (or filtered site if filterBySiteId is set)
  // FIXED: Now includes group entries (is_group_entry=true) with their site allocations
  const fetchUnsettledEntries = async () => {
    setLoadingEntries(true);
    try {
      if (isInGroup && siteGroupId) {
        // Fetch combined unsettled entries from all sites in the group
        const { data: sites } = await (supabase as any)
          .from("sites")
          .select("id, name")
          .eq("site_group_id", siteGroupId);

        if (!sites || sites.length === 0) {
          setUnsettledEntries([]);
          return;
        }

        const allSiteIds = sites.map((s: any) => s.id);
        const siteNameMap = new Map<string, string>();
        sites.forEach((s: any) => siteNameMap.set(s.id, s.name));

        // Determine target site IDs based on filter
        const targetSiteIds = (filterBySiteId && filterBySiteId !== "all")
          ? [filterBySiteId]
          : allSiteIds;

        // 1. Fetch individual site entries (site_id is set, not group entries)
        const { data: siteEntries } = await (supabase as any)
          .from("tea_shop_entries")
          .select("*")
          .in("site_id", targetSiteIds)
          .eq("is_group_entry", false)
          .order("date", { ascending: true });

        // Filter for unpaid individual entries
        const unpaidSiteEntries = (siteEntries || []).filter((entry: any) => {
          const totalAmount = entry.total_amount || 0;
          const amountPaid = entry.amount_paid || 0;
          return entry.is_fully_paid !== true && amountPaid < totalAmount;
        });

        // 2. Fetch group entries with their allocations for the target site(s)
        const { data: groupEntries } = await (supabase as any)
          .from("tea_shop_entries")
          .select(`
            *,
            allocations:tea_shop_entry_allocations(
              site_id,
              allocated_amount,
              day_units_sum,
              worker_count
            )
          `)
          .eq("is_group_entry", true)
          .eq("site_group_id", siteGroupId)
          .order("date", { ascending: true });

        // Process group entries - include only if they have allocation for target site(s)
        const processedGroupEntries: any[] = [];
        (groupEntries || []).forEach((entry: any) => {
          // Skip fully paid entries
          if (entry.is_fully_paid === true) return;

          const allocs = entry.allocations || [];

          if (filterBySiteId && filterBySiteId !== "all") {
            // Filtering to specific site - find allocation for this site
            const siteAlloc = allocs.find((a: any) => a.site_id === filterBySiteId);
            if (siteAlloc && siteAlloc.allocated_amount > 0) {
              // Calculate proportional amount_paid for this site
              const totalEntryAmount = entry.total_amount || 0;
              const siteAmount = siteAlloc.allocated_amount || 0;
              const ratio = totalEntryAmount > 0 ? siteAmount / totalEntryAmount : 0;
              const siteAmountPaid = Math.round((entry.amount_paid || 0) * ratio);
              const siteRemaining = siteAmount - siteAmountPaid;

              // Only include if there's still unpaid amount for this site
              if (siteRemaining > 0) {
                processedGroupEntries.push({
                  ...entry,
                  // Override with site-specific values for waterfall calculation
                  site_id: filterBySiteId,
                  site_name: siteNameMap.get(filterBySiteId) || "Unknown",
                  total_amount: siteAmount, // Use site's allocated portion
                  amount_paid: siteAmountPaid, // Use proportional paid amount
                  original_total_amount: totalEntryAmount,
                  isGroupEntry: true,
                });
              }
            }
          } else {
            // No filter - include full group entry if not fully paid
            const totalAmount = entry.total_amount || 0;
            const amountPaid = entry.amount_paid || 0;
            if (amountPaid < totalAmount) {
              processedGroupEntries.push({
                ...entry,
                site_name: "Group Entry",
                isGroupEntry: true,
              });
            }
          }
        });

        // 3. Combine and sort by date (oldest first for FIFO waterfall)
        const allEntries = [
          ...unpaidSiteEntries.map((e: any) => ({
            ...e,
            site_name: siteNameMap.get(e.site_id) || "Unknown",
            isGroupEntry: false,
          })),
          ...processedGroupEntries,
        ].sort((a, b) => a.date.localeCompare(b.date));

        setUnsettledEntries(allEntries);
      } else {
        // Single site mode - fetch only from current shop
        const { data } = await (supabase
          .from("tea_shop_entries") as any)
          .select("*")
          .eq("tea_shop_id", shop.id)
          .or("is_fully_paid.is.null,is_fully_paid.eq.false")
          .order("date", { ascending: true }); // Oldest first

        // Filter out entries that are actually fully paid (amount_paid >= total_amount)
        const filteredData = (data || []).filter((entry: any) => {
          const totalAmount = entry.total_amount || 0;
          const amountPaid = entry.amount_paid || 0;
          return amountPaid < totalAmount;
        });

        setUnsettledEntries(filteredData as TeaShopEntry[]);
      }
    } catch (err) {
      console.error("Error fetching unsettled entries:", err);
    } finally {
      setLoadingEntries(false);
    }
  };

  // Calculate waterfall allocation preview
  const allocationPreview = useMemo((): AllocationPreview[] => {
    if (amountPaying <= 0 || unsettledEntries.length === 0) return [];

    let remaining = amountPaying;
    const allocations: AllocationPreview[] = [];

    for (const entry of unsettledEntries) {
      if (remaining <= 0) break;

      const entryAmount = entry.total_amount || 0;
      const previouslyPaid = (entry as any).amount_paid || 0;
      const entryRemaining = entryAmount - previouslyPaid;

      if (entryRemaining <= 0) continue;

      const toAllocate = Math.min(remaining, entryRemaining);

      allocations.push({
        entryId: entry.id,
        date: entry.date,
        entryAmount,
        previouslyPaid,
        allocatedAmount: toAllocate,
        isFullyPaid: toAllocate >= entryRemaining,
        siteName: (entry as any).site_name, // Include site name for group mode
        isGroupEntry: (entry as any).isGroupEntry, // Include group entry flag
      });

      remaining -= toAllocate;
    }

    return allocations;
  }, [amountPaying, unsettledEntries]);

  // Calculate totals
  const totalAllocated = allocationPreview.reduce((sum, a) => sum + a.allocatedAmount, 0);
  const balanceRemaining = Math.max(0, pendingBalance - amountPaying);

  const handleSave = async () => {
    if (amountPaying <= 0) {
      setError("Please enter amount to pay");
      return;
    }

    if (payerType === "site_engineer" && !selectedEngineerId) {
      setError("Please select a site engineer");
      return;
    }

    if (paymentMode !== "cash" && !proofUrl) {
      setError("Please upload payment proof screenshot (required for non-cash payments)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let engineerTransactionId: string | null = null;

      // If site engineer is paying, create wallet transaction
      if (payerType === "site_engineer" && createWalletTransaction && !isEditMode) {
        const transactionData = {
          user_id: selectedEngineerId,
          site_id: selectedSite?.id,
          transaction_type: "spent_on_behalf",
          amount: amountPaying,
          transaction_date: paymentDate,
          description: `Tea shop payment - ${shop.shop_name}`,
          recipient_type: "vendor",
          payment_mode: paymentMode,
          is_settled: false,
          recorded_by: userProfile?.name || "System",
          recorded_by_user_id: userProfile?.id || null,
        };

        const { data: txData, error: txError } = await (supabase
          .from("site_engineer_transactions") as any)
          .insert(transactionData)
          .select()
          .single();

        if (txError) throw txError;
        engineerTransactionId = txData?.id || null;
      }

      // Generate settlement reference for new settlements
      const settlementRef = isEditMode
        ? (settlement as any)?.settlement_reference || generateSettlementRef()
        : generateSettlementRef();

      // Settlement record data
      const isStandalone = settlementMode === "standalone";
      // Determine site_id for per-site waterfall tracking
      const effectiveSiteId = filterBySiteId && filterBySiteId !== "all"
        ? filterBySiteId
        : selectedSite?.id || null;

      const settlementData = {
        tea_shop_id: shop.id,
        site_id: effectiveSiteId, // NEW: For per-site FIFO waterfall
        settlement_reference: settlementRef,
        // For standalone: period_start and period_end = payment_date
        period_start: isStandalone ? paymentDate : (allocationPreview.length > 0 ? allocationPreview[0].date : paymentDate),
        period_end: isStandalone ? paymentDate : (allocationPreview.length > 0 ? allocationPreview[allocationPreview.length - 1].date : paymentDate),
        // For standalone: entries_total = amount_paid (represents the settlement value itself)
        entries_total: isStandalone ? amountPaying : totalAllocated,
        previous_balance: 0, // Not using period-based anymore
        total_due: isStandalone ? amountPaying : pendingBalance,
        amount_paid: amountPaying,
        balance_remaining: isStandalone ? 0 : balanceRemaining,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        payer_type: payerType,
        site_engineer_id: payerType === "site_engineer" ? selectedEngineerId : null,
        site_engineer_transaction_id: isEditMode ? settlement?.site_engineer_transaction_id : engineerTransactionId,
        is_engineer_settled: isEditMode ? settlement?.is_engineer_settled : false,
        status: isStandalone ? "completed" : (balanceRemaining > 0 ? "partial" : "completed"),
        notes: notes.trim() || null,
        recorded_by: userProfile?.name || null,
        recorded_by_user_id: userProfile?.id || null,
        subcontract_id: selectedSubcontractId || null,
        proof_url: proofUrl,
        payer_source: payerSource,
        payer_name: (payerSource === "custom" || payerSource === "other_site_money")
          ? customPayerName
          : null,
        is_standalone: isStandalone,
      };

      let settlementId: string;

      if (isEditMode && settlement) {
        // Update existing settlement
        const { error: settlementError } = await (supabase
          .from("tea_shop_settlements") as any)
          .update(settlementData)
          .eq("id", settlement.id);

        if (settlementError) throw settlementError;
        settlementId = settlement.id;

        // Delete old allocations
        await (supabase.from as any)("tea_shop_settlement_allocations")
          .delete()
          .eq("settlement_id", settlement.id);
      } else {
        // Create new settlement
        const { data: newSettlement, error: settlementError } = await (supabase
          .from("tea_shop_settlements") as any)
          .insert(settlementData)
          .select()
          .single();

        if (settlementError) throw settlementError;
        settlementId = newSettlement.id;
      }

      // Create allocation records and update entries - ONLY for waterfall mode
      if (!isStandalone) {
        // Deduplicate allocations by entryId to prevent unique constraint violations
        const seenEntryIds = new Set<string>();
        const uniqueAllocations = allocationPreview.filter((alloc) => {
          if (seenEntryIds.has(alloc.entryId)) {
            console.warn(`Duplicate entry in allocation: ${alloc.entryId}`);
            return false;
          }
          seenEntryIds.add(alloc.entryId);
          return true;
        });

        for (const alloc of uniqueAllocations) {
          // Use upsert to handle potential conflicts (settlement_id, entry_id is unique)
          const { error: allocError } = await (supabase.from as any)("tea_shop_settlement_allocations")
            .upsert({
              settlement_id: settlementId,
              entry_id: alloc.entryId,
              allocated_amount: alloc.allocatedAmount,
            }, {
              onConflict: "settlement_id,entry_id",
            });

          if (allocError) {
            console.error(`Error upserting allocation for entry ${alloc.entryId}:`, allocError);
          }

          // Update entry with new payment info
          const newPaid = alloc.previouslyPaid + alloc.allocatedAmount;
          await (supabase
            .from("tea_shop_entries") as any)
            .update({
              amount_paid: newPaid,
              is_fully_paid: alloc.isFullyPaid,
            })
            .eq("id", alloc.entryId);
        }
      }

      // Invalidate queries to refresh data immediately
      if (siteGroupId) {
        // Group mode - invalidate combined tea shop queries
        queryClient.invalidateQueries({ queryKey: queryKeys.combinedTeaShop.settlements(siteGroupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.combinedTeaShop.entries(siteGroupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.combinedTeaShop.pending(siteGroupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.combinedTeaShop.all });
      }
      // Also invalidate company tea shop queries for the specific shop
      if (shop?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.byId(shop.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.settlements(shop.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.entries(shop.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.companyTeaShops.all });
      }

      onSuccess?.();
    } catch (err: any) {
      console.error("Error saving settlement:", err);
      setError(err.message || "Failed to save settlement");
    } finally {
      setLoading(false);
    }
  };

  // Get shop's QR code and UPI ID
  const shopQrCodeUrl = (shop as any).qr_code_url;
  const shopUpiId = (shop as any).upi_id;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6" component="span" fontWeight={700}>
            {isEditMode ? "Edit Settlement" : "Pay Shop"}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Shop Info with QR Code */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            {/* QR Code Display */}
            {shopQrCodeUrl && (
              <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                <Box
                  component="img"
                  src={shopQrCodeUrl}
                  alt="Payment QR"
                  sx={{
                    width: 120,
                    height: 120,
                    objectFit: "contain",
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Scan to Pay
                </Typography>
              </Box>
            )}

            {/* Shop Details */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {shop.shop_name}
              </Typography>
              {shopUpiId && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  UPI: <strong>{shopUpiId}</strong>
                </Typography>
              )}
              <Box sx={{ mt: 1, p: 1, bgcolor: "error.50", borderRadius: 1 }}>
                <Typography variant="body2" color="error.main">
                  Pending Balance: <strong>₹{pendingBalance.toLocaleString()}</strong>
                </Typography>
              </Box>
            </Box>

            {/* QR Icon if no QR code */}
            {!shopQrCodeUrl && (
              <Box sx={{ p: 2, bgcolor: "grey.100", borderRadius: 1 }}>
                <QrCodeIcon sx={{ fontSize: 48, color: "text.disabled" }} />
              </Box>
            )}
          </Box>
        </Paper>

        {/* Amount Paying */}
        <TextField
          label="Amount Paying"
          type="number"
          value={amountPaying}
          onChange={(e) => setAmountPaying(Math.max(0, parseFloat(e.target.value) || 0))}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          slotProps={{
            htmlInput: { min: 0 },
            input: { startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> },
          }}
        />

        {/* Settlement Type Selection */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            SETTLEMENT TYPE
          </Typography>
          <RadioGroup
            value={settlementMode}
            onChange={(e) => setSettlementMode(e.target.value as "waterfall" | "standalone")}
          >
            <FormControlLabel
              value="waterfall"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Allocate to entries</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Payment applied to oldest unpaid entries (FIFO)
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="standalone"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Advance/Extra Payment</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Pay extra or record advance - credits carry forward
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </Paper>

        {/* Info alert for standalone mode */}
        {settlementMode === "standalone" && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              This payment counts toward total paid but won&apos;t link to specific entries.
              Use for advance payments or when daily breakdown doesn&apos;t exist.
            </Typography>
          </Alert>
        )}

        {/* Alert when no unsettled entries in waterfall mode */}
        {settlementMode === "waterfall" && !loadingEntries && unsettledEntries.length === 0 && (
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600}>
              All entries are fully settled!
            </Typography>
            <Typography variant="body2">
              Switch to &quot;Advance/Extra Payment&quot; mode to make additional payments that will carry forward as credit.
            </Typography>
          </Alert>
        )}

        {/* Waterfall Allocation Preview - Only show in waterfall mode */}
        {settlementMode === "waterfall" && allocationPreview.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
              ALLOCATION PREVIEW (Oldest First){isInGroup && " - All Sites"}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Date</TableCell>
                  {isInGroup && (
                    <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Site</TableCell>
                  )}
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Entry</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Paying</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allocationPreview.map((alloc, idx) => (
                  <TableRow key={alloc.entryId}>
                    <TableCell sx={{ py: 0.75 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {idx === 0 && (
                          <Chip label="Oldest" size="small" color="warning" sx={{ height: 18, fontSize: "0.6rem" }} />
                        )}
                        <Typography variant="body2" fontSize="0.8rem">
                          {dayjs(alloc.date).format("DD MMM")}
                        </Typography>
                      </Box>
                    </TableCell>
                    {isInGroup && (
                      <TableCell sx={{ py: 0.75 }}>
                        <Chip
                          label={alloc.siteName ? (alloc.siteName.length > 10 ? alloc.siteName.slice(0, 8) + "..." : alloc.siteName) : "?"}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ py: 0.75 }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
                        {alloc.isGroupEntry && (
                          <Tooltip title="Group entry - settling covers all sites">
                            <GroupsIcon fontSize="small" color="primary" sx={{ fontSize: "0.9rem" }} />
                          </Tooltip>
                        )}
                        <Typography variant="body2" fontSize="0.8rem">
                          ₹{alloc.entryAmount.toLocaleString()}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.75 }}>
                      <Typography variant="body2" fontSize="0.8rem" fontWeight={600} color="success.main">
                        ₹{alloc.allocatedAmount.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75 }}>
                      <Chip
                        label={alloc.isFullyPaid ? "Full" : "Partial"}
                        size="small"
                        color={alloc.isFullyPaid ? "success" : "warning"}
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Box sx={{ mt: 1.5, display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">
                Entries covered: {allocationPreview.length}{isInGroup && " (from all sites)"}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                Total: ₹{totalAllocated.toLocaleString()}
              </Typography>
            </Box>
          </Paper>
        )}

        {/* Loading indicator - only for waterfall mode */}
        {settlementMode === "waterfall" && loadingEntries && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {/* Balance After Payment - only show for waterfall mode */}
        {settlementMode === "waterfall" && (
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Balance After Payment:
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              color={balanceRemaining > 0 ? "error.main" : "success.main"}
            >
              ₹{balanceRemaining.toLocaleString()}
            </Typography>
          </Box>
        )}

        {/* Payment Date */}
        <TextField
          label="Payment Date"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ mb: 3 }}
        />

        {/* Who is Paying */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            WHO IS PAYING?
          </Typography>

          <RadioGroup
            value={payerType}
            onChange={(e) => setPayerType(e.target.value as "site_engineer" | "company_direct")}
          >
            <FormControlLabel
              value="site_engineer"
              control={<Radio />}
              label="Site Engineer"
            />
            <FormControlLabel
              value="company_direct"
              control={<Radio />}
              label="Company Direct"
            />
          </RadioGroup>

          {payerType === "site_engineer" && (
            <Box sx={{ mt: 2, pl: 4 }}>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Select Engineer</InputLabel>
                <Select
                  value={selectedEngineerId}
                  onChange={(e) => setSelectedEngineerId(e.target.value)}
                  label="Select Engineer"
                >
                  {engineers.map((eng) => (
                    <MenuItem key={eng.id} value={eng.id}>
                      {eng.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {!isEditMode && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={createWalletTransaction}
                      onChange={(e) => setCreateWalletTransaction(e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">Create wallet transaction</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Records as &quot;Spent on Behalf&quot; in engineer wallet
                      </Typography>
                    </Box>
                  }
                />
              )}
            </Box>
          )}
        </Paper>

        {/* Payment Source */}
        <PayerSourceSelector
          value={payerSource}
          customName={customPayerName}
          onChange={setPayerSource}
          onCustomNameChange={setCustomPayerName}
          compact
        />

        {/* Link to Subcontract (Optional) */}
        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel>Link to Subcontract (Optional)</InputLabel>
          <Select
            value={selectedSubcontractId}
            onChange={(e) => setSelectedSubcontractId(e.target.value)}
            label="Link to Subcontract (Optional)"
          >
            <MenuItem value="">
              <em>None - General Site Expense</em>
            </MenuItem>
            {subcontracts.map((sc) => (
              <MenuItem key={sc.id} value={sc.id}>
                {sc.title}{sc.team_name ? ` (${sc.team_name})` : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Payment Mode */}
        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel>Payment Mode</InputLabel>
          <Select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            label="Payment Mode"
          >
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="upi">UPI</MenuItem>
            <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
            <MenuItem value="cheque">Cheque</MenuItem>
          </Select>
        </FormControl>

        {/* Payment Proof Uploader - required for all non-cash payments */}
        {paymentMode !== "cash" && (
          <Box sx={{ mb: 3 }}>
            <FileUploader
              supabase={supabase}
              bucketName="settlement-proofs"
              folderPath={`tea-shop/${shop.id}`}
              fileNamePrefix="tea-settlement"
              accept="image"
              label="Payment Screenshot (Required)"
              helperText="Upload screenshot of payment confirmation"
              compact
              uploadOnSelect
              value={proofUrl ? { name: "Payment Proof", size: 0, url: proofUrl } : null}
              onUpload={(file: UploadedFile) => setProofUrl(file.url)}
              onRemove={() => setProofUrl(null)}
            />
          </Box>
        )}

        {/* Notes */}
        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          rows={2}
          size="small"
          placeholder="e.g., Settled as per shop notebook..."
        />
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || amountPaying <= 0}
        >
          {loading ? <CircularProgress size={24} /> : isEditMode ? "Update Settlement" : "Record Payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
