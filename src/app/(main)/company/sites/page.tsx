"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Chip,
  Autocomplete,
  IconButton,
  Typography,
  Drawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormControlLabel,
  Switch,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Grid,
  Card,
  CardContent,
  Paper,
  Divider,
  LinearProgress,
  Tooltip,
  Stack,
  Snackbar,
  alpha,
  useTheme,
  CircularProgress,
  InputAdornment,
  Collapse,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  LocationOn,
  Description,
  Assignment,
  Upload,
  Visibility,
  OpenInNew,
  Construction,
  Phone,
  Email,
  CloudUpload,
  InsertDriveFile,
  CheckCircle,
  Close,
  PictureAsPdf,
  Payments,
  ExpandMore,
  ExpandLess,
  Timeline,
  AutoAwesome,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import PageHeader from "@/components/layout/PageHeader";
import type { Database } from "@/types/database.types";
import dayjs from "dayjs";

type Site = Database["public"]["Tables"]["sites"]["Row"];
type ConstructionPhase = Database["public"]["Tables"]["construction_phases"]["Row"];
type ConstructionSubphase = Database["public"]["Tables"]["construction_subphases"]["Row"];
type SitePaymentMilestone = Database["public"]["Tables"]["site_payment_milestones"]["Row"];

type SiteWithStats = Site & {
  subcontract_count: number;
  total_subcontract_value: number;
  amount_pending: number;
};

type PhaseOption = {
  id: string;
  label: string;
  group: "Phase" | "SubPhase";
  phaseId?: string;
  phaseName?: string;
  sequence: number;
};

type UploadedFileInfo = {
  name: string;
  size: number;
  url: string;
};

type MilestoneFormItem = {
  id?: string;
  title: string;
  construction_phase_id: string | null;
  construction_phase_name: string;
  percentage: number;
  amount: number;
  expected_date: string;
  sequence_order: number;
};

