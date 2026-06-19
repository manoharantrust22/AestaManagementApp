"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Autocomplete,
  Box,
  Button,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tabs,
  Tab,
  LinearProgress,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
  Fab,
} from "@mui/material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Add,
  Delete,
  Edit,
  Visibility,
  Payment as PaymentIcon,
  Calculate as CalculateIcon,
  AttachMoney as MoneyIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import SubcontractPaymentBreakdown from "@/components/subcontracts/SubcontractPaymentBreakdown";
import SpecialistLaborerPicker from "@/components/contracts/SpecialistLaborerPicker";
import type { Database } from "@/types/database.types";

type Subcontract = Database["public"]["Tables"]["subcontracts"]["Row"];
type ContractType = Database["public"]["Enums"]["contract_type"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];
type MeasurementUnit = Database["public"]["Enums"]["measurement_unit"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];
type PaymentType = Database["public"]["Enums"]["contract_payment_type"];
type PaymentChannel = string;
import { calculateSubcontractTotals } from "@/lib/services/subcontractService";
import { recordSpend } from "@/lib/services/engineerWalletV2";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import dayjs from "dayjs";
import { useConcretingTeams } from "@/hooks/queries/useConcretingTeams";
import ConcretingTeamDialog from "@/components/concreting/ConcretingTeamDialog";

interface SubcontractWithDetails extends Subcontract {
  team_name?: string;
  laborer_name?: string;
  trade_name?: string | null;
  total_paid?: number;
  balance_due?: number;
  completion_percentage?: number;
  record_count?: number;
}

