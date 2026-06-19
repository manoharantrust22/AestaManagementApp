"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Alert,
  Fab,
  CircularProgress,
  alpha,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Autocomplete,
} from "@mui/material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Block as BlockIcon,
  Warning as WarningIcon,
  Payments as PaymentsIcon,
  Tune as TuneIcon,
} from "@mui/icons-material";
import {
  useLaborSpecialties,
  laborSpecialtyKeys,
} from "@/hooks/queries/useLaborSpecialties";
import MesthriCommissionReport from "@/components/laborers/MesthriCommissionReport";
import ManageSpecialtiesDialog from "@/components/laborers/ManageSpecialtiesDialog";
import { useQueryClient } from "@tanstack/react-query";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import type { Tables } from "@/types/database.types";
import type { LaborersPageData, LaborerWithDetails } from "@/lib/data/laborers";
import LaborerPhotoUploader from "@/components/laborers/LaborerPhotoUploader";
import RateCascadeDialog from "@/components/laborers/RateCascadeDialog";
import LaborerProfileDrawer from "@/components/laborers/LaborerProfileDrawer";
import type { LaborerRateCascadeResult } from "@/lib/services/laborerService";
import dayjs from "dayjs";

type LaborCategory = Tables<"labor_categories">;
type LaborRole = Tables<"labor_roles">;
type Team = Tables<"teams">;
type LaborerType = "daily_market" | "contract";

interface LaborersContentProps {
  initialData: LaborersPageData;
}