export default function CompanySitesPage() {
  const [sites, setSites] = useState<SiteWithStats[]>([]);
  const [phases, setPhases] = useState<ConstructionPhase[]>([]);
  const [subphases, setSubphases] = useState<ConstructionSubphase[]>([]);
  const [siteMilestones, setSiteMilestones] = useState<
    Record<string, SitePaymentMilestone[]>
  >({});
  const [sitePayments, setSitePayments] = useState<
    Record<string, { total: number; count: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "error" | "success" | "info";
  }>({
    open: false,
    message: "",
    severity: "info",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // Payment milestones state
  const [milestones, setMilestones] = useState<MilestoneFormItem[]>([]);
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);
  const [milestonesGenerated, setMilestonesGenerated] = useState(false);

  const { userProfile } = useAuth();
  const { refreshSites: refreshSiteContext } = useSite();
  const { selectedCompany } = useSelectedCompany();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    status: "active" as Site["status"],
    site_type: "single_client" as Site["site_type"],
    start_date: "",
    target_completion_date: "",
    construction_phase_id: null as string | null,
    client_name: "",
    client_contact: "",
    client_email: "",
    project_contract_value: 0,
    payment_segments: null as number | null,
    contract_document_url: "",
    total_amount_received: 0,
    last_payment_amount: 0,
    last_payment_date: "",
    construction_phase: "",
    location_lat: "",
    location_lng: "",
    location_google_maps_url: "",
    engineer_phone: "",
  });

  // Helper to check if current project is personal
  const isPersonalProject = form.site_type === "personal";

  const canEdit = userProfile?.role === "admin";

  // Memoized phase options for Autocomplete
  const phaseOptions = useMemo<PhaseOption[]>(() => {
    return [
      ...phases.map((p) => ({
        id: p.id,
        label: p.name,
        group: "Phase" as const,
        sequence: p.sequence_order,
      })),
      ...subphases.map((sp) => {
        const phase = phases.find((p) => p.id === sp.phase_id);
        return {
          id: sp.id,
          label: sp.name,
          group: "SubPhase" as const,
          phaseId: sp.phase_id,
          phaseName: phase?.name || "",
          sequence: sp.sequence_order,
        };
      }),
    ];
  }, [phases, subphases]);

  const fetchSiteMilestones = useCallback(
    async (siteIds?: string[]) => {
      const ids = siteIds && siteIds.length > 0 ? siteIds : [];
      if (!ids.length) {
        setSiteMilestones({});
        setSitePayments({});
        return;
      }

      try {
        const [milestonesRes, paymentsRes] = await Promise.all([
          supabase
            .from("site_payment_milestones")
            .select("*")
            .in("site_id", ids)
            .order("sequence_order", { ascending: true }),
          supabase
            .from("client_payments")
            .select("site_id, amount")
            .in("site_id", ids),
        ]);

        if (milestonesRes.error) throw milestonesRes.error;

        const grouped: Record<string, SitePaymentMilestone[]> = {};
        ((milestonesRes.data || []) as SitePaymentMilestone[]).forEach((m) => {
          if (!grouped[m.site_id]) grouped[m.site_id] = [];
          grouped[m.site_id].push(m);
        });
        setSiteMilestones(grouped);

        // Group payments by site
        const paymentsBysite: Record<string, { total: number; count: number }> =
          {};
        (
          (paymentsRes.data || []) as { site_id: string; amount: number }[]
        ).forEach((p) => {
          if (!paymentsBysite[p.site_id]) {
            paymentsBysite[p.site_id] = { total: 0, count: 0 };
          }
          paymentsBysite[p.site_id].total += p.amount;
          paymentsBysite[p.site_id].count += 1;
        });
        setSitePayments(paymentsBysite);
      } catch (err: any) {
        console.error("Failed to load site milestones", err.message);
      }
    },
    [supabase]
  );

  const fetchPhases = useCallback(async () => {
    try {
      const [phasesRes, subphasesRes] = await Promise.all([
        supabase
          .from("construction_phases")
          .select("*")
          .eq("is_active", true)
          .order("sequence_order", { ascending: true }),
        supabase
          .from("construction_subphases")
          .select("*")
          .eq("is_active", true)
          .order("sequence_order", { ascending: true }),
      ]);
      if (phasesRes.error) throw phasesRes.error;
      if (subphasesRes.error) throw subphasesRes.error;
      setPhases(phasesRes.data || []);
      setSubphases(subphasesRes.data || []);
    } catch (err: any) {
      console.error("Failed to load phases", err.message);
    }
  }, [supabase]);

  const fetchSites = useCallback(async () => {
    try {
      setLoading(true);
      const { data: sitesData, error } = await supabase
        .from("sites")
        .select("*")
        .order("name");
      if (error) throw error;

      const sitesWithStats = await Promise.all(
        ((sitesData || []) as Site[]).map(async (site) => {
          const { count: subcontractCount } = await supabase
            .from("subcontracts")
            .select("*", { count: "exact", head: true })
            .eq("site_id", site.id);

          const { data: subcontracts } = await supabase
            .from("subcontracts")
            .select("total_value")
            .eq("site_id", site.id);

          const totalSubcontractValue =
            ((subcontracts || []) as { total_value: number }[])?.reduce(
              (sum, c) => sum + (c.total_value || 0),
              0
            ) || 0;

          const amountPending =
            (site.project_contract_value || 0) -
            (site.total_amount_received || 0);

          return {
            ...site,
            subcontract_count: subcontractCount || 0,
            total_subcontract_value: totalSubcontractValue,
            amount_pending: amountPending,
          };
        })
      );
      setSites(sitesWithStats);
      // Load milestones for these sites to power tooltips
      const siteIds = sitesWithStats.map((s) => s.id);
      fetchSiteMilestones(siteIds);
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: `Failed to load sites: ${err.message}`,
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, fetchSiteMilestones]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  const handleOpenDialog = useCallback(
    async (site?: Site) => {
      if (site) {
        setEditingSite(site);
        setForm({
          name: site.name,
          address: site.address || "",
          city: site.city || "",
          status: site.status as Site["status"],
          site_type: site.site_type || "single_client",
          start_date: site.start_date || "",
          target_completion_date: site.target_completion_date || "",
          construction_phase_id: site.construction_phase_id || null,
          client_name: site.client_name || "",
          client_contact: site.client_contact || "",
          client_email: site.client_email || "",
          project_contract_value: site.project_contract_value || 0,
          payment_segments: site.payment_segments || null,
          contract_document_url: site.contract_document_url || "",
          total_amount_received: site.total_amount_received || 0,
          last_payment_amount: site.last_payment_amount || 0,
          last_payment_date: site.last_payment_date || "",
          construction_phase: site.construction_phase || "",
          location_lat: site.location_lat?.toString() || "",
          location_lng: site.location_lng?.toString() || "",
          location_google_maps_url: site.location_google_maps_url || "",
          engineer_phone: (site as { engineer_phone?: string | null }).engineer_phone || "",
        });
        // Set uploaded file info if document exists
        if (site.contract_document_url) {
          const urlParts = site.contract_document_url.split("/");
          const fileName =
            urlParts[urlParts.length - 1] || "Contract Document.pdf";
          setUploadedFile({
            name: decodeURIComponent(fileName),
            size: 0,
            url: site.contract_document_url,
          });
        } else {
          setUploadedFile(null);
        }

        // Fetch existing milestones for this site
        try {
          const { data: existingMilestones, error } = await supabase
            .from("site_payment_milestones")
            .select("*")
            .eq("site_id", site.id)
            .order("sequence_order", { ascending: true });

          if (!error && existingMilestones && existingMilestones.length > 0) {
            setMilestones(
              existingMilestones.map((m: any) => ({
                id: m.id,
                title: m.milestone_name,
                construction_phase_id: m.construction_phase_id || null,
                construction_phase_name: m.milestone_description || "",
                percentage: m.percentage,
                amount: m.amount,
                expected_date: m.expected_date || "",
                sequence_order: m.sequence_order,
              }))
            );
            setMilestonesGenerated(true);
            setMilestonesExpanded(true);
          } else {
            setMilestones([]);
            setMilestonesGenerated(false);
            setMilestonesExpanded(false);
          }
        } catch (err) {
          console.error("Failed to fetch milestones:", err);
          setMilestones([]);
          setMilestonesGenerated(false);
        }
      } else {
        setEditingSite(null);
        setUploadedFile(null);
        setMilestones([]);
        setMilestonesGenerated(false);
        setMilestonesExpanded(false);
        setForm({
          name: "",
          address: "",
          city: "",
          status: "active",
          site_type: "single_client",
          start_date: "",
          target_completion_date: "",
          construction_phase_id: null,
          client_name: "",
          client_contact: "",
          client_email: "",
          project_contract_value: 0,
          payment_segments: null,
          contract_document_url: "",
          total_amount_received: 0,
          last_payment_amount: 0,
          last_payment_date: "",
          construction_phase: "",
          location_lat: "",
          location_lng: "",
          location_google_maps_url: "",
          engineer_phone: "",
        });
      }
      setDialogOpen(true);
    },
    [supabase]
  );

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      setSnackbar({
        open: true,
        message: "Only PDF files are allowed for contract documents",
        severity: "error",
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setSnackbar({
        open: true,
        message: "File size must be less than 50MB",
        severity: "error",
      });
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(5);

      const fileExt = file.name.split(".").pop();
      const fileName = `${
        editingSite?.id || "new"
      }_client_contract_${Date.now()}.${fileExt}`;
      const filePath = `${editingSite?.id || "temp"}/${fileName}`;

      // Hardened pipeline: lock-free token + no-progress watchdog + retry, with
      // real upload progress (replaces the old raw storage.upload() that could
      // hang on the auth lock, plus its fake setInterval progress simulation).
      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "contract-documents",
        filePath,
        file,
        contentType: file.type,
        onProgress: (percent) => setUploadProgress(Math.max(5, percent)),
      });

      setUploadProgress(100);

      setForm({ ...form, contract_document_url: publicUrl });
      setUploadedFile({
        name: file.name,
        size: file.size,
        url: publicUrl,
      });

      setSnackbar({
        open: true,
        message: `"${file.name}" uploaded successfully!`,
        severity: "success",
      });
    } catch (err: any) {
      setUploadProgress(0);

      console.error("Upload error:", err);

      setSnackbar({
        open: true,
        message: `Upload failed: ${err.message || "Unknown error"}`,
        severity: "error",
      });
    } finally {
      setUploading(false);
      // Keep progress visible for a moment
      setTimeout(() => setUploadProgress(0), 2000);
    }
  };
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
    // Reset the input so the same file can be selected again if needed
    event.target.value = "";
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setForm({ ...form, contract_document_url: "" });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "Unknown size";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleSnackbarClose = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const handleViewPdf = useCallback((url: string) => {
    setCurrentPdfUrl(url);
    setPdfViewerOpen(true);
  }, []);

  // Generate payment milestones based on segment count
  const generatePaymentMilestones = () => {
    const segmentCount = form.payment_segments || 0;
    const contractValue = form.project_contract_value || 0;

    if (segmentCount < 1) {
      setSnackbar({
        open: true,
        message: "Please enter number of payment segments first",
        severity: "error",
      });
      return;
    }

    if (contractValue <= 0) {
      setSnackbar({
        open: true,
        message: "Please enter project contract value first",
        severity: "error",
      });
      return;
    }

    const newMilestones: MilestoneFormItem[] = [];
    const equalPercentage = Math.floor(100 / segmentCount);
    const lastPercentage = 100 - equalPercentage * (segmentCount - 1);

    for (let i = 0; i < segmentCount; i++) {
      const percentage =
        i === segmentCount - 1 ? lastPercentage : equalPercentage;
      const amount = Math.round((contractValue * percentage) / 100);

      newMilestones.push({
        title: i === 0 ? "Advance" : `Milestone ${i + 1}`,
        construction_phase_id: null,
        construction_phase_name: "",
        percentage,
        amount,
        expected_date: "",
        sequence_order: i + 1,
      });
    }

    setMilestones(newMilestones);
    setMilestonesGenerated(true);
    setMilestonesExpanded(true);

    setSnackbar({
      open: true,
      message: `Generated ${segmentCount} payment milestone${
        segmentCount > 1 ? "s" : ""
      } successfully`,
      severity: "success",
    });
  };

  // Update a specific milestone field
  const updateMilestone = (
    index: number,
    field: keyof MilestoneFormItem,
    value: any
  ) => {
    setMilestones((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-calculate amount when percentage changes
      if (field === "percentage") {
        const contractValue = form.project_contract_value || 0;
        updated[index].amount = Math.round(
          (contractValue * (value as number)) / 100
        );
      }

      return updated;
    });
  };

  // Recalculate all milestone amounts when contract value changes
  const recalculateMilestoneAmounts = () => {
    const contractValue = form.project_contract_value || 0;
    setMilestones((prev) =>
      prev.map((m) => ({
        ...m,
        amount: Math.round((contractValue * m.percentage) / 100),
      }))
    );
  };

  // Get total percentage from all milestones
  const getTotalPercentage = () => {
    return milestones.reduce((sum, m) => sum + m.percentage, 0);
  };

  const handleSubmit = async () => {
    if (!form.name) {
      setSnackbar({
        open: true,
        message: "Site name is required",
        severity: "error",
      });
      return;
    }

    // Only validate contract value if not a personal project and client name is provided
    if (!isPersonalProject && form.client_name && !form.project_contract_value) {
      setSnackbar({
        open: true,
        message: "Please enter project contract value for client",
        severity: "error",
      });
      return;
    }

    // sites.company_id is NOT NULL in the schema. When creating a NEW site,
    // we must have a current company in context. Editing an existing site
    // doesn't change company_id, so the guard only applies to inserts.
    if (!editingSite && !selectedCompany?.id) {
      setSnackbar({
        open: true,
        message: "No company selected. Please pick a company before creating a site.",
        severity: "error",
      });
      return;
    }

    try {
      setLoading(true);
      const mutationClient = supabase as any;
      const updatePayload: Database["public"]["Tables"]["sites"]["Update"] = {
        name: form.name,
        address: form.address || undefined,
        city: form.city || undefined,
        status: form.status,
        site_type: form.site_type,
        start_date: form.start_date || null,
        target_completion_date: form.target_completion_date || null,
        client_name: form.client_name || null,
        client_contact: form.client_contact || null,
        client_email: form.client_email || null,
        project_contract_value: form.project_contract_value || null,
        payment_segments: form.payment_segments || null,
        contract_document_url: form.contract_document_url || null,
        total_amount_received: form.total_amount_received || 0,
        last_payment_amount: form.last_payment_amount || null,
        last_payment_date: form.last_payment_date || null,
        construction_phase_id: form.construction_phase_id,
        construction_phase: form.construction_phase || null,
        location_lat: form.location_lat ? parseFloat(form.location_lat) : null,
        location_lng: form.location_lng ? parseFloat(form.location_lng) : null,
        location_google_maps_url: form.location_google_maps_url || null,
        engineer_phone: form.engineer_phone || null,
      } as Database["public"]["Tables"]["sites"]["Update"] & { engineer_phone: string | null };

      const insertPayload: Database["public"]["Tables"]["sites"]["Insert"] = {
        // Guarded above: when editingSite is null, selectedCompany must exist.
        company_id: selectedCompany!.id,
        name: form.name,
        address: form.address || "",
        city: form.city || "",
        site_type: form.site_type,
        status: form.status,
        start_date: form.start_date || null,
        target_completion_date: form.target_completion_date || null,
        nearby_tea_shop_name: editingSite?.nearby_tea_shop_name || null,
        client_name: form.client_name || null,
        client_contact: form.client_contact || null,
        client_email: form.client_email || null,
        project_contract_value: form.project_contract_value || null,
        payment_segments: form.payment_segments || null,
        contract_document_url: form.contract_document_url || null,
        total_amount_received: form.total_amount_received || 0,
        last_payment_amount: form.last_payment_amount || null,
        last_payment_date: form.last_payment_date || null,
        construction_phase_id: form.construction_phase_id,
        construction_phase: form.construction_phase || null,
        location_lat: form.location_lat ? parseFloat(form.location_lat) : null,
        location_lng: form.location_lng ? parseFloat(form.location_lng) : null,
        location_google_maps_url: form.location_google_maps_url || null,
        engineer_phone: form.engineer_phone || null,
      } as Database["public"]["Tables"]["sites"]["Insert"] & { engineer_phone: string | null };

      if (editingSite) {
        const { error } = await mutationClient
          .from("sites")
          .update(updatePayload)
          .eq("id", editingSite.id);
        if (error) throw error;

        // Save milestones if any exist
        if (milestones.length > 0) {
          // Delete existing milestones for this site
          await mutationClient
            .from("site_payment_milestones")
            .delete()
            .eq("site_id", editingSite.id);

          // Insert new milestones
          const milestonesToInsert = milestones.map((m, idx) => ({
            site_id: editingSite.id,
            milestone_name: m.title,
            milestone_description: m.construction_phase_name || null,
            percentage: m.percentage,
            amount: m.amount,
            expected_date: m.expected_date || null,
            sequence_order: m.sequence_order || idx + 1,
            status: "pending" as const,
          }));

          const { error: milestoneError } = await mutationClient
            .from("site_payment_milestones")
            .insert(milestonesToInsert);

          if (milestoneError) {
            console.error("Error saving milestones:", milestoneError);
          }
        }

        setSnackbar({
          open: true,
          message: `Site "${form.name}" updated successfully!`,
          severity: "success",
        });
      } else {
        const { data: newSite, error } = await mutationClient
          .from("sites")
          .insert(insertPayload)
          .select()
          .single();
        if (error) throw error;

        // Save milestones if any exist and we have the new site ID
        if (milestones.length > 0 && newSite?.id) {
          const milestonesToInsert = milestones.map((m, idx) => ({
            site_id: newSite.id,
            milestone_name: m.title,
            milestone_description: m.construction_phase_name || null,
            percentage: m.percentage,
            amount: m.amount,
            expected_date: m.expected_date || null,
            sequence_order: m.sequence_order || idx + 1,
            status: "pending" as const,
          }));

          const { error: milestoneError } = await mutationClient
            .from("site_payment_milestones")
            .insert(milestonesToInsert);

          if (milestoneError) {
            console.error("Error saving milestones:", milestoneError);
          }
        }

        setSnackbar({
          open: true,
          message: `Site "${form.name}" created successfully!`,
          severity: "success",
        });
      }
      setDialogOpen(false);
      setLoading(false);
      // Reload sites after dialog closes
      setTimeout(() => {
        fetchSites();
        refreshSiteContext(); // Also refresh global SiteContext so attendance page gets fresh data
      }, 100);
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: `Error: ${err.message}`,
        severity: "error",
      });
      setLoading(false);
    }
  };

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        !confirm(
          "Are you sure you want to delete this site? This action cannot be undone."
        )
      )
        return;
      try {
        await supabase.from("sites").delete().eq("id", id);
        setSnackbar({
          open: true,
          message: "Site deleted successfully",
          severity: "success",
        });
        await fetchSites();
      } catch (err: any) {
        setSnackbar({
          open: true,
          message: `Delete failed: ${err.message}`,
          severity: "error",
        });
      }
    },
    [supabase, fetchSites]
  );

  const columns = useMemo<MRT_ColumnDef<SiteWithStats>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Site Name",
        size: 200,
        Cell: ({ cell, row }) => (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {cell.getValue<string>()}
            </Typography>
            {row.original.construction_phase && (
              <Chip
                label={row.original.construction_phase}
                size="small"
                color="info"
                variant="outlined"
                sx={{ mt: 0.5 }}
                icon={<Construction fontSize="small" />}
              />
            )}
          </Box>
        ),
      },
      {
        accessorKey: "client_name",
        header: "Client Details",
        size: 220,
        Cell: ({ cell, row }) => (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {cell.getValue<string>() || "-"}
            </Typography>
            {row.original.client_contact && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mt: 0.5,
                }}
              >
                <Phone sx={{ fontSize: 12 }} />
                {row.original.client_contact}
              </Typography>
            )}
            {row.original.client_email && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <Email sx={{ fontSize: 12 }} />
                {row.original.client_email}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "project_contract_value",
        header: "Contract Value",
        size: 160,
        Cell: ({ cell, row }) => {
          const value = cell.getValue<number>();
          if (!value) return <Typography variant="body2">-</Typography>;

          return (
            <Box>
              <Typography variant="body2" fontWeight={700} color="primary.main">
                ₹{value.toLocaleString()}
              </Typography>
              {row.original.contract_document_url && (
                <Tooltip title="View Contract">
                  <IconButton
                    size="small"
                    onClick={() =>
                      handleViewPdf(row.original.contract_document_url!)
                    }
                    sx={{ mt: 0.5 }}
                  >
                    <Description fontSize="small" color="primary" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "payment_segments",
        header: "Payment Segments",
        size: 160,
        Cell: ({ cell, row }) => {
          const segments = cell.getValue<number | null>();
          if (!segments) return <Typography variant="body2">-</Typography>;

          const siteId = row.original.id;
          const milestonesForSite = siteMilestones[siteId] || [];
          const contractValue = row.original.project_contract_value || 0;
          const plannedPct = milestonesForSite.reduce(
            (sum, m) => sum + (m.percentage || 0),
            0
          );
          const plannedAmount = milestonesForSite.reduce(
            (sum, m) => sum + (m.amount || 0),
            0
          );

          // Calculate paid phases based on actual client payments
          const paymentData = sitePayments[siteId] || { total: 0, count: 0 };
          const totalPaid = paymentData.total;
          const paidPct =
            contractValue > 0
              ? Math.round((totalPaid / contractValue) * 100)
              : 0;

          // Count how many milestones are covered by cumulative payments
          let cumulative = 0;
          let paidCount = 0;
          const sortedMilestones = [...milestonesForSite].sort(
            (a, b) => (a.sequence_order || 0) - (b.sequence_order || 0)
          );
          for (const m of sortedMilestones) {
            cumulative += m.amount || 0;
            if (totalPaid >= cumulative) {
              paidCount++;
            } else {
              break;
            }
          }

          const tooltipContent = (
            <Box sx={{ fontSize: 10, maxWidth: 280 }}>
              <Typography
                variant="caption"
                sx={{ fontSize: 10, fontWeight: 600 }}
              >
                Planned: {segments} segment{segments > 1 ? "s" : ""}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontSize: 10, display: "block" }}
              >
                Total: {plannedPct}% of ₹{contractValue.toLocaleString("en-IN")}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontSize: 10, display: "block", color: "#00ff40" }}
              >
                Paid: ₹{totalPaid.toLocaleString("en-IN")} ({paidPct}%)
              </Typography>
              {milestonesForSite.length > 0 && (
                <Box
                  sx={{
                    mt: 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <Chip
                    label={`${paidCount} paid`}
                    size="small"
                    color="success"
                    sx={{ fontSize: 10, height: 20 }}
                  />
                  <Chip
                    label={`${milestonesForSite.length - paidCount} pending`}
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ fontSize: 10, height: 20 }}
                  />
                </Box>
              )}
              <Divider sx={{ my: 0.5 }} />
              {milestonesForSite.length === 0 ? (
                <Typography variant="caption" sx={{ fontSize: 10 }}>
                  No detailed milestones saved yet.
                </Typography>
              ) : (
                <Stack spacing={0.4}>
                  {milestonesForSite.map((m, idx) => (
                    <Box
                      key={m.id || idx}
                      sx={{ display: "flex", flexDirection: "column" }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ fontSize: 10, fontWeight: 600 }}
                      >
                        #{m.sequence_order}. {m.milestone_name} — {m.percentage}
                        % (₹{m.amount.toLocaleString("en-IN")})
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: 10, color: "text.secondary" }}
                      >
                        {m.expected_date
                          ? `Due ${dayjs(m.expected_date).format(
                              "DD MMM YYYY"
                            )}`
                          : "No due date"}{" "}
                        • Status: {m.status}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          );

          return (
            <Tooltip
              title={tooltipContent}
              arrow
              placement="top"
              enterDelay={300}
            >
              <Chip
                label={`${segments} Segments`}
                size="small"
                variant="outlined"
                color="info"
                sx={{ cursor: "default" }}
              />
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "subcontract_count",
        header: "Subcontracts",
        size: 140,
        Cell: ({ cell, row }) => (
          <Box>
            <Chip
              label={`${cell.getValue<number>()} Subcontracts`}
              size="small"
              color="secondary"
              icon={<Assignment />}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
            >
              ₹{row.original.total_subcontract_value.toLocaleString()}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "total_amount_received",
        header: "Payment Status",
        size: 180,
        Cell: ({ cell, row }) => {
          const received = cell.getValue<number>() || 0;
          const total = row.original.project_contract_value || 0;
          const percentage = total > 0 ? (received / total) * 100 : 0;

          if (total === 0) return <Typography variant="body2">-</Typography>;

          return (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="caption" fontWeight={600}>
                  ₹{received.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {percentage.toFixed(0)}%
                </Typography>
              </Box>
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
              {row.original.last_payment_date && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  Last:{" "}
                  {dayjs(row.original.last_payment_date).format("DD MMM YYYY")}
                </Typography>
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "amount_pending",
        header: "Amount Pending",
        size: 140,
        Cell: ({ cell }) => {
          const pending = cell.getValue<number>();
          if (pending <= 0) {
            return <Chip label="Fully Paid" size="small" color="success" />;
          }
          return (
            <Typography variant="body2" fontWeight={600} color="warning.main">
              ₹{pending.toLocaleString()}
            </Typography>
          );
        },
      },
      {
        accessorKey: "location_google_maps_url",
        header: "Location",
        size: 120,
        Cell: ({ cell, row }) => {
          const mapsUrl = cell.getValue<string>();
          if (!mapsUrl && !row.original.location_lat) {
            return <Typography variant="body2">-</Typography>;
          }

          const url =
            mapsUrl ||
            `https://www.google.com/maps?q=${row.original.location_lat},${row.original.location_lng}`;

          return (
            <Tooltip title="Open in Google Maps">
              <Button
                size="small"
                variant="outlined"
                startIcon={<LocationOn />}
                endIcon={<OpenInNew fontSize="small" />}
                onClick={() => window.open(url, "_blank")}
                sx={{ textTransform: "none" }}
              >
                View Map
              </Button>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ cell }) => {
          const status = cell.getValue<string>();
          const colorMap: Record<string, any> = {
            active: "success",
            inactive: "default",
            completed: "info",
          };
          return (
            <Chip
              label={status.toUpperCase()}
              size="small"
              color={colorMap[status] || "default"}
            />
          );
        },
      },
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 120,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(row.original)}
              disabled={!canEdit}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(row.original.id)}
              disabled={!canEdit}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [
      canEdit,
      handleViewPdf,
      handleDelete,
      handleOpenDialog,
      siteMilestones,
      sitePayments,
    ]
  );

  const stats = useMemo(() => {
    const active = sites.filter((s) => s.status === "active").length;
    const totalContractValue = sites.reduce(
      (sum, s) => sum + (s.project_contract_value || 0),
      0
    );
    const totalReceived = sites.reduce(
      (sum, s) => sum + (s.total_amount_received || 0),
      0
    );
    const totalPending = sites.reduce((sum, s) => sum + s.amount_pending, 0);
    const totalSubcontracts = sites.reduce(
      (sum, s) => sum + s.subcontract_count,
      0
    );

    return {
      total: sites.length,
      active,
      totalContractValue,
      totalReceived,
      totalPending,
      totalSubcontracts,
    };
  }, [sites]);

  return (
    <Box>
      <PageHeader
        title="Sites Management"
        subtitle="Manage construction sites and client contracts"
        actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            disabled={!canEdit}
          >
            Add Site
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Total Sites
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.total}
              </Typography>
              <Typography variant="caption" color="success.main">
                {stats.active} Active
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "primary.light" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Total Contract Value
              </Typography>
              <Typography variant="h5" fontWeight={700} color="primary.main">
                ₹{(stats.totalContractValue / 1000000).toFixed(2)}M
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "success.light" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Amount Received
              </Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">
                ₹{(stats.totalReceived / 1000000).toFixed(2)}M
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <Card sx={{ bgcolor: "warning.light" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Amount Pending
              </Typography>
              <Typography variant="h5" fontWeight={700} color="warning.main">
                ₹{(stats.totalPending / 1000000).toFixed(2)}M
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Total Subcontracts
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.totalSubcontracts}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <DataTable columns={columns} data={sites} isLoading={loading} />

      {/* Site Add/Edit Drawer */}
      <Drawer
        anchor="right"
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: "600px", md: "700px" },
            maxWidth: "100%",
          },
        }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            {editingSite ? "Edit Site" : "Add New Site"}
          </Typography>
          <IconButton onClick={() => setDialogOpen(false)} size="small">
            <Close />
          </IconButton>
        </Box>

        {/* Drawer Content */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            p: 2,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: "action.hover" }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Basic Information
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Site Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.site_type === "personal"}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            site_type: e.target.checked ? "personal" : "single_client",
                            // Clear contract fields when switching to personal
                            ...(e.target.checked && {
                              client_name: "",
                              client_contact: "",
                              client_email: "",
                              project_contract_value: 0,
                              payment_segments: null,
                            }),
                          })
                        }
                      />
                    }
                    label="This is a personal project (no client contract)"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="City"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value as any })
                      }
                      label="Status"
                    >
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Inactive</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Full Address"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    multiline
                    rows={2}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Project Start Date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) =>
                      setForm({ ...form, start_date: e.target.value })
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Expected End Date"
                    type="date"
                    value={form.target_completion_date}
                    onChange={(e) =>
                      setForm({ ...form, target_completion_date: e.target.value })
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                {form.status !== "completed" && (
                <Grid size={{ xs: 12 }}>
                  <Autocomplete
                    fullWidth
                    options={[
                      ...phases.map((p) => ({
                        id: p.id,
                        label: p.name,
                        group: "Phase" as const,
                        sequence: p.sequence_order,
                      })),
                      ...subphases.map((sp) => {
                        const phase = phases.find((p) => p.id === sp.phase_id);
                        return {
                          id: sp.id,
                          label: sp.name,
                          group: "SubPhase" as const,
                          phaseId: sp.phase_id,
                          phaseName: phase?.name || "",
                          sequence: sp.sequence_order,
                        };
                      }),
                    ]}
                    groupBy={(option) => option.group}
                    getOptionLabel={(option) => option.label}
                    renderOption={(props, option) => (
                      <li {...props}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">
                            {option.label}
                          </Typography>
                          {option.group === "SubPhase" && option.phaseName && (
                            <Chip
                              label={option.phaseName}
                              size="small"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          )}
                        </Stack>
                      </li>
                    )}
                    value={
                      [
                        ...phases.map((p) => ({
                          id: p.id,
                          label: p.name,
                          group: "Phase" as const,
                          sequence: p.sequence_order,
                        })),
                        ...subphases.map((sp) => {
                          const phase = phases.find(
                            (p) => p.id === sp.phase_id
                          );
                          return {
                            id: sp.id,
                            label: sp.name,
                            group: "SubPhase" as const,
                            phaseId: sp.phase_id,
                            phaseName: phase?.name || "",
                            sequence: sp.sequence_order,
                          };
                        }),
                      ].find((opt) => opt.id === form.construction_phase_id) ||
                      null
                    }
                    onChange={(_, val) => {
                      if (!val) {
                        setForm({
                          ...form,
                          construction_phase_id: null,
                          construction_phase: "",
                        });
                        return;
                      }
                      setForm({
                        ...form,
                        construction_phase_id: val.id,
                        construction_phase: val.label,
                      });
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Construction Phase"
                        placeholder="Search phases or subphases..."
                        helperText="Select a construction phase or subphase for this site"
                      />
                    )}
                  />
                </Grid>
                )}
              </Grid>
            </Paper>

            {!isPersonalProject && (
            <>
            <Paper elevation={0} sx={{ p: 2, bgcolor: "primary.50" }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Client Contract Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Client Name"
                    value={form.client_name}
                    onChange={(e) =>
                      setForm({ ...form, client_name: e.target.value })
                    }
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Client Contact"
                    value={form.client_contact}
                    onChange={(e) =>
                      setForm({ ...form, client_contact: e.target.value })
                    }
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Engineer WhatsApp"
                    placeholder="+91XXXXXXXXXX"
                    value={form.engineer_phone}
                    onChange={(e) =>
                      setForm({ ...form, engineer_phone: e.target.value })
                    }
                    helperText="Used by Daily Peek to nudge when attendance isn't recorded"
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Client Email"
                    type="email"
                    value={form.client_email}
                    onChange={(e) =>
                      setForm({ ...form, client_email: e.target.value })
                    }
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Project Contract Value"
                    type="number"
                    value={form.project_contract_value || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        project_contract_value: parseFloat(e.target.value) || 0,
                      })
                    }
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography>,
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Payment Segments"
                    type="number"
                    inputProps={{ min: 1, max: 20 }}
                    value={form.payment_segments || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        payment_segments: parseInt(e.target.value) || null,
                      })
                    }
                    helperText="Number of payment milestones/phases planned"
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                  />

                  {/* Drag and Drop Upload Area */}
                  <Paper
                    ref={dropZoneRef}
                    elevation={0}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() =>
                      !uploading &&
                      !uploadedFile &&
                      fileInputRef.current?.click()
                    }
                    sx={{
                      p: 3,
                      border: "2px dashed",
                      borderColor: isDragging
                        ? "primary.main"
                        : uploadedFile
                        ? "success.main"
                        : "divider",
                      borderRadius: 2,
                      bgcolor: isDragging
                        ? alpha(theme.palette.primary.main, 0.08)
                        : uploadedFile
                        ? alpha(theme.palette.success.main, 0.05)
                        : "background.default",
                      cursor: uploading
                        ? "wait"
                        : uploadedFile
                        ? "default"
                        : "pointer",
                      transition: "all 0.2s ease-in-out",
                      "&:hover": {
                        borderColor: uploadedFile
                          ? "success.main"
                          : "primary.main",
                        bgcolor: uploadedFile
                          ? alpha(theme.palette.success.main, 0.08)
                          : alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    {uploading ? (
                      // Uploading State
                      <Box sx={{ textAlign: "center" }}>
                        <CircularProgress
                          size={48}
                          variant={
                            uploadProgress > 0 ? "determinate" : "indeterminate"
                          }
                          value={uploadProgress}
                          sx={{ mb: 2 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          Uploading...{" "}
                          {uploadProgress > 0 ? `${uploadProgress}%` : ""}
                        </Typography>
                      </Box>
                    ) : uploadedFile ? (
                      // File Uploaded State
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <Box
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.error.main, 0.1),
                            display: "flex",
                          }}
                        >
                          <PictureAsPdf
                            sx={{ fontSize: 32, color: "error.main" }}
                          />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {uploadedFile.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatFileSize(uploadedFile.size)}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              mt: 0.5,
                            }}
                          >
                            <CheckCircle
                              sx={{ fontSize: 14, color: "success.main" }}
                            />
                            <Typography variant="caption" color="success.main">
                              Uploaded successfully
                            </Typography>
                          </Box>
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="View Document">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewPdf(form.contract_document_url);
                              }}
                            >
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Change Document">
                            <IconButton
                              size="small"
                              color="default"
                              onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                              }}
                            >
                              <Upload fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove Document">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile();
                              }}
                            >
                              <Close fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Box>
                    ) : (
                      // Empty State - Ready for Upload
                      <Box sx={{ textAlign: "center" }}>
                        <CloudUpload
                          sx={{
                            fontSize: 48,
                            color: isDragging
                              ? "primary.main"
                              : "action.disabled",
                            mb: 1,
                          }}
                        />
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          gutterBottom
                        >
                          {isDragging
                            ? "Drop your PDF here"
                            : "Drag and drop your contract PDF here"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          or click to browse • PDF files only • Max 50MB
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            </Paper>

            <Paper elevation={0} sx={{ p: 2, bgcolor: "success.50" }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Payment Tracking
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Total Amount Received"
                    type="number"
                    value={form.total_amount_received || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        total_amount_received: parseFloat(e.target.value) || 0,
                      })
                    }
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography>,
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Last Payment Amount"
                    type="number"
                    value={form.last_payment_amount || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        last_payment_amount: parseFloat(e.target.value) || 0,
                      })
                    }
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography>,
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Last Payment Date"
                    type="date"
                    value={form.last_payment_date}
                    onChange={(e) =>
                      setForm({ ...form, last_payment_date: e.target.value })
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Payment Milestones Planning Section */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                bgcolor: alpha(theme.palette.secondary.main, 0.08),
                border: milestonesGenerated
                  ? `1px solid ${alpha(theme.palette.secondary.main, 0.3)}`
                  : "none",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: milestonesGenerated ? "pointer" : "default",
                }}
                onClick={() =>
                  milestonesGenerated &&
                  setMilestonesExpanded(!milestonesExpanded)
                }
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Timeline color="secondary" />
                  <Typography variant="subtitle2" fontWeight={600}>
                    Payment Milestones Planning
                  </Typography>
                  {milestones.length > 0 && (
                    <Chip
                      label={`${milestones.length} milestone${
                        milestones.length > 1 ? "s" : ""
                      }`}
                      size="small"
                      color="secondary"
                      variant="outlined"
                    />
                  )}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {!milestonesGenerated && (
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      startIcon={<AutoAwesome />}
                      onClick={(e) => {
                        e.stopPropagation();
                        generatePaymentMilestones();
                      }}
                      disabled={
                        !form.payment_segments || !form.project_contract_value
                      }
                    >
                      Plan Payments
                    </Button>
                  )}
                  {milestonesGenerated && (
                    <IconButton size="small">
                      {milestonesExpanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                  )}
                </Box>
              </Box>

              {!milestonesGenerated && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: "block" }}
                >
                  Enter the contract value and number of payment segments above,
                  then click &ldquo;Plan Payments&rdquo; to generate milestone
                  fields.
                </Typography>
              )}

              <Collapse in={milestonesExpanded}>
                <Divider sx={{ my: 2 }} />

                {/* Percentage Summary */}
                {milestones.length > 0 && (
                  <Alert
                    severity={
                      getTotalPercentage() === 100 ? "success" : "warning"
                    }
                    sx={{ mb: 2 }}
                    icon={<Payments />}
                  >
                    Total: {getTotalPercentage()}% of contract value (₹
                    {milestones
                      .reduce((sum, m) => sum + m.amount, 0)
                      .toLocaleString("en-IN")}
                    ){getTotalPercentage() !== 100 && ` — Should equal 100%`}
                  </Alert>
                )}

                {/* Milestone Fields */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {milestones.map((milestone, index) => (
                    <Paper
                      key={index}
                      elevation={0}
                      sx={{
                        p: 2,
                        bgcolor: "background.paper",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 1.5,
                        }}
                      >
                        <Chip
                          label={`#${index + 1}`}
                          size="small"
                          color={index === 0 ? "primary" : "default"}
                          sx={{ fontWeight: 600 }}
                        />
                        {index === 0 && (
                          <Chip
                            label="Advance"
                            size="small"
                            color="info"
                            variant="outlined"
                          />
                        )}
                      </Box>

                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Milestone Title"
                            value={milestone.title}
                            onChange={(e) =>
                              updateMilestone(index, "title", e.target.value)
                            }
                            placeholder={
                              index === 0
                                ? "Advance Payment"
                                : `Milestone ${index + 1}`
                            }
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Autocomplete
                            size="small"
                            options={phaseOptions}
                            groupBy={(option) => option.group}
                            getOptionLabel={(option) => option.label}
                            value={
                              phaseOptions.find(
                                (p) => p.id === milestone.construction_phase_id
                              ) || null
                            }
                            onChange={(_, val) => {
                              updateMilestone(
                                index,
                                "construction_phase_id",
                                val?.id || null
                              );
                              updateMilestone(
                                index,
                                "construction_phase_name",
                                val?.label || ""
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Construction Phase (Optional)"
                                placeholder="Link to phase..."
                              />
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Percentage"
                            type="number"
                            inputProps={{ min: 0, max: 100, step: 1 }}
                            value={milestone.percentage}
                            onChange={(e) =>
                              updateMilestone(
                                index,
                                "percentage",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  %
                                </InputAdornment>
                              ),
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 4 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Amount (Auto)"
                            value={milestone.amount.toLocaleString("en-IN")}
                            InputProps={{
                              readOnly: true,
                              startAdornment: (
                                <InputAdornment position="start">
                                  ₹
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              bgcolor: alpha(theme.palette.grey[100], 0.5),
                              "& .MuiInputBase-input": { fontWeight: 600 },
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 5 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Expected Date"
                            type="date"
                            value={milestone.expected_date}
                            onChange={(e) =>
                              updateMilestone(
                                index,
                                "expected_date",
                                e.target.value
                              )
                            }
                            InputLabelProps={{ shrink: true }}
                          />
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}
                </Box>

                {/* Actions for milestones */}
                {milestones.length > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mt: 2,
                    }}
                  >
                    <Button
                      size="small"
                      color="error"
                      onClick={() => {
                        setMilestones([]);
                        setMilestonesGenerated(false);
                        setMilestonesExpanded(false);
                      }}
                    >
                      Clear All Milestones
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      onClick={() => {
                        recalculateMilestoneAmounts();
                      }}
                    >
                      Recalculate Amounts
                    </Button>
                  </Box>
                )}
              </Collapse>
            </Paper>
            </>
            )}

            <Paper elevation={0} sx={{ p: 2, bgcolor: "info.50" }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Location Information
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Latitude"
                    type="number"
                    value={form.location_lat}
                    onChange={(e) =>
                      setForm({ ...form, location_lat: e.target.value })
                    }
                    placeholder="e.g., 12.9716"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Longitude"
                    type="number"
                    value={form.location_lng}
                    onChange={(e) =>
                      setForm({ ...form, location_lng: e.target.value })
                    }
                    placeholder="e.g., 77.5946"
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Google Maps URL (Optional)"
                    value={form.location_google_maps_url}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        location_google_maps_url: e.target.value,
                      })
                    }
                    placeholder="https://goo.gl/maps/..."
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>
        </Box>

        {/* Drawer Footer with Actions */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          <Button
            onClick={() => setDialogOpen(false)}
            variant="outlined"
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading}
            sx={{ flex: 1 }}
          >
            {editingSite ? "Save Changes" : "Add Site"}
          </Button>
        </Box>
      </Drawer>

      <Dialog
        open={pdfViewerOpen}
        onClose={() => setPdfViewerOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Contract Document
          <IconButton
            onClick={() => window.open(currentPdfUrl, "_blank")}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <OpenInNew />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ width: "100%", height: "70vh" }}>
            <iframe
              src={currentPdfUrl}
              width="100%"
              height="100%"
              style={{ border: "none" }}
              title="Contract Document"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPdfViewerOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