export default function SiteSubcontractsPage() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const supabase = createClient();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const editIdFromUrl = searchParams.get("edit");
  // Track which deep-link we've already opened so a closed dialog doesn't
  // re-open on every render while ?edit=… is still in the URL.
  const consumedEditIdRef = useRef<string | null>(null);

  const [subcontracts, setSubcontracts] = useState<SubcontractWithDetails[]>(
    []
  );
  const [teams, setTeams] = useState<any[]>([]);
  const [laborers, setLaborers] = useState<any[]>([]);
  const [tradeCategories, setTradeCategories] = useState<
    { id: string; name: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingSubcontract, setEditingSubcontract] = useState<Subcontract | null>(
    null
  );
  const [selectedSubcontract, setSelectedSubcontract] =
    useState<SubcontractWithDetails | null>(null);
  const [error, setError] = useState("");

  // Filters
  const [activeTab, setActiveTab] = useState<ContractStatus | "all">("all");

  // Form state (no site_id - will use selectedSite.id)
  const [form, setForm] = useState({
    contract_type: "mesthri" as ContractType,
    team_id: "",
    laborer_id: "",
    trade_category_id: "", // Optional: enables Trades/attendance tracking. "" = payments-only.
    // Day-work (external concreting gang) fields
    concreting_team_id: "",
    contractor_name: "",
    male_count: 0,
    female_count: 0,
    machine_rental: 0,
    transport_cost: 0,
    breakdown_notes: "",
    title: "",
    description: "",
    scope_of_work: "",
    total_value: 0,
    measurement_unit: "sqft" as MeasurementUnit,
    rate_per_unit: 0,
    total_units: 0,
    weekly_advance_rate: 0,
    start_date: dayjs().format("YYYY-MM-DD"),
    expected_end_date: "",
    status: "draft" as ContractStatus,
    is_rate_based: true,
  });

  // Concreting-team catalog (for the day_work picker) + inline quick-add dialog
  const { data: concretingTeams = [] } = useConcretingTeams();
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);

  // Payment form - Enhanced with payment channel and period tracking
  const [paymentForm, setPaymentForm] = useState({
    payment_type: "part_payment" as PaymentType,
    amount: 0,
    payment_date: dayjs().format("YYYY-MM-DD"),
    payment_mode: "cash" as PaymentMode,
    payment_channel: "via_site_engineer" as PaymentChannel,
    period_from_date: dayjs().subtract(6, "day").format("YYYY-MM-DD"),
    period_to_date: dayjs().format("YYYY-MM-DD"),
    notes: "",
  });

  // Site engineers list for payment channel
  const [siteEngineers, setSiteEngineers] = useState<any[]>([]);
  const [selectedSiteEngineer, setSelectedSiteEngineer] = useState<string>("");

  const canEdit = hasEditPermission(userProfile?.role);

  // Fetch teams, laborers, and site engineers
  useEffect(() => {
    const fetchOptions = async () => {
      const [teamsRes, laborersRes, engineersRes, tradesRes] =
        await Promise.all([
          supabase
            .from("teams")
            .select("id, name")
            .eq("status", "active")
            .order("name"),
          supabase
            .from("laborers")
            .select(
              "id, name, team_id, labor_categories(name), role:labor_roles(name)"
            )
            .eq("status", "active")
            .order("name"),
          supabase
            .from("users")
            .select("id, name, role")
            .in("role", ["site_engineer", "admin", "office"])
            .order("name"),
          supabase
            .from("labor_categories")
            .select("id, name")
            .eq("is_active", true)
            .order("name"),
        ]);

      setTradeCategories(
        ((tradesRes.data as { id: string; name: string }[] | null) || []).filter(
          Boolean
        )
      );
      setTeams(teamsRes.data || []);
      setLaborers(
        (laborersRes.data || []).map((l: any) => ({
          ...l,
          category_name: l.labor_categories?.name || "Unknown",
          role_name: l.role?.name || "",
        }))
      );
      setSiteEngineers(engineersRes.data || []);
    };

    fetchOptions();
  }, []);

  // Fetch subcontracts for selected site using shared service
  const fetchSubcontracts = async () => {
    if (!selectedSite) return;

    setLoading(true);
    try {
      // Note: We avoid nested joins like teams(name), laborers(name) to prevent FK ambiguity issues
      // Teams and laborers are already fetched separately in fetchOptions
      let query = supabase
        .from("subcontracts")
        .select("*")
        .eq("site_id", selectedSite.id)
        .order("created_at", { ascending: false });

      if (activeTab !== "all") {
        query = query.eq("status", activeTab);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Use shared service for consistent calculation across all pages
      // totalPaid = subcontract_payments + labor_payments + cleared expenses
      const subcontractIds = (data || []).map((s: any) => s.id);
      const totalsMap = await calculateSubcontractTotals(supabase, subcontractIds);

      // Merge with subcontract data
      const subcontractsWithDetails: SubcontractWithDetails[] = (data || []).map(
        (subcontract: any) => {
          const totals = totalsMap.get(subcontract.id);

          // Lookup team and laborer names from already-fetched data
          const teamName = subcontract.team_id
            ? teams.find((t) => t.id === subcontract.team_id)?.name
            : undefined;
          const laborerName = subcontract.laborer_id
            ? laborers.find((l) => l.id === subcontract.laborer_id)?.name
            : undefined;
          const tradeName = subcontract.trade_category_id
            ? tradeCategories.find(
                (tc) => tc.id === subcontract.trade_category_id
              )?.name ?? null
            : null;

          return {
            ...subcontract,
            team_name: teamName,
            laborer_name: laborerName,
            trade_name: tradeName,
            total_paid: totals?.totalPaid || 0,
            balance_due: totals?.balance || subcontract.total_value || 0,
            completion_percentage:
              subcontract.total_value > 0
                ? ((totals?.totalPaid || 0) / subcontract.total_value) * 100
                : 0,
            record_count: totals?.totalRecordCount || 0,
          };
        }
      );

      setSubcontracts(subcontractsWithDetails);
    } catch (err: any) {
      console.error("Error fetching subcontracts:", err);
      setError("Failed to load subcontracts: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSite && teams.length > 0) {
      fetchSubcontracts();
    }
  }, [activeTab, selectedSite, teams, laborers, tradeCategories]);

  // Deep-link: open the edit dialog when /site/subcontracts?edit=<id> is hit.
  // Used by the "Assign one →" alert in MestriSettleDialog so the user lands
  // directly on the right subcontract instead of having to find it manually.
  useEffect(() => {
    if (!editIdFromUrl) return;
    if (consumedEditIdRef.current === editIdFromUrl) return;
    if (subcontracts.length === 0) return;
    const target = subcontracts.find((s) => s.id === editIdFromUrl);
    if (!target) return;
    consumedEditIdRef.current = editIdFromUrl;
    handleOpenDialog(target);
    // Strip ?edit=… from the URL so a refresh doesn't keep re-opening it.
    router.replace(pathname);
  }, [editIdFromUrl, subcontracts, router, pathname]);

  // Auto-calculate total value for rate-based contracts
  useEffect(() => {
    if (form.is_rate_based && form.rate_per_unit > 0 && form.total_units > 0) {
      const calculatedValue = form.rate_per_unit * form.total_units;
      setForm((prev) => ({
        ...prev,
        total_value: Math.round(calculatedValue * 100) / 100,
      }));
    }
  }, [form.is_rate_based, form.rate_per_unit, form.total_units]);

  const handleOpenDialog = (subcontract?: Subcontract) => {
    if (subcontract) {
      setEditingSubcontract(subcontract);
      const isRateBased =
        (subcontract.rate_per_unit ?? 0) > 0 && (subcontract.total_units ?? 0) > 0;
      setForm({
        contract_type: subcontract.contract_type,
        team_id: subcontract.team_id || "",
        laborer_id: subcontract.laborer_id || "",
        trade_category_id: subcontract.trade_category_id || "",
        concreting_team_id: subcontract.concreting_team_id || "",
        contractor_name: subcontract.contractor_name || "",
        male_count: subcontract.male_count || 0,
        female_count: subcontract.female_count || 0,
        machine_rental: subcontract.machine_rental || 0,
        transport_cost: subcontract.transport_cost || 0,
        breakdown_notes: subcontract.breakdown_notes || "",
        title: subcontract.title,
        description: subcontract.description || "",
        scope_of_work: subcontract.scope_of_work || "",
        total_value: subcontract.total_value,
        measurement_unit: subcontract.measurement_unit || "sqft",
        rate_per_unit: subcontract.rate_per_unit || 0,
        total_units: subcontract.total_units || 0,
        weekly_advance_rate: subcontract.weekly_advance_rate || 0,
        start_date: subcontract.start_date || "",
        expected_end_date: subcontract.expected_end_date || "",
        status: subcontract.status,
        is_rate_based: isRateBased,
      });
    } else {
      setEditingSubcontract(null);
      setForm({
        contract_type: "mesthri",
        team_id: "",
        laborer_id: "",
        trade_category_id: "",
        concreting_team_id: "",
        contractor_name: "",
        male_count: 0,
        female_count: 0,
        machine_rental: 0,
        transport_cost: 0,
        breakdown_notes: "",
        title: "",
        description: "",
        scope_of_work: "",
        total_value: 0,
        measurement_unit: "sqft",
        rate_per_unit: 0,
        total_units: 0,
        weekly_advance_rate: 0,
        start_date: dayjs().format("YYYY-MM-DD"),
        expected_end_date: "",
        status: "draft",
        is_rate_based: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSubcontract(null);
  };

  const handleSubmit = async () => {
    if (!userProfile || !selectedSite) return;

    if (!form.title || form.total_value <= 0) {
      setError("Please fill in all required fields with valid values");
      return;
    }

    if (form.contract_type === "mesthri" && !form.team_id) {
      setError("Please select a team for Mesthri subcontract");
      return;
    }

    if (form.contract_type === "specialist" && !form.laborer_id) {
      setError("Please select a laborer for Specialist subcontract");
      return;
    }

    if (form.contract_type === "day_work" && !form.concreting_team_id) {
      setError("Please select a concreting team for the day-work job");
      return;
    }

    if (form.is_rate_based && (form.rate_per_unit <= 0 || form.total_units <= 0)) {
      setError("Please enter valid rate per unit and total units for rate-based contracts");
      return;
    }

    setLoading(true);
    try {
      // Duplicate guard (create only): warn — don't block — if this contractor
      // already has an open contract on this site (day-work jobs are exempt).
      if (!editingSubcontract && form.contract_type !== "day_work") {
        const contractorCol =
          form.contract_type === "mesthri" ? "team_id" : "laborer_id";
        const contractorVal =
          form.contract_type === "mesthri" ? form.team_id : form.laborer_id;
        if (contractorVal) {
          const { data: existing } = await supabase
            .from("subcontracts")
            .select("title, status")
            .eq("site_id", selectedSite.id)
            .eq(contractorCol, contractorVal)
            .in("status", ["draft", "active", "on_hold"]);
          if (existing && existing.length > 0) {
            const list = (existing as { title: string; status: string }[])
              .map((d) => `• ${d.title} (${d.status})`)
              .join("\n");
            const proceed = window.confirm(
              `This contractor already has ${existing.length} open contract(s) on this site:\n\n${list}\n\nCreate another one anyway?`
            );
            if (!proceed) {
              setLoading(false);
              return;
            }
          }
        }
      }

      const subcontractData = {
        site_id: selectedSite.id, // Auto-set from selected site
        contract_type: form.contract_type,
        team_id: form.contract_type === "mesthri" ? form.team_id : null,
        // For specialist contracts, laborer_id is the contract holder.
        // For mesthri contracts, laborer_id (when set) is the head mestri who
        // receives team-wage settlements via the salary waterfall RPC. The
        // schema CHECK constraint requires team_id for mesthri contracts but
        // allows laborer_id alongside it. Day-work jobs use no laborer.
        laborer_id: form.contract_type === "day_work" ? null : form.laborer_id || null,
        // Optional trade tag — enables Trades/attendance tracking. null = payments-only.
        trade_category_id: form.trade_category_id || null,
        // Day-work (external concreting gang) fields — null for other types.
        // Breakdown figures are reference-only and need not sum to total_value.
        concreting_team_id:
          form.contract_type === "day_work" ? form.concreting_team_id : null,
        contractor_name:
          form.contract_type === "day_work" ? form.contractor_name || null : null,
        male_count:
          form.contract_type === "day_work" ? form.male_count || null : null,
        female_count:
          form.contract_type === "day_work" ? form.female_count || null : null,
        machine_rental:
          form.contract_type === "day_work" ? form.machine_rental || null : null,
        transport_cost:
          form.contract_type === "day_work" ? form.transport_cost || null : null,
        breakdown_notes:
          form.contract_type === "day_work" ? form.breakdown_notes || null : null,
        title: form.title,
        description: form.description || null,
        scope_of_work: form.scope_of_work || null,
        total_value: form.total_value,
        is_rate_based: form.is_rate_based,
        measurement_unit: form.is_rate_based ? form.measurement_unit : null,
        rate_per_unit: form.rate_per_unit || null,
        total_units: form.total_units || null,
        weekly_advance_rate: form.weekly_advance_rate || null,
        // Coerce empty strings to null so Postgres doesn't reject the date
        // column with "invalid input syntax for type date" — the form binds
        // these as "" when the underlying field is null (line 284).
        start_date: form.start_date || null,
        expected_end_date: form.expected_end_date || null,
        status: form.status,
      };

      // When a trade is attached and the contract has no tracking mode yet, default
      // to payments-only ('mesthri_only') so it surfaces in the Trades workspace
      // without forcing attendance. Never clobber an existing mode on edit.
      if (form.trade_category_id && !editingSubcontract?.labor_tracking_mode) {
        (subcontractData as Record<string, unknown>).labor_tracking_mode =
          "mesthri_only";
      }

      if (editingSubcontract) {
        const result = await withTimeout(
          (supabase.from("subcontracts") as any)
            .update(subcontractData)
            .eq("id", editingSubcontract.id),
          TIMEOUTS.DATABASE_OPERATION,
          "Update operation timed out. Please check your connection and try again."
        ) as { error: any };

        if (result.error) throw result.error;
      } else {
        const result = await withTimeout(
          (supabase.from("subcontracts") as any).insert(subcontractData),
          TIMEOUTS.DATABASE_OPERATION,
          "Save operation timed out. Please check your connection and try again."
        ) as { error: any };

        if (result.error) throw result.error;
      }

      // Notify other open tabs (e.g. /site/payments' MestriSettleDialog) that
      // subcontracts changed, so their useSiteSubcontracts cache invalidates
      // immediately instead of waiting on staleTime + window-focus refetch.
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId: selectedSite.id, at: Date.now() });
        bc.close();
      }

      handleCloseDialog(); // Close dialog immediately for better UX
      fetchSubcontracts(); // Refresh in background (non-blocking)
    } catch (err: any) {
      console.error("Error saving subcontract:", err);
      setError("Failed to save subcontract: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subcontract?")) return;

    setLoading(true);
    try {
      const result = await withTimeout(
        (supabase.from("subcontracts") as any)
          .delete()
          .eq("id", id),
        TIMEOUTS.DATABASE_OPERATION,
        "Delete operation timed out. Please check your connection and try again."
      ) as { error: any };

      if (result.error) throw result.error;
      await fetchSubcontracts();
    } catch (err: any) {
      console.error("Error deleting subcontract:", err);
      setError("Failed to delete subcontract: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSubcontract = (subcontract: SubcontractWithDetails) => {
    setSelectedSubcontract(subcontract);
    setViewDialogOpen(true);
  };

  const handleOpenPaymentDialog = (subcontract: SubcontractWithDetails) => {
    setSelectedSubcontract(subcontract);
    setPaymentForm({
      payment_type: "part_payment",
      amount: 0,
      payment_date: dayjs().format("YYYY-MM-DD"),
      payment_mode: "cash",
      payment_channel: "via_site_engineer",
      period_from_date: dayjs().subtract(6, "day").format("YYYY-MM-DD"),
      period_to_date: dayjs().format("YYYY-MM-DD"),
      notes: "",
    });
    setSelectedSiteEngineer("");
    setPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedSubcontract || !userProfile || !selectedSite) return;

    if (paymentForm.amount <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (paymentForm.amount > (selectedSubcontract.balance_due || 0)) {
      setError("Payment amount cannot exceed balance due");
      return;
    }

    // Validate site engineer selection when channel is via_site_engineer
    if (paymentForm.payment_channel === "via_site_engineer" && !selectedSiteEngineer) {
      setError("Please select which site engineer made this payment");
      return;
    }

    setLoading(true);
    try {
      let siteEngineerTransactionId: string | null = null;

      // If payment is via site engineer, debit the wallet via wallet-v2 RPC.
      // The RPC enforces a per-engineer advisory lock + balance check and writes
      // a transaction_type='spend' row that v_engineer_wallet_balance recognises.
      if (paymentForm.payment_channel === "via_site_engineer" && selectedSiteEngineer) {
        // payment_mode for wallet RPC accepts cash/upi/bank_transfer. Map cheque
        // and other modes to bank_transfer (closest equivalent for ledger purposes).
        const walletPaymentMode =
          paymentForm.payment_mode === "cash" ||
          paymentForm.payment_mode === "upi" ||
          paymentForm.payment_mode === "bank_transfer"
            ? paymentForm.payment_mode
            : "bank_transfer";
        const { id: txId } = await withTimeout(
          recordSpend(supabase, {
            engineer_id: selectedSiteEngineer,
            site_id: selectedSite.id,
            amount: paymentForm.amount,
            transaction_date: paymentForm.payment_date,
            payment_mode: walletPaymentMode,
            proof_url: null,
            description: `Payment to Mesthri - ${selectedSubcontract.title}`,
            notes: paymentForm.notes || null,
            recorded_by: userProfile.name || userProfile.email,
            recorded_by_user_id: userProfile.id,
          }),
          TIMEOUTS.DATABASE_OPERATION,
          "Transaction creation timed out. Please check your connection and try again."
        );
        siteEngineerTransactionId = txId;
      }

      // Get the payer name based on channel
      let paidByName = userProfile.name || "Unknown";
      if (paymentForm.payment_channel === "via_site_engineer" && selectedSiteEngineer) {
        const engineer = siteEngineers.find(e => e.id === selectedSiteEngineer);
        paidByName = engineer?.name || "Site Engineer";
      } else if (paymentForm.payment_channel === "mesthri_at_office") {
        paidByName = "Office Staff";
      } else if (paymentForm.payment_channel === "company_direct_online") {
        paidByName = "Company (Online Transfer)";
      }

      // Calculate balance after this payment
      const balanceAfterPayment = (selectedSubcontract.balance_due || 0) - paymentForm.amount;

      // Record the payment with enhanced fields
      const paymentResult = await withTimeout(
        (supabase.from("subcontract_payments") as any).insert({
          // Column is contract_id (NOT subcontract_id) on subcontract_payments.
          contract_id: selectedSubcontract.id,
          payment_type: paymentForm.payment_type,
          amount: paymentForm.amount,
          payment_date: paymentForm.payment_date,
          payment_mode: paymentForm.payment_mode,
          payment_channel: paymentForm.payment_channel,
          // paid_by is a uuid FK to users — keep the actual user id in
          // paid_by_user_id and put the human-readable payer label in comments
          // (there is no text payer-name column on this table).
          paid_by: null,
          paid_by_user_id: paymentForm.payment_channel === "via_site_engineer" ? selectedSiteEngineer : userProfile.id,
          period_from_date: paymentForm.period_from_date,
          period_to_date: paymentForm.period_to_date,
          balance_after_payment: balanceAfterPayment,
          site_engineer_transaction_id: siteEngineerTransactionId,
          recorded_by: userProfile.name || userProfile.email,
          recorded_by_user_id: userProfile.id,
          // Column is comments (NOT notes) on subcontract_payments.
          comments: paymentForm.notes
            ? `${paymentForm.notes} (paid by ${paidByName})`
            : `Paid by ${paidByName}`,
        }),
        TIMEOUTS.DATABASE_OPERATION,
        "Payment recording timed out. Please check your connection and try again."
      ) as { error: any };

      if (paymentResult.error) throw paymentResult.error;

      // Update subcontract status if fully paid
      const newTotalPaid =
        (selectedSubcontract.total_paid || 0) + paymentForm.amount;
      if (newTotalPaid >= selectedSubcontract.total_value) {
        await withTimeout(
          (supabase.from("subcontracts") as any)
            .update({ status: "completed" })
            .eq("id", selectedSubcontract.id),
          TIMEOUTS.DATABASE_OPERATION,
          "Status update timed out."
        );
      }

      await fetchSubcontracts();
      setPaymentDialogOpen(false);
      setSelectedSubcontract(null);
    } catch (err: any) {
      console.error("Error recording payment:", err);
      setError("Failed to record payment: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: ContractStatus): any => {
    const colorMap: Record<ContractStatus, any> = {
      draft: "default",
      active: "primary",
      on_hold: "warning",
      completed: "success",
      cancelled: "error",
    };
    return colorMap[status];
  };

  // Table columns (no site column since we're already in site context)
  const columns = useMemo<MRT_ColumnDef<SubcontractWithDetails>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        size: isMobile ? 120 : 220,
        Cell: ({ cell, row }) => (
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ fontSize: isMobile ? '0.7rem' : 'inherit' }}>
              {cell.getValue<string>()}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? '0.6rem' : 'inherit' }}>
              {row.original.contract_type === "mesthri"
                ? row.original.team_name
                : row.original.contract_type === "day_work"
                ? row.original.contractor_name
                : row.original.laborer_name}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              {row.original.trade_name ? (
                <Chip
                  label={row.original.trade_name}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              ) : (
                <Chip
                  label="No trade"
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 18,
                    fontSize: "0.65rem",
                    color: "text.disabled",
                    borderColor: "divider",
                  }}
                />
              )}
            </Box>
          </Box>
        ),
      },
      {
        accessorKey: "contract_type",
        header: isMobile ? "Type" : "Type",
        size: isMobile ? 55 : 110,
        Cell: ({ cell }) => (
          <Chip
            label={
              isMobile
                ? cell.getValue<string>() === "mesthri"
                  ? "M"
                  : cell.getValue<string>() === "day_work"
                  ? "D"
                  : "S"
                : cell.getValue<string>() === "day_work"
                ? "DAY WORK"
                : cell.getValue<string>().toUpperCase()
            }
            size="small"
            color={
              cell.getValue<string>() === "mesthri"
                ? "primary"
                : cell.getValue<string>() === "day_work"
                ? "info"
                : "secondary"
            }
          />
        ),
      },
      {
        accessorKey: "total_value",
        header: isMobile ? "Value" : "Subcontract Value",
        size: isMobile ? 80 : 150,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={700} sx={{ fontSize: isMobile ? '0.7rem' : 'inherit' }}>
            ₹{cell.getValue<number>().toLocaleString('en-IN')}
          </Typography>
        ),
      },
      {
        accessorKey: "total_paid",
        header: "Paid",
        size: isMobile ? 70 : 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={600} color="success.main" sx={{ fontSize: isMobile ? '0.7rem' : 'inherit' }}>
            ₹{(cell.getValue<number>() || 0).toLocaleString('en-IN')}
          </Typography>
        ),
      },
      {
        accessorKey: "balance_due",
        header: isMobile ? "Due" : "Balance",
        size: isMobile ? 70 : 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={600} color="error.main" sx={{ fontSize: isMobile ? '0.7rem' : 'inherit' }}>
            ₹{(cell.getValue<number>() || 0).toLocaleString('en-IN')}
          </Typography>
        ),
      },
      {
        accessorKey: "completion_percentage",
        header: isMobile ? "%" : "Progress",
        size: isMobile ? 50 : 130,
        Cell: ({ cell }) => {
          const percentage = cell.getValue<number>() || 0;
          return isMobile ? (
            <Typography variant="caption" fontWeight={600}>
              {percentage.toFixed(0)}%
            </Typography>
          ) : (
            <Box sx={{ width: "100%" }}>
              <Typography variant="caption">{percentage.toFixed(0)}%</Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(percentage, 100)}
                color={
                  percentage >= 100
                    ? "success"
                    : percentage >= 50
                    ? "primary"
                    : "warning"
                }
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Box>
          );
        },
      },
      {
        accessorKey: "status",
        header: isMobile ? "St" : "Status",
        size: isMobile ? 50 : 110,
        Cell: ({ cell }) => (
          <Chip
            label={isMobile
              ? cell.getValue<string>().charAt(0).toUpperCase()
              : cell.getValue<string>().toUpperCase()}
            size="small"
            color={getStatusColor(cell.getValue<ContractStatus>())}
          />
        ),
      },
      {
        accessorKey: "is_rate_based",
        header: "Type",
        size: 100,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<boolean>() ? "Rate" : "Lump"}
            size="small"
            color={cell.getValue<boolean>() ? "primary" : "secondary"}
            variant="outlined"
          />
        ),
      },
      {
        id: "mrt-row-actions",
        header: "",
        size: isMobile ? 100 : 180,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={() => handleViewSubcontract(row.original)}
            >
              <Visibility fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(row.original)}
              disabled={!canEdit || loading}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenPaymentDialog(row.original)}
              disabled={
                !canEdit || loading || row.original.status === "completed"
              }
            >
              <PaymentIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(row.original.id)}
              disabled={!canEdit || loading}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [canEdit, loading, isMobile]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const total = subcontracts.reduce((sum, c) => sum + c.total_value, 0);
    const paid = subcontracts.reduce((sum, c) => sum + (c.total_paid || 0), 0);
    const due = subcontracts.reduce((sum, c) => sum + (c.balance_due || 0), 0);
    const active = subcontracts.filter((c) => c.status === "active").length;
    const completed = subcontracts.filter(
      (c) => c.status === "completed"
    ).length;
    const recordCount = subcontracts.reduce(
      (sum, c) => sum + (c.record_count || 0),
      0
    );

    return { total, paid, due, active, completed, count: subcontracts.length, recordCount };
  }, [subcontracts]);

  // Show message if no site selected
  if (!selectedSite) {
    return (
      <Box>
        <PageHeader
          title="Sub Contract Management"
          subtitle="Manage subcontracts for this site"
        />
        <Alert severity="info" sx={{ mt: 2 }}>
          Please select a site from the site selector to view and manage
          subcontracts.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Sub Contract Management"
        subtitle={`Manage subcontracts for ${selectedSite.name}`}
        actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            disabled={!canEdit}
            size="small"
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            New Subcontract
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Total Subcontracts
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.count}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Subcontract Value
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                ₹{stats.total.toLocaleString('en-IN')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "success.light" }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Total Paid
              </Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">
                ₹{stats.paid.toLocaleString('en-IN')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "error.light" }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Balance Due
              </Typography>
              <Typography variant="h5" fontWeight={700} color="error.main">
                ₹{stats.due.toLocaleString('en-IN')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Payment Records
              </Typography>
              <Typography variant="h5" fontWeight={700} color="info.main">
                {stats.recordCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Active / Completed
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {stats.active} / {stats.completed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "16px !important" }}>
          <Tabs
            value={activeTab}
            onChange={(e, newValue) => setActiveTab(newValue)}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label="All" value="all" />
            <Tab label="Draft" value="draft" />
            <Tab label="Active" value="active" />
            <Tab label="Completed" value="completed" />
            <Tab label="Cancelled" value="cancelled" />
          </Tabs>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={subcontracts}
        isLoading={loading}
        showRecordCount
        enableExpanding={!isMobile}
        pinnedColumns={{
          left: ["title"],
          right: ["mrt-row-actions"],
        }}
        mobileHiddenColumns={["is_rate_based"]}
        renderDetailPanel={({ row }) => (
          <SubcontractPaymentBreakdown
            subcontractId={row.original.id}
            totalValue={row.original.total_value}
          />
        )}
      />

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {editingSubcontract ? "Edit Subcontract" : "New Subcontract"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth required>
                  <InputLabel>Subcontract Type</InputLabel>
                  <Select
                    value={form.contract_type}
                    onChange={(e) => {
                      const next = e.target.value as ContractType;
                      setForm({
                        ...form,
                        contract_type: next,
                        // Day-work concreting jobs are always a single bargained
                        // lump sum — never rate-based.
                        is_rate_based:
                          next === "day_work" ? false : form.is_rate_based,
                      });
                    }}
                    label="Subcontract Type"
                  >
                    <MenuItem value="mesthri">Mesthri (Team Based)</MenuItem>
                    <MenuItem value="specialist">
                      Specialist (Individual)
                    </MenuItem>
                    <MenuItem value="day_work">
                      Day-work / Concreting (External gang)
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                {form.contract_type === "day_work" ? (
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Autocomplete
                      fullWidth
                      options={concretingTeams}
                      getOptionLabel={(o) => o.name}
                      value={
                        concretingTeams.find(
                          (t) => t.id === form.concreting_team_id
                        ) || null
                      }
                      onChange={(_e, val) =>
                        setForm({
                          ...form,
                          concreting_team_id: val?.id || "",
                          contractor_name: val?.name || "",
                        })
                      }
                      isOptionEqualToValue={(o, v) => o.id === v.id}
                      slotProps={{ popper: { disablePortal: false } }}
                      renderInput={(params) => (
                        <TextField {...params} label="Concreting Team" required />
                      )}
                    />
                    <Button
                      size="small"
                      onClick={() => setTeamDialogOpen(true)}
                      sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      + Add
                    </Button>
                  </Box>
                ) : form.contract_type === "mesthri" ? (
                  <FormControl fullWidth required>
                    <InputLabel>Team</InputLabel>
                    <Select
                      value={form.team_id}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          team_id: e.target.value,
                          // Clear stale head-mestri pick if it doesn't belong
                          // to the newly selected team.
                          laborer_id:
                            laborers.find((l) => l.id === form.laborer_id)
                              ?.team_id === e.target.value
                              ? form.laborer_id
                              : "",
                        })
                      }
                      label="Team"
                    >
                      {teams.map((team) => (
                        <MenuItem key={team.id} value={team.id}>
                          {team.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <SpecialistLaborerPicker
                    laborers={laborers}
                    value={form.laborer_id}
                    onChange={(id) => setForm({ ...form, laborer_id: id })}
                    required
                  />
                )}
              </Grid>
              {/* Head Mestri picker — required for salary settlements via the
                  waterfall RPC (the team's "mestri" is the laborer who actually
                  receives the wages on behalf of the team). Optional at the
                  schema level so existing mesthri contracts still save. */}
              {form.contract_type === "mesthri" && form.team_id && (
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth>
                    <InputLabel shrink>Head Mestri (Laborer)</InputLabel>
                    <Select
                      value={form.laborer_id}
                      onChange={(e) =>
                        setForm({ ...form, laborer_id: e.target.value })
                      }
                      label="Head Mestri (Laborer)"
                      displayEmpty
                      notched
                    >
                      <MenuItem value="">
                        <em>None — block salary settlements</em>
                      </MenuItem>
                      {(() => {
                        const teamMembers = laborers.filter(
                          (l) => l.team_id === form.team_id
                        );
                        const pool =
                          teamMembers.length > 0 ? teamMembers : laborers;
                        return pool.map((laborer) => (
                          <MenuItem key={laborer.id} value={laborer.id}>
                            {laborer.name}
                            {teamMembers.length === 0 ? " (any)" : ""}
                          </MenuItem>
                        ));
                      })()}
                    </Select>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5, ml: 1.5 }}
                    >
                      Required for the &quot;Record mesthri payment&quot;
                      waterfall on /site/payments. If no team members appear,
                      pick any active laborer as the wage recipient.
                    </Typography>
                  </FormControl>
                </Grid>
              )}
            </Grid>

            <Autocomplete
              options={tradeCategories}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={
                tradeCategories.find(
                  (tc) => tc.id === form.trade_category_id
                ) ?? null
              }
              onChange={(_e, value) =>
                setForm({ ...form, trade_category_id: value?.id ?? "" })
              }
              slotProps={{ popper: { disablePortal: false } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Trade (optional — enables attendance tracking)"
                  helperText="Leave blank for a payments-only contract. Pick a trade to track it in the Trades workspace / attendance — you can add this anytime."
                />
              )}
            />

            <TextField
              fullWidth
              label="Subcontract Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="e.g., Plastering Work - Ground Floor"
            />

            <TextField
              fullWidth
              label="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              multiline
              rows={2}
            />

            <TextField
              fullWidth
              label="Scope of Work"
              value={form.scope_of_work}
              onChange={(e) =>
                setForm({ ...form, scope_of_work: e.target.value })
              }
              multiline
              rows={3}
            />

            <Divider sx={{ my: 2 }} />

            {/* Contract Value Type Toggle — hidden for day-work (always lump sum) */}
            {form.contract_type !== "day_work" && (
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
                sx={{ mb: 1.5 }}
              >
                Subcontract Value Type
              </Typography>
              <ToggleButtonGroup
                value={form.is_rate_based ? "rate" : "lumpsum"}
                exclusive
                onChange={(e, value) => {
                  if (value !== null) {
                    setForm({
                      ...form,
                      is_rate_based: value === "rate",
                      total_value: value === "rate" ? 0 : form.total_value,
                      rate_per_unit: value === "rate" ? form.rate_per_unit : 0,
                      total_units: value === "rate" ? form.total_units : 0,
                    });
                  }
                }}
                fullWidth
                sx={{
                  "& .MuiToggleButton-root": {
                    py: 1.5,
                    textTransform: "none",
                    fontWeight: 500,
                  },
                  "& .Mui-selected": {
                    backgroundColor: "primary.main",
                    color: "white",
                    "&:hover": {
                      backgroundColor: "primary.dark",
                    },
                  },
                }}
              >
                <ToggleButton value="rate">
                  <CalculateIcon sx={{ mr: 1, fontSize: 20 }} />
                  Rate-Based (Per Unit)
                </ToggleButton>
                <ToggleButton value="lumpsum">
                  <MoneyIcon sx={{ mr: 1, fontSize: 20 }} />
                  Lump Sum Subcontract
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            )}

            {/* Rate-Based Contract Fields */}
            {form.is_rate_based ? (
              <>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Measurement Unit</InputLabel>
                      <Select
                        value={form.measurement_unit}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            measurement_unit: e.target.value as MeasurementUnit,
                          })
                        }
                        label="Measurement Unit"
                      >
                        <MenuItem value="sqft">Square Feet (sqft)</MenuItem>
                        <MenuItem value="rft">Running Feet (rft)</MenuItem>
                        <MenuItem value="nos">Numbers (nos)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Rate per Unit"
                      type="number"
                      value={form.rate_per_unit || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rate_per_unit: Number(e.target.value),
                        })
                      }
                      required
                      slotProps={{
                        input: {
                          startAdornment: "₹",
                        },
                      }}
                    />
                  </Grid>
                </Grid>

                <TextField
                  fullWidth
                  label={`Total Units (${form.measurement_unit})`}
                  type="number"
                  value={form.total_units || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      total_units: Number(e.target.value),
                    })
                  }
                  required
                  slotProps={{
                    input: {
                      endAdornment: form.measurement_unit,
                    },
                  }}
                />

                {/* Calculated Total Value Display */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    bgcolor: "primary.50",
                    border: "2px solid",
                    borderColor: "primary.main",
                    borderRadius: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total Subcontract Value
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {form.rate_per_unit > 0 && form.total_units > 0 ? (
                          <>
                            ₹{form.rate_per_unit.toLocaleString('en-IN')} ×{" "}
                            {form.total_units.toLocaleString('en-IN')}{" "}
                            {form.measurement_unit}
                          </>
                        ) : (
                          "Enter rate and units to calculate"
                        )}
                      </Typography>
                    </Box>
                    <Typography
                      variant="h5"
                      fontWeight={700}
                      color="primary.main"
                    >
                      ₹{form.total_value.toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                </Paper>
              </>
            ) : (
              /* Lump Sum Contract Fields */
              <TextField
                fullWidth
                label={
                  form.contract_type === "day_work"
                    ? "Total Agreed Amount (lump sum)"
                    : "Total Subcontract Value"
                }
                type="number"
                value={form.total_value || ""}
                onChange={(e) =>
                  setForm({ ...form, total_value: Number(e.target.value) })
                }
                required
                slotProps={{
                  input: {
                    startAdornment: "₹",
                  },
                }}
                helperText={
                  form.contract_type === "day_work"
                    ? "The single bargained amount you pay the gang on completion"
                    : "Enter the fixed subcontract amount"
                }
              />
            )}

            {/* Day-work bargaining breakdown (reference figures only) */}
            {form.contract_type === "day_work" && (
              <Box
                sx={{
                  p: 2,
                  border: "1px dashed",
                  borderColor: "divider",
                  borderRadius: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Bargaining breakdown
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Male laborers"
                      type="number"
                      value={form.male_count || ""}
                      onChange={(e) =>
                        setForm({ ...form, male_count: Number(e.target.value) })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Female laborers"
                      type="number"
                      value={form.female_count || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          female_count: Number(e.target.value),
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Machine rental"
                      type="number"
                      value={form.machine_rental || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          machine_rental: Number(e.target.value),
                        })
                      }
                      slotProps={{ input: { startAdornment: "₹" } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Transport"
                      type="number"
                      value={form.transport_cost || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          transport_cost: Number(e.target.value),
                        })
                      }
                      slotProps={{ input: { startAdornment: "₹" } }}
                    />
                  </Grid>
                </Grid>
                <TextField
                  fullWidth
                  label="Other factors / notes"
                  value={form.breakdown_notes}
                  onChange={(e) =>
                    setForm({ ...form, breakdown_notes: e.target.value })
                  }
                  multiline
                  rows={2}
                />
                <Typography variant="caption" color="text.secondary">
                  Reference figures — they need not add up to the agreed total.
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={
                    form.contract_type === "day_work" ? "Work Date" : "Start Date"
                  }
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm({ ...form, start_date: e.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
              </Grid>
              {form.contract_type !== "day_work" && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Expected End Date"
                    type="date"
                    value={form.expected_end_date}
                    onChange={(e) =>
                      setForm({ ...form, expected_end_date: e.target.value })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
              )}
            </Grid>

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as ContractStatus })
                }
                label="Status"
              >
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Box>
          {/* Inline error inside the dialog so users don't miss the save failure
              when the dialog backdrop covers the page-level Alert. */}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            {editingSubcontract ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline quick-add for a concreting team (from the day-work picker) */}
      <ConcretingTeamDialog
        open={teamDialogOpen}
        onClose={() => setTeamDialogOpen(false)}
        onSaved={(team) =>
          setForm((prev) => ({
            ...prev,
            concreting_team_id: team.id,
            contractor_name: team.name,
          }))
        }
      />

      {/* View Subcontract Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Subcontract Details</DialogTitle>
        <DialogContent>
          {selectedSubcontract && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
            >
              <Box>
                <Typography variant="h6" gutterBottom>
                  {selectedSubcontract.title}
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Chip
                    label={selectedSubcontract.status.toUpperCase()}
                    color={getStatusColor(selectedSubcontract.status)}
                    size="small"
                  />
                </Box>
              </Box>

              <Divider />

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    Subcontract Type
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedSubcontract.contract_type.toUpperCase()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    {selectedSubcontract.contract_type === "mesthri"
                      ? "Team"
                      : selectedSubcontract.contract_type === "day_work"
                      ? "Concreting Team"
                      : "Laborer"}
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedSubcontract.contract_type === "mesthri"
                      ? selectedSubcontract.team_name
                      : selectedSubcontract.contract_type === "day_work"
                      ? selectedSubcontract.contractor_name
                      : selectedSubcontract.laborer_name}
                  </Typography>
                </Grid>
              </Grid>

              {selectedSubcontract.description && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {selectedSubcontract.description}
                  </Typography>
                </Box>
              )}

              {selectedSubcontract.contract_type === "day_work" && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Bargaining breakdown
                  </Typography>
                  <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Male
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedSubcontract.male_count ?? "—"}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Female
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedSubcontract.female_count ?? "—"}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Machine rental
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedSubcontract.machine_rental != null
                          ? `₹${selectedSubcontract.machine_rental.toLocaleString(
                              "en-IN"
                            )}`
                          : "—"}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" color="text.secondary">
                        Transport
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedSubcontract.transport_cost != null
                          ? `₹${selectedSubcontract.transport_cost.toLocaleString(
                              "en-IN"
                            )}`
                          : "—"}
                      </Typography>
                    </Grid>
                  </Grid>
                  {selectedSubcontract.breakdown_notes && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {selectedSubcontract.breakdown_notes}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="div"
                    sx={{ mt: 1 }}
                  >
                    Reference figures — they need not add up to the agreed total.
                  </Typography>
                </Box>
              )}

              <Divider />

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Subcontract Value
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    ₹{selectedSubcontract.total_value.toLocaleString('en-IN')}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Paid
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    ₹{(selectedSubcontract.total_paid || 0).toLocaleString('en-IN')}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Balance
                  </Typography>
                  <Typography variant="h6" color="error.main">
                    ₹{(selectedSubcontract.balance_due || 0).toLocaleString('en-IN')}
                  </Typography>
                </Grid>
              </Grid>

              <LinearProgress
                variant="determinate"
                value={Math.min(
                  selectedSubcontract.completion_percentage || 0,
                  100
                )}
                color={
                  (selectedSubcontract.completion_percentage || 0) >= 100
                    ? "success"
                    : "primary"
                }
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          {canEdit &&
            selectedSubcontract &&
            selectedSubcontract.status !== "completed" && (
              <Button
                variant="contained"
                startIcon={<PaymentIcon />}
                onClick={() => {
                  setViewDialogOpen(false);
                  handleOpenPaymentDialog(selectedSubcontract);
                }}
              >
                Record Payment
              </Button>
            )}
        </DialogActions>
      </Dialog>

      {/* Payment Dialog - Enhanced with payment channel and period tracking */}
      <Dialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent>
          {selectedSubcontract && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}
            >
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>{selectedSubcontract.title}</strong>
                  {(selectedSubcontract.team_name ||
                    selectedSubcontract.contractor_name) && (
                    <>
                      {" - "}
                      {selectedSubcontract.team_name ||
                        selectedSubcontract.contractor_name}
                    </>
                  )}
                </Typography>
                <Typography variant="caption">
                  Contract Value: ₹{selectedSubcontract.total_value.toLocaleString('en-IN')} |
                  Paid: ₹{(selectedSubcontract.total_paid || 0).toLocaleString('en-IN')} |
                  Balance Due: ₹{(selectedSubcontract.balance_due || 0).toLocaleString('en-IN')}
                </Typography>
              </Alert>

              <Divider />
              <Typography variant="subtitle2" color="text.secondary">
                Payment Channel (How was the payment made?)
              </Typography>

              <FormControl fullWidth required>
                <InputLabel>Payment Channel</InputLabel>
                <Select
                  value={paymentForm.payment_channel}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_channel: e.target.value as PaymentChannel,
                    })
                  }
                  label="Payment Channel"
                >
                  <MenuItem value="via_site_engineer">
                    Via Site Engineer (Engineer pays on company&apos;s behalf)
                  </MenuItem>
                  <MenuItem value="mesthri_at_office">
                    Mesthri at Office (Mesthri came to office to collect)
                  </MenuItem>
                  <MenuItem value="company_direct_online">
                    Company Direct Online (UPI/Bank Transfer from company)
                  </MenuItem>
                </Select>
              </FormControl>

              {/* Site Engineer Selection - Only shown when via_site_engineer */}
              {paymentForm.payment_channel === "via_site_engineer" && (
                <FormControl fullWidth required>
                  <InputLabel>Site Engineer</InputLabel>
                  <Select
                    value={selectedSiteEngineer}
                    onChange={(e) => setSelectedSiteEngineer(e.target.value)}
                    label="Site Engineer"
                  >
                    {siteEngineers.map((eng) => (
                      <MenuItem key={eng.id} value={eng.id}>
                        {eng.name} ({eng.role})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {paymentForm.payment_channel === "via_site_engineer" && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  <Typography variant="caption">
                    This will automatically deduct ₹{paymentForm.amount.toLocaleString('en-IN') || 0} from the selected engineer&apos;s wallet balance.
                  </Typography>
                </Alert>
              )}

              <Divider />

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Payment Type</InputLabel>
                    <Select
                      value={paymentForm.payment_type}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          payment_type: e.target.value as PaymentType,
                        })
                      }
                      label="Payment Type"
                    >
                      <MenuItem value="weekly_advance">Weekly Advance</MenuItem>
                      <MenuItem value="part_payment">Part Payment</MenuItem>
                      <MenuItem value="milestone">Milestone Payment</MenuItem>
                      <MenuItem value="final_settlement">Final Settlement</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Amount"
                    type="number"
                    value={paymentForm.amount || ""}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        amount: Number(e.target.value),
                      })
                    }
                    required
                    slotProps={{ input: { startAdornment: "₹" } }}
                  />
                </Grid>
              </Grid>

              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                Period Covered by this Payment
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Period From"
                    type="date"
                    value={paymentForm.period_from_date}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        period_from_date: e.target.value,
                      })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Period To"
                    type="date"
                    value={paymentForm.period_to_date}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        period_to_date: e.target.value,
                      })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Payment Date"
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        payment_date: e.target.value,
                      })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Payment Mode</InputLabel>
                    <Select
                      value={paymentForm.payment_mode}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          payment_mode: e.target.value as PaymentMode,
                        })
                      }
                      label="Payment Mode"
                    >
                      <MenuItem value="cash">Cash</MenuItem>
                      <MenuItem value="upi">UPI</MenuItem>
                      <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <TextField
                fullWidth
                label="Notes"
                value={paymentForm.notes}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, notes: e.target.value })
                }
                multiline
                rows={2}
                placeholder="Any additional notes about this payment..."
              />

              {/* Balance after payment preview */}
              {paymentForm.amount > 0 && (
                <Paper elevation={0} sx={{ p: 2, bgcolor: "action.selected", borderRadius: 2 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Current Balance
                      </Typography>
                      <Typography variant="body1" fontWeight={600} color="error.main">
                        ₹{(selectedSubcontract.balance_due || 0).toLocaleString('en-IN')}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        After This Payment
                      </Typography>
                      <Typography
                        variant="body1"
                        fontWeight={600}
                        color={(selectedSubcontract.balance_due || 0) - paymentForm.amount <= 0 ? "success.main" : "warning.main"}
                      >
                        ₹{Math.max(0, (selectedSubcontract.balance_due || 0) - paymentForm.amount).toLocaleString('en-IN')}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRecordPayment}
            variant="contained"
            disabled={loading}
          >
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mobile FAB - always rendered, visibility controlled by CSS */}
      <Fab
        color="primary"
        onClick={() => handleOpenDialog()}
        disabled={!canEdit}
        sx={{
          display: canEdit ? { xs: 'flex', sm: 'none' } : 'none',
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 1000,
        }}
      >
        <Add />
      </Fab>
    </Box>
  );
}