export default function LaborersContent({ initialData }: LaborersContentProps) {
  // Initialize state with server data
  const [laborers, setLaborers] = useState<LaborerWithDetails[]>(
    initialData.laborers
  );
  const [categories] = useState<LaborCategory[]>(initialData.categories);
  const [roles] = useState<LaborRole[]>(initialData.roles);
  const [teams] = useState<Team[]>(initialData.teams);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingLaborer, setEditingLaborer] =
    useState<LaborerWithDetails | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [deactivatingLaborer, setDeactivatingLaborer] =
    useState<LaborerWithDetails | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const [rateCascadeContext, setRateCascadeContext] = useState<{
    laborerId: string;
    laborerName: string;
    oldRate: number;
    newRate: number;
  } | null>(null);

  const [profileLaborerId, setProfileLaborerId] = useState<string | null>(null);
  const profileLaborer = useMemo(
    () =>
      profileLaborerId
        ? laborers.find((l) => l.id === profileLaborerId) ?? null
        : null,
    [profileLaborerId, laborers]
  );

  // Tabs along the work-category axis. "all" = no category filter; the rest
  // are dynamic, one tab per labor_category present in initialData ordered by
  // display_order then name.
  const [activeTabId, setActiveTabId] = useState<string>("all");

  // Orthogonal type chips: filter on top of the active tab.
  const [typeFilters, setTypeFilters] = useState<{
    daily_market: boolean;
    contract: boolean;
    mesthris: boolean;
  }>({ daily_market: false, contract: false, mesthris: false });

  // Primary axes (above the table): default to Active so the page opens on the
  // current crew; "all"/"inactive" let the user look back at who has left.
  // Language is display-only here (attendance still uses laborers combined).
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("active");
  const [languageFilter, setLanguageFilter] = useState<
    "all" | "Tamil" | "Hindi"
  >("all");

  // Null language is treated as Tamil (matches the table cell default).
  const matchesLanguage = useCallback(
    (l: LaborerWithDetails) =>
      languageFilter === "all" || (l.language ?? "Tamil") === languageFilter,
    [languageFilter]
  );
  const matchesStatus = useCallback(
    (l: LaborerWithDetails) =>
      statusFilter === "all" || l.status === statusFilter,
    [statusFilter]
  );

  // Specialty (fine-grained skill) filter for recall, e.g. Status=Inactive +
  // Specialty=Tiling -> a call-back list. A laborer matches if they have ANY
  // of the selected specialties.
  const { data: specialties = [] } = useLaborSpecialties();
  const queryClient = useQueryClient();
  const [specialtyFilter, setSpecialtyFilter] = useState<string[]>([]);
  const [commissionReportOpen, setCommissionReportOpen] = useState(false);
  const [manageSpecialtiesOpen, setManageSpecialtiesOpen] = useState(false);

  const matchesSpecialty = useCallback(
    (l: LaborerWithDetails) =>
      specialtyFilter.length === 0 ||
      (l.specialty_ids ?? []).some((id) => specialtyFilter.includes(id)),
    [specialtyFilter]
  );

  // Mesthri detection: a laborer is a mesthri iff their id appears as
  // teams.leader_laborer_id (canonical link) OR their name matches some
  // teams.leader_name text (legacy bridge for teams created before
  // leader_laborer_id was wired).
  const { mesthriFkSet, mesthriNameSet } = useMemo(() => {
    const fk = new Set<string>();
    const names = new Set<string>();
    for (const t of teams as Array<Team & { leader_laborer_id?: string | null }>) {
      if (t.leader_laborer_id) {
        fk.add(t.leader_laborer_id);
      } else if (t.leader_name) {
        names.add(t.leader_name.trim().toLowerCase());
      }
    }
    return { mesthriFkSet: fk, mesthriNameSet: names };
  }, [teams]);

  const isMesthri = useCallback(
    (l: LaborerWithDetails) =>
      mesthriFkSet.has(l.id) ||
      mesthriNameSet.has((l.name || "").trim().toLowerCase()),
    [mesthriFkSet, mesthriNameSet]
  );

  // Multi-skill aware: a laborer is "in" a category if it's their primary
  // category_id OR appears in their skills list. The primary skill is also
  // present in skills (backfilled), so the second check alone would suffice,
  // but we keep both for resilience against any backfill drift.
  const isInCategory = useCallback(
    (l: LaborerWithDetails, categoryId: string) =>
      l.category_id === categoryId ||
      (l.skills ?? []).some((s) => s.category_id === categoryId),
    []
  );

  // Status + language are the primary axes; the category tab and type chips
  // layer on top. `scoped` feeds the tab/chip counts so the numbers shown
  // always match the rows the user can actually see.
  const scoped = useMemo(
    () =>
      laborers.filter(
        (l) => matchesStatus(l) && matchesLanguage(l) && matchesSpecialty(l)
      ),
    [laborers, matchesStatus, matchesLanguage, matchesSpecialty]
  );

  const filteredLaborers = useMemo(() => {
    return scoped.filter((l) => {
      // Tab filter (category)
      if (activeTabId !== "all" && !isInCategory(l, activeTabId)) return false;
      // Type chips (intersection — all active chips must match)
      if (typeFilters.daily_market && l.laborer_type !== "daily_market")
        return false;
      if (typeFilters.contract && l.laborer_type !== "contract") return false;
      if (typeFilters.mesthris && !isMesthri(l)) return false;
      return true;
    });
  }, [scoped, activeTabId, typeFilters, isInCategory, isMesthri]);

  // Counts for tab labels (respect status + language)
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scoped.length };
    for (const c of categories) {
      counts[c.id] = scoped.filter((l) => isInCategory(l, c.id)).length;
    }
    return counts;
  }, [scoped, categories, isInCategory]);

  // Counts for type chips (apply current tab + status + language, not other chips)
  const chipCounts = useMemo(() => {
    const baseList =
      activeTabId === "all"
        ? scoped
        : scoped.filter((l) => isInCategory(l, activeTabId));
    return {
      daily_market: baseList.filter((l) => l.laborer_type === "daily_market")
        .length,
      contract: baseList.filter((l) => l.laborer_type === "contract").length,
      mesthris: baseList.filter((l) => isMesthri(l)).length,
    };
  }, [scoped, activeTabId, isInCategory, isMesthri]);

  // Counts for the Status toggle: scoped by language only (its own axis
  // excluded), so "Active (n)" reflects the current language pick.
  const statusCounts = useMemo(() => {
    const base = laborers.filter((l) => matchesLanguage(l) && matchesSpecialty(l));
    return {
      active: base.filter((l) => l.status === "active").length,
      inactive: base.filter((l) => l.status === "inactive").length,
      all: base.length,
    };
  }, [laborers, matchesLanguage, matchesSpecialty]);

  // Counts for the Language toggle: scoped by status (+ specialty) only.
  const languageCounts = useMemo(() => {
    const base = laborers.filter((l) => matchesStatus(l) && matchesSpecialty(l));
    return {
      Tamil: base.filter((l) => (l.language ?? "Tamil") === "Tamil").length,
      Hindi: base.filter((l) => l.language === "Hindi").length,
      all: base.length,
    };
  }, [laborers, matchesStatus, matchesSpecialty]);

  const { userProfile } = useAuth();
  const { selectedCompany } = useSelectedCompany();
  const supabase = useMemo(() => createClient(), []);
  const isMobile = useIsMobile();
  const theme = useTheme();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    category_id: "",
    role_id: "",
    employment_type: "daily_wage" as "daily_wage" | "contract" | "specialist",
    laborer_type: "daily_market" as LaborerType,
    language: "Tamil" as "Hindi" | "Tamil",
    daily_rate: 0,
    team_id: "",
    associated_team_id: "",
    status: "active" as "active" | "inactive",
    joining_date: dayjs().format("YYYY-MM-DD"),
    photo_url: null as string | null,
    additional_skill_ids: [] as string[],
    specialty_ids: [] as string[],
    // Estimated daily commission passed to the mesthri (kept as string in the
    // input, coerced to a number on save). Default 50; only counts when a
    // mesthri is resolvable (server-side gating).
    commission_per_day: "50",
    // Extended profile (collapsible "More details" section). Age is kept as a
    // string in the input and coerced to a number on save.
    alternate_phone: "",
    age: "",
    address: "",
    id_proof_type: "",
    id_proof_number: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    notes: "",
  });

  // Controls the collapsible "More details" panel in the Add/Edit dialog.
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  const fetchLaborers = useCallback(async () => {
    try {
      setLoading(true);
      const [laborersRes, skillsRes, specialtiesRes] = await Promise.all([
        supabase
          .from("laborers")
          .select(
            `*, category:labor_categories(name), role:labor_roles(name), team:teams!laborers_team_id_fkey(name), associated_team:teams!laborers_associated_team_id_fkey(name)`
          )
          .order("name"),
        (supabase.from("laborer_skills" as any) as any).select(
          "laborer_id, category_id, is_primary"
        ),
        (supabase.from("laborer_specialties" as any) as any).select(
          "laborer_id, specialty_id"
        ),
      ]);

      if (laborersRes.error) throw laborersRes.error;
      if (skillsRes.error) throw skillsRes.error;
      if (specialtiesRes.error) throw specialtiesRes.error;

      const skillsByLaborer = new Map<string, LaborerWithDetails["skills"]>();
      for (const s of (skillsRes.data || []) as any[]) {
        const arr = skillsByLaborer.get(s.laborer_id) ?? [];
        arr.push({
          category_id: s.category_id,
          is_primary: !!s.is_primary,
        });
        skillsByLaborer.set(s.laborer_id, arr);
      }

      const specialtiesByLaborer = new Map<string, string[]>();
      for (const s of (specialtiesRes.data || []) as any[]) {
        const arr = specialtiesByLaborer.get(s.laborer_id) ?? [];
        arr.push(s.specialty_id);
        specialtiesByLaborer.set(s.laborer_id, arr);
      }

      setLaborers(
        (laborersRes.data || []).map((l: any) => ({
          ...l,
          category_name: l.category?.name || "",
          role_name: l.role?.name || "",
          team_name: l.team?.name || null,
          associated_team_name: l.associated_team?.name || null,
          skills: skillsByLaborer.get(l.id) ?? [],
          specialty_ids: specialtiesByLaborer.get(l.id) ?? [],
        }))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const handleOpenDialog = (laborer?: LaborerWithDetails) => {
    if (laborer) {
      setEditingLaborer(laborer);
      // additional_skill_ids = skills minus the primary (which equals category_id)
      const additional = (laborer.skills ?? [])
        .filter((s) => !s.is_primary && s.category_id !== laborer.category_id)
        .map((s) => s.category_id);
      setFormData({
        name: laborer.name,
        phone: laborer.phone || "",
        category_id: laborer.category_id,
        role_id: laborer.role_id,
        employment_type: laborer.employment_type,
        laborer_type: (laborer.laborer_type as LaborerType) || "daily_market",
        language: (laborer.language as "Hindi" | "Tamil") || "Tamil",
        daily_rate: laborer.daily_rate,
        team_id: laborer.team_id || "",
        associated_team_id: laborer.associated_team_id || "",
        status: laborer.status,
        joining_date: laborer.joining_date || dayjs().format("YYYY-MM-DD"),
        photo_url: laborer.photo_url || null,
        additional_skill_ids: additional,
        specialty_ids: laborer.specialty_ids ?? [],
        commission_per_day:
          laborer.commission_per_day != null
            ? String(laborer.commission_per_day)
            : "50",
        alternate_phone: laborer.alternate_phone || "",
        age: laborer.age != null ? String(laborer.age) : "",
        address: laborer.address || "",
        id_proof_type: laborer.id_proof_type || "",
        id_proof_number: laborer.id_proof_number || "",
        emergency_contact_name: laborer.emergency_contact_name || "",
        emergency_contact_phone: laborer.emergency_contact_phone || "",
        notes: laborer.notes || "",
      });
      // Auto-expand "More details" when the laborer already has any of them.
      setShowMoreDetails(
        Boolean(
          laborer.alternate_phone ||
            laborer.age != null ||
            laborer.address ||
            laborer.id_proof_type ||
            laborer.id_proof_number ||
            laborer.emergency_contact_name ||
            laborer.emergency_contact_phone ||
            laborer.notes
        )
      );
    } else {
      setEditingLaborer(null);
      setFormData({
        name: "",
        phone: "",
        category_id: "",
        role_id: "",
        employment_type: "daily_wage",
        laborer_type: "daily_market",
        language: "Tamil",
        daily_rate: 0,
        team_id: "",
        associated_team_id: "",
        status: "active",
        joining_date: dayjs().format("YYYY-MM-DD"),
        photo_url: null,
        additional_skill_ids: [],
        specialty_ids: [],
        commission_per_day: "50",
        alternate_phone: "",
        age: "",
        address: "",
        id_proof_type: "",
        id_proof_number: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        notes: "",
      });
      setShowMoreDetails(false);
    }
    setOpenDialog(true);
  };

  /**
   * Sync laborer_skills: ensure exactly one primary row matching category_id,
   * plus is_primary=false rows for each additional_skill_ids entry. Rows for
   * categories no longer in the set are deleted.
   */
  const syncLaborerSkills = useCallback(
    async (
      laborerId: string,
      primaryCategoryId: string,
      additionalCategoryIds: string[]
    ) => {
      const desired = new Set<string>([primaryCategoryId, ...additionalCategoryIds]);
      // Read existing
      const { data: existing, error: readErr } = await (
        supabase.from("laborer_skills" as any) as any
      )
        .select("category_id, is_primary")
        .eq("laborer_id", laborerId);
      if (readErr) throw readErr;
      const existingByCat = new Map<string, { is_primary: boolean }>();
      for (const r of (existing || []) as any[]) {
        existingByCat.set(r.category_id, { is_primary: !!r.is_primary });
      }

      // Delete rows that are no longer in the desired set
      const toDelete = Array.from(existingByCat.keys()).filter(
        (c) => !desired.has(c)
      );
      if (toDelete.length > 0) {
        const { error: delErr } = await (
          supabase.from("laborer_skills" as any) as any
        )
          .delete()
          .eq("laborer_id", laborerId)
          .in("category_id", toDelete);
        if (delErr) throw delErr;
      }

      // Demote any current primary that isn't the new primary, BEFORE upserting
      // the new primary, to avoid the partial-unique-index conflict.
      const oldPrimaryCat = Array.from(existingByCat.entries()).find(
        ([cat, v]) => v.is_primary && cat !== primaryCategoryId
      )?.[0];
      if (oldPrimaryCat) {
        const { error: demoteErr } = await (
          supabase.from("laborer_skills" as any) as any
        )
          .update({ is_primary: false })
          .eq("laborer_id", laborerId)
          .eq("category_id", oldPrimaryCat);
        if (demoteErr) throw demoteErr;
      }

      // Upsert primary
      {
        const { error: upErr } = await (
          supabase.from("laborer_skills" as any) as any
        ).upsert(
          {
            laborer_id: laborerId,
            category_id: primaryCategoryId,
            is_primary: true,
          },
          { onConflict: "laborer_id,category_id" }
        );
        if (upErr) throw upErr;
      }

      // Upsert each additional skill (is_primary=false)
      for (const cat of additionalCategoryIds) {
        if (cat === primaryCategoryId) continue;
        const { error: upErr } = await (
          supabase.from("laborer_skills" as any) as any
        ).upsert(
          {
            laborer_id: laborerId,
            category_id: cat,
            is_primary: false,
          },
          { onConflict: "laborer_id,category_id" }
        );
        if (upErr) throw upErr;
      }
    },
    [supabase]
  );

  /**
   * Sync laborer_specialties: insert rows for newly-selected specialties,
   * delete rows for de-selected ones. Mirrors syncLaborerSkills (no primary).
   */
  const syncLaborerSpecialties = useCallback(
    async (laborerId: string, specialtyIds: string[]) => {
      const desired = new Set(specialtyIds);
      const { data: existing, error: readErr } = await (
        supabase.from("laborer_specialties" as any) as any
      )
        .select("specialty_id")
        .eq("laborer_id", laborerId);
      if (readErr) throw readErr;
      const existingSet = new Set<string>(
        ((existing || []) as any[]).map((r) => r.specialty_id)
      );
      const toDelete = Array.from(existingSet).filter((id) => !desired.has(id));
      const toInsert = specialtyIds.filter((id) => !existingSet.has(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await (
          supabase.from("laborer_specialties" as any) as any
        )
          .delete()
          .eq("laborer_id", laborerId)
          .in("specialty_id", toDelete);
        if (delErr) throw delErr;
      }
      if (toInsert.length > 0) {
        const { error: insErr } = await (
          supabase.from("laborer_specialties" as any) as any
        ).insert(
          toInsert.map((specialty_id) => ({
            laborer_id: laborerId,
            specialty_id,
          }))
        );
        if (insErr) throw insErr;
      }
    },
    [supabase]
  );

  const handleSubmit = async () => {
    if (!formData.name || !formData.category_id || !formData.role_id) {
      setError("Please fill all required fields");
      return;
    }
    if (!selectedCompany?.id) {
      setError("No company selected");
      return;
    }
    try {
      setLoading(true);
      // Strip skills field — laborers table doesn't have it.
      const { additional_skill_ids, specialty_ids, ...laborerFields } = formData;
      const payload = {
        ...laborerFields,
        team_id: laborerFields.team_id || null,
        associated_team_id: laborerFields.associated_team_id || null,
        phone: laborerFields.phone || null,
        commission_per_day: laborerFields.commission_per_day
          ? Number(laborerFields.commission_per_day)
          : 0,
        alternate_phone: laborerFields.alternate_phone || null,
        age: laborerFields.age ? Number(laborerFields.age) : null,
        address: laborerFields.address || null,
        id_proof_type: laborerFields.id_proof_type || null,
        id_proof_number: laborerFields.id_proof_number || null,
        emergency_contact_name: laborerFields.emergency_contact_name || null,
        emergency_contact_phone: laborerFields.emergency_contact_phone || null,
        notes: laborerFields.notes || null,
        company_id: selectedCompany.id,
      };

      if (editingLaborer) {
        const newRate = Number(formData.daily_rate) || 0;
        const oldRate = Number(editingLaborer.daily_rate) || 0;
        const rateChanged = newRate !== oldRate;

        // Save non-rate fields first so they persist regardless of cascade choice.
        // The rate itself is owned by the cascade RPC when it changed.
        const { daily_rate: _dr, ...nonRatePayload } = payload as Record<
          string,
          unknown
        >;
        const updatePayload = rateChanged ? nonRatePayload : payload;

        const { error } = await (supabase.from("laborers") as any)
          .update(updatePayload)
          .eq("id", editingLaborer.id);
        if (error) throw error;

        // Sync skills + specialties regardless of rate change
        await syncLaborerSkills(
          editingLaborer.id,
          formData.category_id,
          additional_skill_ids
        );
        await syncLaborerSpecialties(editingLaborer.id, specialty_ids);

        if (rateChanged) {
          // Defer the rate change + history cascade to the confirmation dialog.
          setRateCascadeContext({
            laborerId: editingLaborer.id,
            laborerName: editingLaborer.name,
            oldRate,
            newRate,
          });
          // Keep the edit dialog open behind the cascade dialog so Cancel
          // returns the user to their edits.
          setLoading(false);
          return;
        }

        setSuccess("Laborer updated");
      } else {
        const { data: inserted, error } = await (supabase.from("laborers") as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (inserted?.id) {
          await syncLaborerSkills(
            inserted.id,
            formData.category_id,
            additional_skill_ids
          );
          await syncLaborerSpecialties(inserted.id, specialty_ids);
        }
        setSuccess("Laborer added");
      }
      setOpenDialog(false);
      await fetchLaborers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateClick = useCallback(
    (laborer: LaborerWithDetails) => {
      setDeactivatingLaborer(laborer);
    },
    []
  );

  const handleDeactivateConfirm = useCallback(async () => {
    if (!deactivatingLaborer) return;
    try {
      setDeactivateLoading(true);
      const { error } = await (supabase.from("laborers") as any)
        .update({
          status: "inactive",
          deactivation_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", deactivatingLaborer.id);
      if (error) throw error;
      setSuccess(`${deactivatingLaborer.name} has been deactivated`);
      setDeactivatingLaborer(null);
      await fetchLaborers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeactivateLoading(false);
    }
  }, [deactivatingLaborer, supabase, fetchLaborers]);

  const handleDeactivateCancel = useCallback(() => {
    if (!deactivateLoading) {
      setDeactivatingLaborer(null);
    }
  }, [deactivateLoading]);

  const canEdit = hasEditPermission(userProfile?.role);
  const filteredRoles = roles.filter(
    (r) => r.category_id === formData.category_id
  );

  // Mesthri the commission would go to (resolved from the selected team).
  const resolvedMesthriName = useMemo(() => {
    if (!formData.associated_team_id) return null;
    const t = teams.find((tm) => tm.id === formData.associated_team_id);
    return t?.leader_name || t?.name || null;
  }, [formData.associated_team_id, teams]);

  const columns = useMemo<MRT_ColumnDef<LaborerWithDetails>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        size: isMobile ? 130 : 200,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Avatar
              src={row.original.photo_url || undefined}
              sx={{
                width: isMobile ? 28 : 32,
                height: isMobile ? 28 : 32,
                fontSize: isMobile ? 12 : 14,
                bgcolor: "primary.light",
              }}
            >
              {row.original.name.charAt(0).toUpperCase()}
            </Avatar>
            <Typography
              variant="body2"
              fontWeight={500}
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.original.name}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        size: 110,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "category_name",
        header: isMobile ? "Cat" : "Category",
        size: isMobile ? 60 : 130,
        filterVariant: "select",
        filterSelectOptions: categories.map((c) => ({ value: c.name, label: c.name })),
      },
      {
        accessorKey: "role_name",
        header: "Role",
        size: isMobile ? 70 : 150,
        filterVariant: "select",
        filterSelectOptions: roles.map((r) => ({ value: r.name, label: r.name })),
      },
      {
        accessorKey: "laborer_type",
        header: isMobile ? "Type" : "Laborer Type",
        size: isMobile ? 50 : 140,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "daily_market", label: "Daily/Market" },
          { value: "contract", label: "Contract" },
        ],
        Cell: ({ cell }) => {
          const type = cell.getValue<string>() || "daily_market";
          return (
            <Chip
              label={
                isMobile
                  ? type === "contract"
                    ? "C"
                    : "D"
                  : type === "contract"
                    ? "CONTRACT"
                    : "DAILY"
              }
              size="small"
              color={type === "contract" ? "primary" : "warning"}
              variant={type === "contract" ? "filled" : "outlined"}
            />
          );
        },
      },
      {
        accessorKey: "language",
        header: isMobile ? "Lang" : "Language",
        size: isMobile ? 45 : 90,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "Tamil", label: "Tamil" },
          { value: "Hindi", label: "Hindi" },
        ],
        Cell: ({ cell }) => {
          const lang = cell.getValue<string>() || "Tamil";
          return (
            <Chip
              label={isMobile ? (lang === "Hindi" ? "H" : "T") : lang}
              size="small"
              color={lang === "Hindi" ? "info" : "success"}
              variant="outlined"
            />
          );
        },
      },
      {
        accessorKey: "employment_type",
        header: isMobile ? "Emp" : "Employment",
        size: isMobile ? 70 : 120,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "daily_wage", label: "Daily Wage" },
          { value: "contract", label: "Contract" },
          { value: "specialist", label: "Specialist" },
        ],
        Cell: ({ cell }) => (
          <Chip
            label={
              isMobile
                ? cell.getValue<string>().charAt(0).toUpperCase()
                : cell.getValue<string>().replace("_", " ").toUpperCase()
            }
            size="small"
          />
        ),
      },
      {
        accessorKey: "daily_rate",
        header: isMobile ? "Rate" : "Daily Rate",
        size: isMobile ? 60 : 110,
        Cell: ({ cell }) => (
          <Typography
            fontWeight={600}
            sx={{ fontSize: isMobile ? "0.7rem" : "inherit" }}
          >
            ₹{cell.getValue<number>()}
          </Typography>
        ),
      },
      {
        accessorKey: "associated_team_name",
        header: isMobile ? "Mesthri" : "Mesthri Team",
        size: isMobile ? 70 : 140,
        filterVariant: "select",
        filterSelectOptions: teams.map((t) => ({ value: t.name, label: t.name })),
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "team_name",
        header: isMobile ? "Team" : "Work Team",
        size: isMobile ? 70 : 130,
        filterVariant: "select",
        filterSelectOptions: teams.map((t) => ({ value: t.name, label: t.name })),
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "status",
        header: isMobile ? "St" : "Status",
        size: isMobile ? 45 : 100,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
        Cell: ({ cell }) => (
          <Chip
            label={
              isMobile
                ? cell.getValue<string>() === "active"
                  ? "A"
                  : "I"
                : cell.getValue<string>().toUpperCase()
            }
            size="small"
            color={cell.getValue<string>() === "active" ? "success" : "default"}
          />
        ),
      },
      {
        accessorKey: "joining_date",
        header: "Joined",
        size: 90,
        Cell: ({ cell }) => dayjs(cell.getValue<string>()).format("DD MMM YY"),
      },
      {
        id: "mrt-row-actions",
        header: "",
        size: isMobile ? 70 : 100,
        Cell: ({ row }) => (
          <Box
            sx={{ display: "flex", gap: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDialog(row.original);
              }}
              disabled={!canEdit}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            {row.original.status === "active" && (
              <IconButton
                size="small"
                color="warning"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeactivateClick(row.original);
                }}
                disabled={!canEdit}
              >
                <BlockIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ),
      },
    ],
    [canEdit, handleDeactivateClick, isMobile, categories, roles, teams]
  );

  return (
    <Box>
      <PageHeader
        title="Laborers"
        subtitle="Manage all company laborers"
        actions={
          !isMobile && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
              disabled={!canEdit}
              size="small"
            >
              Add Laborer
            </Button>
          )
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {/* Category tabs */}
      <Box
        sx={{
          mb: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Tabs
          value={activeTabId}
          onChange={(_e, value) => setActiveTabId(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab
            value="all"
            label={`All (${tabCounts.all})`}
            sx={{ textTransform: "none", fontWeight: 600 }}
          />
          {categories.map((c) => (
            <Tab
              key={c.id}
              value={c.id}
              label={`${c.name} (${tabCounts[c.id] ?? 0})`}
              sx={{ textTransform: "none", fontWeight: 600 }}
            />
          ))}
        </Tabs>
      </Box>

      {/* Secondary type chips */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 1.5, flexWrap: "wrap", gap: 0.75 }}
      >
        <Chip
          label={`Daily Market (${chipCounts.daily_market})`}
          size="small"
          color={typeFilters.daily_market ? "primary" : "default"}
          variant={typeFilters.daily_market ? "filled" : "outlined"}
          onClick={() =>
            setTypeFilters((f) => ({ ...f, daily_market: !f.daily_market }))
          }
        />
        <Chip
          label={`Contract (${chipCounts.contract})`}
          size="small"
          color={typeFilters.contract ? "primary" : "default"}
          variant={typeFilters.contract ? "filled" : "outlined"}
          onClick={() =>
            setTypeFilters((f) => ({ ...f, contract: !f.contract }))
          }
        />
        <Chip
          label={`Mesthris (${chipCounts.mesthris})`}
          size="small"
          color={typeFilters.mesthris ? "primary" : "default"}
          variant={typeFilters.mesthris ? "filled" : "outlined"}
          onClick={() =>
            setTypeFilters((f) => ({ ...f, mesthris: !f.mesthris }))
          }
        />
      </Stack>

      {/* Primary axes: status (default Active) + language split */}
      <Stack
        direction="row"
        sx={{
          mb: 1.5,
          flexWrap: "wrap",
          gap: { xs: 1.5, sm: 3 },
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            Status
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={statusFilter}
            onChange={(_e, v) => v && setStatusFilter(v)}
            aria-label="Filter by status"
          >
            <ToggleButton value="active" sx={{ textTransform: "none" }}>
              Active ({statusCounts.active})
            </ToggleButton>
            <ToggleButton value="inactive" sx={{ textTransform: "none" }}>
              Inactive ({statusCounts.inactive})
            </ToggleButton>
            <ToggleButton value="all" sx={{ textTransform: "none" }}>
              All ({statusCounts.all})
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            Language
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={languageFilter}
            onChange={(_e, v) => v && setLanguageFilter(v)}
            aria-label="Filter by language"
          >
            <ToggleButton value="all" sx={{ textTransform: "none" }}>
              All ({languageCounts.all})
            </ToggleButton>
            <ToggleButton
              value="Tamil"
              sx={{
                textTransform: "none",
                "&.Mui-selected": {
                  color: "success.main",
                  bgcolor: alpha(theme.palette.success.main, 0.12),
                  "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.2) },
                },
              }}
            >
              Tamil ({languageCounts.Tamil})
            </ToggleButton>
            <ToggleButton
              value="Hindi"
              sx={{
                textTransform: "none",
                "&.Mui-selected": {
                  color: "info.main",
                  bgcolor: alpha(theme.palette.info.main, 0.12),
                  "&:hover": { bgcolor: alpha(theme.palette.info.main, 0.2) },
                },
              }}
            >
              Hindi ({languageCounts.Hindi})
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Specialty filter — combine with Status=Inactive to build a recall list */}
        <Box sx={{ minWidth: 220, flex: "1 1 220px", maxWidth: 380 }}>
          <Autocomplete
            multiple
            size="small"
            options={specialties.filter((s) => s.is_active)}
            getOptionLabel={(o) => o.name}
            value={specialties.filter((s) => specialtyFilter.includes(s.id))}
            onChange={(_e, val) => setSpecialtyFilter(val.map((v) => v.id))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Filter by specialty"
                placeholder="Skill…"
              />
            )}
            slotProps={{ popper: { disablePortal: false } }}
          />
        </Box>

        <Button
          variant="outlined"
          size="small"
          startIcon={<PaymentsIcon />}
          onClick={() => setCommissionReportOpen(true)}
          sx={{ ml: { sm: "auto" }, textTransform: "none", whiteSpace: "nowrap" }}
        >
          Commissions
        </Button>
      </Stack>

      <DataTable
        columns={columns}
        data={filteredLaborers}
        isLoading={loading}
        pageSize={20}
        showRecordCount
        pinnedColumns={{
          left: ["name"],
          right: ["mrt-row-actions"],
        }}
        mobileHiddenColumns={["phone", "joining_date"]}
        muiTableBodyRowProps={({ row }) => ({
          onClick: () => setProfileLaborerId(row.original.id),
          sx: {
            cursor: "pointer",
            bgcolor:
              profileLaborerId === row.original.id
                ? alpha(theme.palette.primary.main, 0.08)
                : "inherit",
            "&:hover": {
              bgcolor: alpha(theme.palette.primary.main, 0.06),
            },
          },
        })}
      />

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {editingLaborer ? "Edit Laborer" : "Add Laborer"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            {/* Photo Uploader - Top of form */}
            <LaborerPhotoUploader
              currentPhotoUrl={formData.photo_url}
              laborerName={formData.name}
              laborerId={editingLaborer?.id}
              onPhotoChange={(url) =>
                setFormData({ ...formData, photo_url: url })
              }
              onError={(error) => setError(error)}
              disabled={!canEdit}
              supabase={supabase}
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Language</InputLabel>
                  <Select
                    value={formData.language}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        language: e.target.value as "Hindi" | "Tamil",
                      })
                    }
                    label="Language"
                  >
                    <MenuItem value="Tamil">Tamil</MenuItem>
                    <MenuItem value="Hindi">Hindi</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth required>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={formData.category_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        category_id: e.target.value,
                        role_id: "",
                      })
                    }
                    label="Category"
                  >
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl
                  fullWidth
                  required
                  disabled={!formData.category_id}
                >
                  <InputLabel>Role</InputLabel>
                  <Select
                    value={formData.role_id}
                    onChange={(e) => {
                      const role = roles.find((r) => r.id === e.target.value);
                      setFormData({
                        ...formData,
                        role_id: e.target.value,
                        daily_rate:
                          role?.default_daily_rate || formData.daily_rate,
                      });
                    }}
                    label="Role"
                  >
                    {filteredRoles.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.name} (₹{r.default_daily_rate})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                Additional skills (optional) — categories this laborer can also
                work in beyond their primary
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {categories
                  .filter((c) => c.id !== formData.category_id)
                  .map((c) => {
                    const selected = formData.additional_skill_ids.includes(
                      c.id
                    );
                    return (
                      <Chip
                        key={c.id}
                        label={c.name}
                        size="small"
                        color={selected ? "primary" : "default"}
                        variant={selected ? "filled" : "outlined"}
                        onClick={() =>
                          setFormData((f) => ({
                            ...f,
                            additional_skill_ids: selected
                              ? f.additional_skill_ids.filter(
                                  (id) => id !== c.id
                                )
                              : [...f.additional_skill_ids, c.id],
                          }))
                        }
                      />
                    );
                  })}
              </Box>
            </Box>

            {/* Specialties — fine-grained skills, used to recall by skill */}
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Specialties (good at) — used to find/recall laborers by skill
                </Typography>
                <Button
                  size="small"
                  startIcon={<TuneIcon />}
                  onClick={() => setManageSpecialtiesOpen(true)}
                  sx={{ textTransform: "none" }}
                >
                  Manage
                </Button>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {specialties
                  .filter(
                    (s) => s.is_active || formData.specialty_ids.includes(s.id)
                  )
                  .map((s) => {
                    const selected = formData.specialty_ids.includes(s.id);
                    return (
                      <Chip
                        key={s.id}
                        label={s.name}
                        size="small"
                        color={selected ? "secondary" : "default"}
                        variant={selected ? "filled" : "outlined"}
                        onClick={() =>
                          setFormData((f) => ({
                            ...f,
                            specialty_ids: selected
                              ? f.specialty_ids.filter((id) => id !== s.id)
                              : [...f.specialty_ids, s.id],
                          }))
                        }
                      />
                    );
                  })}
                {specialties.length === 0 && (
                  <Typography variant="caption" color="text.disabled">
                    No specialties yet — click Manage to add some.
                  </Typography>
                )}
              </Box>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth required>
                  <InputLabel>Laborer Type</InputLabel>
                  <Select
                    value={formData.laborer_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        laborer_type: e.target.value as LaborerType,
                        associated_team_id:
                          e.target.value === "daily_market"
                            ? ""
                            : formData.associated_team_id,
                      })
                    }
                    label="Laborer Type"
                  >
                    <MenuItem value="daily_market">
                      Daily Market (Hired separately - paid directly)
                    </MenuItem>
                    <MenuItem value="contract">
                      Contract (Mesthri&apos;s team - paid via Mesthri)
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl
                  fullWidth
                  disabled={formData.laborer_type !== "contract"}
                >
                  <InputLabel>
                    Mesthri&apos;s Team{" "}
                    {formData.laborer_type === "contract"
                      ? "(Required)"
                      : "(N/A)"}
                  </InputLabel>
                  <Select
                    value={formData.associated_team_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        associated_team_id: e.target.value,
                      })
                    }
                    label={`Mesthri's Team ${
                      formData.laborer_type === "contract"
                        ? "(Required)"
                        : "(N/A)"
                    }`}
                  >
                    <MenuItem value="">None</MenuItem>
                    {teams.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name} ({t.leader_name})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl fullWidth>
                  <InputLabel>Employment Type</InputLabel>
                  <Select
                    value={formData.employment_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        employment_type: e.target.value as any,
                      })
                    }
                    label="Employment Type"
                  >
                    <MenuItem value="daily_wage">Daily Wage</MenuItem>
                    <MenuItem value="contract">Contract</MenuItem>
                    <MenuItem value="specialist">Specialist</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  label="Daily Rate"
                  type="number"
                  value={formData.daily_rate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      daily_rate: Number(e.target.value),
                    })
                  }
                  slotProps={{ input: { startAdornment: "₹" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl fullWidth>
                  <InputLabel>Work Team (Optional)</InputLabel>
                  <Select
                    value={formData.team_id}
                    onChange={(e) =>
                      setFormData({ ...formData, team_id: e.target.value })
                    }
                    label="Work Team (Optional)"
                  >
                    <MenuItem value="">None</MenuItem>
                    {teams.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Joining Date"
                  type="date"
                  value={formData.joining_date}
                  onChange={(e) =>
                    setFormData({ ...formData, joining_date: e.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as any,
                      })
                    }
                    label="Status"
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Collapsible: extended profile fields (these appear in the
                laborer profile drawer's Personal details). */}
            <Box>
              <Button
                size="small"
                onClick={() => setShowMoreDetails((v) => !v)}
                sx={{ textTransform: "none", px: 0.5 }}
              >
                {showMoreDetails ? "▾" : "▸"} More details (optional)
              </Button>
              <Collapse in={showMoreDetails} unmountOnExit>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Mesthri commission (₹/day)"
                      type="number"
                      value={formData.commission_per_day}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          commission_per_day: e.target.value,
                        })
                      }
                      helperText={
                        resolvedMesthriName
                          ? `Est. cut to ${resolvedMesthriName}`
                          : "Applies only with a mesthri team set"
                      }
                      slotProps={{ input: { startAdornment: "₹" } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Alternate phone"
                      value={formData.alternate_phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          alternate_phone: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <TextField
                      fullWidth
                      label="Age"
                      type="number"
                      value={formData.age}
                      onChange={(e) =>
                        setFormData({ ...formData, age: e.target.value })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <FormControl fullWidth>
                      <InputLabel>ID proof type</InputLabel>
                      <Select
                        value={formData.id_proof_type}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            id_proof_type: e.target.value,
                          })
                        }
                        label="ID proof type"
                      >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="Aadhar">Aadhar</MenuItem>
                        <MenuItem value="PAN">PAN</MenuItem>
                        <MenuItem value="Voter ID">Voter ID</MenuItem>
                        <MenuItem value="Driving License">
                          Driving License
                        </MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="ID proof number"
                      value={formData.id_proof_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          id_proof_number: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Address"
                      multiline
                      minRows={2}
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Emergency contact name"
                      value={formData.emergency_contact_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_contact_name: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Emergency contact phone"
                      value={formData.emergency_contact_phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergency_contact_phone: e.target.value,
                        })
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Notes"
                      multiline
                      minRows={2}
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                    />
                  </Grid>
                </Grid>
              </Collapse>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            {editingLaborer ? "Update" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivation Confirmation Dialog */}
      <Dialog
        open={!!deactivatingLaborer}
        onClose={handleDeactivateCancel}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderTop: 4, borderColor: "warning.main" },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pb: 1,
          }}
        >
          <WarningIcon color="warning" />
          Deactivate Laborer
        </DialogTitle>

        <DialogContent>
          {deactivatingLaborer && (
            <>
              <Box
                sx={{
                  p: 2,
                  bgcolor: alpha(theme.palette.grey[500], 0.06),
                  borderRadius: 1,
                  mb: 2,
                  mt: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  <Avatar
                    src={deactivatingLaborer.photo_url || undefined}
                    sx={{ width: 48, height: 48, bgcolor: "primary.light" }}
                  >
                    {deactivatingLaborer.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {deactivatingLaborer.name}
                    </Typography>
                    {deactivatingLaborer.phone && (
                      <Typography variant="caption" color="text.secondary">
                        {deactivatingLaborer.phone}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Category
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {deactivatingLaborer.category_name}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Role
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {deactivatingLaborer.role_name}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Daily Rate
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ₹{deactivatingLaborer.daily_rate}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Type
                    </Typography>
                    <Box sx={{ mt: 0.25 }}>
                      <Chip
                        label={
                          deactivatingLaborer.laborer_type === "contract"
                            ? "Contract"
                            : "Daily Market"
                        }
                        size="small"
                        color={
                          deactivatingLaborer.laborer_type === "contract"
                            ? "primary"
                            : "warning"
                        }
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                  {deactivatingLaborer.associated_team_name && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Mesthri Team
                      </Typography>
                      <Typography variant="body2">
                        {deactivatingLaborer.associated_team_name}
                      </Typography>
                    </Box>
                  )}
                  {deactivatingLaborer.team_name && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Work Team
                      </Typography>
                      <Typography variant="body2">
                        {deactivatingLaborer.team_name}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              <Alert severity="warning" icon={<WarningIcon />}>
                This laborer will be marked as <strong>inactive</strong> and will
                no longer appear in attendance sheets or payment processing.
              </Alert>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDeactivateCancel} disabled={deactivateLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleDeactivateConfirm}
            disabled={deactivateLoading}
            startIcon={
              deactivateLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <BlockIcon />
              )
            }
          >
            {deactivateLoading ? "Deactivating..." : "Deactivate"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mobile FAB */}
      <Fab
        color="primary"
        onClick={() => handleOpenDialog()}
        disabled={!canEdit}
        sx={{
          display: canEdit ? { xs: "flex", sm: "none" } : "none",
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 1000,
        }}
      >
        <AddIcon />
      </Fab>

      <LaborerProfileDrawer
        open={Boolean(profileLaborerId)}
        laborer={profileLaborer}
        teams={teams}
        categories={categories}
        specialties={specialties}
        canEdit={canEdit}
        onClose={() => setProfileLaborerId(null)}
        onEdit={(l) => {
          setProfileLaborerId(null);
          handleOpenDialog(l);
        }}
        onDeactivate={(l) => {
          setProfileLaborerId(null);
          handleDeactivateClick(l);
        }}
      />

      {rateCascadeContext && (
        <RateCascadeDialog
          open
          laborerId={rateCascadeContext.laborerId}
          laborerName={rateCascadeContext.laborerName}
          oldRate={rateCascadeContext.oldRate}
          newRate={rateCascadeContext.newRate}
          onClose={() => setRateCascadeContext(null)}
          onApplied={async (result: LaborerRateCascadeResult) => {
            setRateCascadeContext(null);
            setOpenDialog(false);
            const delta = result.total_delta;
            const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
            const deltaStr =
              delta === 0
                ? "no net change"
                : `${sign}₹${Math.abs(delta).toLocaleString("en-IN")}`;
            setSuccess(
              `Rate updated · ${result.affected_attendance} attendance days, ${result.affected_settlements} settlements re-totalled · ${deltaStr}`
            );
            await fetchLaborers();
          }}
        />
      )}

      <MesthriCommissionReport
        open={commissionReportOpen}
        onClose={() => setCommissionReportOpen(false)}
      />

      <ManageSpecialtiesDialog
        open={manageSpecialtiesOpen}
        onClose={() => setManageSpecialtiesOpen(false)}
        specialties={specialties}
        supabase={supabase}
        onChanged={() =>
          queryClient.invalidateQueries({ queryKey: laborSpecialtyKeys.all })
        }
      />
    </Box>
  );
}
