"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  InputAdornment,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Checkbox,
  FormControlLabel,
  Slider,
  Popover,
  Radio,
  RadioGroup,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Store as StoreIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AccessTime as TimeIcon,
  Description as WorkIcon,
  ContentCopy as CopyIcon,
  LocalCafe as TeaIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  KeyboardArrowUp as CollapseIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { ensureFreshSession } from "@/lib/auth/sessionManager";
import { useAuth } from "@/contexts/AuthContext";
import dayjs from "dayjs";
import LaborerSelectionDialog from "./LaborerSelectionDialog";
import MarketLaborerDialog from "./MarketLaborerDialog";
import TeaShopEntryDialog from "../tea-shop/TeaShopEntryDialog";
import TeaShopEntryModeDialog from "../tea-shop/TeaShopEntryModeDialog";
import GroupTeaShopEntryDialog from "../tea-shop/GroupTeaShopEntryDialog";
import { useSiteGroup } from "@/hooks/queries/useSiteGroups";
import { useGroupTeaShopAccount } from "@/hooks/queries/useGroupTeaShop";
import type { SiteGroupWithSites } from "@/types/material.types";
import AttendanceSaveConfirmDialog from "./AttendanceSaveConfirmDialog";
import { WorkUpdatesSection } from "./work-updates";
import SectionAutocomplete from "../common/SectionAutocomplete";
import { useDrawerPersistence } from "@/hooks/useDrawerPersistence";
import type { WorkUpdates } from "@/types/work-updates.types";
import type { Database } from "@/types/database.types";

type TeaShopEntry = Database["public"]["Tables"]["tea_shop_entries"]["Row"];
type TeaShopAccountType = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];

type AttendanceMode = "morning" | "evening" | "full";

interface AttendanceDrawerProps {
  open: boolean;
  onClose: () => void;
  siteId: string; 
  date?: string;
  onSuccess?: () => void;
  mode?: AttendanceMode; // morning=check-in, evening=confirm, full=legacy
  siteGroupId?: string; // For group tea shop support
  siteName?: string; // Current site name for display
}

interface LaborerWithCategory {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  daily_rate: number;
  team_id: string | null;
  team_name: string | null;
  laborer_type: string;
}

// Extended to include time tracking
interface SelectedLaborer {
  laborerId: string;
  workDays: number;
  dailyRate: number;
  // Time tracking
  inTime: string;
  lunchOut: string;
  lunchIn: string;
  outTime: string;
  workHours: number;
  breakHours: number;
  totalHours: number;
  dayUnits: number;
  // Salary override
  salaryOverride: number | null;
  salaryOverrideReason: string;
}

// Extended to include time tracking and individual worker tracking
interface MarketLaborerEntry {
  id: string;
  roleId: string;
  roleName: string;
  count: number;
  workDays: number;
  ratePerPerson: number;
  // Worker index for multiple workers of same role (Mason #1, Mason #2, etc.)
  workerIndex: number;
  // Time tracking (per-worker)
  inTime: string;
  lunchOut: string;
  lunchIn: string;
  outTime: string;
  workHours: number;
  breakHours: number;
  totalHours: number;
  dayUnits: number;
  // Salary override
  salaryOverridePerPerson: number | null;
  salaryOverrideReason: string;
}

interface LaborRole {
  id: string;
  name: string;
  default_daily_rate: number;
  is_market_role: boolean;
}

// Work Unit Presets - User selects work unit FIRST, times auto-populate
interface WorkUnitPreset {
  value: number;
  label: string;
  shortLabel: string;
  inTime: string;
  outTime: string;
  lunchOut: string | null;
  lunchIn: string | null;
  minHours: number;
  maxHours: number;
  description: string;
}

const WORK_UNIT_PRESETS: WorkUnitPreset[] = [
  {
    value: 0.5,
    label: "Half Day",
    shortLabel: "0.5",
    inTime: "09:00",
    outTime: "13:00",
    lunchOut: null,
    lunchIn: null,
    minHours: 3,
    maxHours: 5,
    description: "Morning shift, no lunch break",
  },
  {
    value: 1,
    label: "Full Day",
    shortLabel: "1.0",
    inTime: "09:00",
    outTime: "18:00",
    lunchOut: "13:00",
    lunchIn: "14:00",
    minHours: 7,
    maxHours: 9,
    description: "Standard 9 AM - 6 PM with lunch",
  },
  {
    value: 1.5,
    label: "Extended",
    shortLabel: "1.5",
    inTime: "09:00",
    outTime: "19:00",
    lunchOut: "13:00",
    lunchIn: "14:00",
    minHours: 9,
    maxHours: 11,
    description: "9 AM - 7 PM with lunch",
  },
  {
    value: 2,
    label: "Double",
    shortLabel: "2.0",
    inTime: "06:00",
    outTime: "19:30",
    lunchOut: "13:00",
    lunchIn: "14:00",
    minHours: 12,
    maxHours: 16,
    description: "Full day + overtime",
  },
  {
    value: 2.5,
    label: "Extra",
    shortLabel: "2.5",
    inTime: "06:00",
    outTime: "23:00",
    lunchOut: "13:00",
    lunchIn: "14:00",
    minHours: 16,
    maxHours: 18,
    description: "6 AM - 11 PM extended shift",
  },
];

// 1.5 Day Time Variants - user can choose between different time schedules
interface TimeVariant {
  id: string;
  label: string;
  shortLabel: string;
  inTime: string;
  outTime: string;
  lunchOut: string;
  lunchIn: string;
}

const EXTENDED_TIME_VARIANTS: TimeVariant[] = [
  {
    id: "9to7",
    label: "9 AM - 7 PM",
    shortLabel: "9-7",
    inTime: "09:00",
    outTime: "19:00",
    lunchOut: "13:00",
    lunchIn: "14:00",
  },
  {
    id: "6to6",
    label: "6 AM - 6 PM",
    shortLabel: "6-6",
    inTime: "06:00",
    outTime: "18:00",
    lunchOut: "13:00",
    lunchIn: "14:00",
  },
];

// Get preset by value
const getPresetByValue = (value: number): WorkUnitPreset => {
  return (
    WORK_UNIT_PRESETS.find((p) => p.value === value) || WORK_UNIT_PRESETS[1]
  );
};

// Hour Alignment Status
type AlignmentStatus = "aligned" | "underwork" | "overwork" | "no-times";

const getAlignmentStatus = (
  workHours: number,
  preset: WorkUnitPreset,
  hasTimeEntries: boolean
): AlignmentStatus => {
  if (!hasTimeEntries || workHours === 0) return "no-times";
  if (workHours >= preset.minHours && workHours <= preset.maxHours)
    return "aligned";
  if (workHours < preset.minHours) return "underwork";
  return "overwork";
};

// Helper function to calculate hours from time strings
// NOTE: dayUnits is NO LONGER auto-calculated - it comes from user selection
function calculateTimeHours(
  inTime: string,
  outTime: string,
  lunchOut: string,
  lunchIn: string
): { workHours: number; breakHours: number; totalHours: number } {
  if (!inTime || !outTime) {
    return { workHours: 0, breakHours: 0, totalHours: 0 };
  }

  const parseTime = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const inMinutes = parseTime(inTime);
  const outMinutes = parseTime(outTime);
  let totalMinutes = outMinutes - inMinutes;

  // Handle overnight work
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  let breakMinutes = 0;
  if (lunchOut && lunchIn) {
    const lunchOutMinutes = parseTime(lunchOut);
    const lunchInMinutes = parseTime(lunchIn);
    breakMinutes = lunchInMinutes - lunchOutMinutes;
    if (breakMinutes < 0) breakMinutes = 0;
  }

  const workMinutes = totalMinutes - breakMinutes;
  const workHours = Math.round((workMinutes / 60) * 100) / 100;
  const breakHours = Math.round((breakMinutes / 60) * 100) / 100;
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

  return { workHours, breakHours, totalHours };
}

export default function AttendanceDrawer({
  open,
  onClose,
  siteId,
  date: initialDate,
  onSuccess,
  mode = "full",
  siteGroupId,
  siteName = "Current Site",
}: AttendanceDrawerProps) {
  const { userProfile } = useAuth();
  const supabase = createClient();

  // Group tea shop support
  const { data: siteGroup } = useSiteGroup(siteGroupId);
  const { data: groupTeaShop } = useGroupTeaShopAccount(siteGroupId);

  // Refs for preventing race conditions
  const fetchVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Form state
  const [selectedDate, setSelectedDate] = useState(
    initialDate || dayjs().format("YYYY-MM-DD")
  );
  const [sectionId, setSectionId] = useState<string>("");
  const [sectionName, setSectionName] = useState<string>("");
  const [selectedLaborers, setSelectedLaborers] = useState<
    Map<string, SelectedLaborer>
  >(new Map());
  const [marketLaborers, setMarketLaborers] = useState<MarketLaborerEntry[]>(
    []
  );

  // Default time tracking values (apply to all) - Updated to user preferences
  const [defaultInTime, setDefaultInTime] = useState("09:00");
  const [defaultLunchOut, setDefaultLunchOut] = useState("13:00");
  const [defaultLunchIn, setDefaultLunchIn] = useState("14:00");
  const [defaultOutTime, setDefaultOutTime] = useState("18:00");

  // Default work unit for bulk assignment
  const [defaultWorkUnit, setDefaultWorkUnit] = useState<number>(1);

  // Work description fields (per day) - legacy fields kept for backward compatibility
  const [workDescription, setWorkDescription] = useState("");
  const [workStatus, setWorkStatus] = useState("");
  const [comments, setComments] = useState("");

  // New work updates with photo documentation
  const [workUpdates, setWorkUpdates] = useState<WorkUpdates | null>(null);

  // Data state
  const [laborers, setLaborers] = useState<LaborerWithCategory[]>([]);
  const [laborRoles, setLaborRoles] = useState<LaborRole[]>([]);
  const [laborerDialogOpen, setLaborerDialogOpen] = useState(false);
  const [marketLaborerDialogOpen, setMarketLaborerDialogOpen] = useState(false);
  const [showMarketPrompt, setShowMarketPrompt] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | false>(
    "work"
  );

  // New Phase 2 state: Per-laborer expanded time fields
  const [expandedLaborerTimes, setExpandedLaborerTimes] = useState<Set<string>>(
    new Set()
  );
  const [showGlobalCustomTimes, setShowGlobalCustomTimes] = useState(false);

  // 1.5 day time variant selection state
  const [extendedTimeAnchorEl, setExtendedTimeAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedExtendedVariant, setSelectedExtendedVariant] = useState<string>("9to7");
  const [pendingLaborerId, setPendingLaborerId] = useState<string | null>(null);

  // Tea Shop state - dialog-based approach
  const [teaShops, setTeaShops] = useState<TeaShopAccountType[]>([]);
  const [selectedTeaShop, setSelectedTeaShop] =
    useState<TeaShopAccountType | null>(null);
  const [existingTeaEntry, setExistingTeaEntry] = useState<TeaShopEntry | null>(
    null
  );
  const [teaShopDialogOpen, setTeaShopDialogOpen] = useState(false);
  const [teaShopEntryModeDialogOpen, setTeaShopEntryModeDialogOpen] = useState(false);
  const [groupTeaShopDialogOpen, setGroupTeaShopDialogOpen] = useState(false);

  // Audit tracking - store original creator info when editing
  const [originalCreator, setOriginalCreator] = useState<{
    entered_by?: string | null;
    entered_by_user_id?: string | null;
  } | null>(null);

  // Save confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [hasExistingAttendance, setHasExistingAttendance] = useState(false);

  // Two-phase attendance state
  const [workProgressPercent, setWorkProgressPercent] = useState(100);
  const [existingAttendanceStatus, setExistingAttendanceStatus] = useState<
    "morning_entry" | "confirmed" | null
  >(null);
  // Evening mode: plan followed toggle (true = as planned, false = modified)
  const [planFollowed, setPlanFollowed] = useState(true);

  // Calculate tea shop total from existing entry
  const teaShopTotal = existingTeaEntry?.total_amount || 0;

  // Calculate if form has unsaved changes (for persistence warning)
  const isDirty = useMemo((): boolean => {
    // Check if there's any meaningful data entered
    const hasLaborers = selectedLaborers.size > 0 || marketLaborers.length > 0;
    const hasWorkUpdates = workUpdates !== null && Boolean(
      (workUpdates.morning?.description || workUpdates.morning?.photos.length) ||
      (workUpdates.evening?.summary || workUpdates.evening?.photos.length)
    );
    const hasDescription = workDescription.trim().length > 0;
    return hasLaborers || hasWorkUpdates || hasDescription;
  }, [selectedLaborers, marketLaborers, workUpdates, workDescription]);

  // Persist drawer state for recovery after page refresh
  const { clearState: clearPersistedState } = useDrawerPersistence(
    open,
    mode,
    selectedDate,
    siteId,
    workUpdates,
    isDirty
  );

  // Sync selectedDate with initialDate when it changes
  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Fetch data on open and load existing attendance if date provided
  // Uses version tracking to prevent race conditions when drawer opens/closes rapidly
  // or when date changes quickly
  useEffect(() => {
    if (open && siteId) {
      // Increment version to invalidate any in-flight requests
      const currentVersion = ++fetchVersionRef.current;

      const loadAll = async () => {
        setLoading(true);
        setError(null);

        try {
          await fetchData();

          // Check if this request is still valid (drawer not closed, version not stale)
          if (!isMountedRef.current || currentVersion !== fetchVersionRef.current) {
            return; // Abort if stale
          }

          // Only load existing attendance after fetchData completes (needs teaShops)
          if (initialDate) {
            await loadExistingAttendanceForDate(initialDate);
          }

          // Final check before updating state
          if (!isMountedRef.current || currentVersion !== fetchVersionRef.current) {
            return; // Abort if stale
          }
        } catch (err: any) {
          // Only set error if this request is still valid
          if (isMountedRef.current && currentVersion === fetchVersionRef.current) {
            console.error("Error loading attendance data:", err);
            setError(err.message || "Failed to load data");
          }
        } finally {
          // Only update loading state if this request is still valid
          if (isMountedRef.current && currentVersion === fetchVersionRef.current) {
            setLoading(false);
          }
        }
      };

      loadAll();

      // Cleanup function - increment version to invalidate request if drawer closes
      return () => {
        fetchVersionRef.current++;
      };
    }
  }, [open, siteId, initialDate]);

  // Reset form when drawer closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setSelectedLaborers(new Map());
    setMarketLaborers([]);
    setDefaultInTime("09:00");
    setDefaultLunchOut("13:00");
    setDefaultLunchIn("14:00");
    setDefaultOutTime("18:00");
    setDefaultWorkUnit(1);
    setWorkDescription("");
    setWorkStatus("");
    setComments("");
    setWorkUpdates(null); // Reset work updates to prevent data persistence
    setError(null);
    setSuccess(null);
    // Reset tea shop state
    setExistingTeaEntry(null);
    setTeaShopDialogOpen(false);
    // Reset Phase 2 state
    setExpandedLaborerTimes(new Set());
    setShowGlobalCustomTimes(false);
    // Reset audit tracking
    setOriginalCreator(null);
    // Reset confirmation dialog state
    setConfirmDialogOpen(false);
    setHasExistingAttendance(false);
    // Reset two-phase state
    setWorkProgressPercent(100);
    setExistingAttendanceStatus(null);
    setPlanFollowed(true);
  };

  const fetchData = async () => {
    try {
      // Fetch laborers with category info
      const { data: laborersData, error: laborersError } = await supabase
        .from("laborers")
        .select(
          `
          id, name, category_id, daily_rate, team_id, laborer_type,
          labor_categories(name),
          team:teams!laborers_team_id_fkey(name)
        `
        )
        .eq("status", "active")
        .order("name");

      if (laborersError) throw laborersError;

      const mappedLaborers: LaborerWithCategory[] = (laborersData || []).map(
        (l: any) => ({
          id: l.id,
          name: l.name,
          category_id: l.category_id,
          category_name: l.labor_categories?.name || "Unknown",
          daily_rate: l.daily_rate,
          team_id: l.team_id,
          team_name: l.team?.name || null,
          laborer_type: l.laborer_type || "daily_market",
        })
      );
      setLaborers(mappedLaborers);

      // Note: Section selection is now handled by SectionAutocomplete component
      // which auto-selects the site's default section

      // Fetch labor roles for market laborers (only roles marked as market roles)
      const { data: rolesData, error: rolesError } = await supabase
        .from("labor_roles")
        .select("id, name, default_daily_rate, is_market_role")
        .eq("is_market_role", true)
        .order("name");

      if (rolesError) throw rolesError;
      setLaborRoles((rolesData || []) as LaborRole[]);

      // Fetch tea shops for this site
      const { data: teaShopsData } = await (
        supabase.from("tea_shop_accounts") as any
      )
        .select("*")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("shop_name");

      const shops = (teaShopsData || []) as TeaShopAccountType[];
      setTeaShops(shops);
      if (shops.length > 0 && !selectedTeaShop) {
        setSelectedTeaShop(shops[0]);
      }
    } catch (err: any) {
      console.error("Error fetching data:", err);
      // Let the caller handle the error via the catch block in useEffect
      throw err;
    }
  };

  const loadExistingAttendanceForDate = async (dateToLoad: string) => {
    try {

      // Load existing daily attendance for this date (including audit fields and two-phase status)
      const { data: attendanceData, error: attendanceError } = await supabase
        .from("daily_attendance")
        .select(
          "laborer_id, work_days, daily_rate_applied, section_id, in_time, lunch_out, lunch_in, out_time, work_hours, break_hours, total_hours, day_units, entered_by, recorded_by_user_id, attendance_status, work_progress_percent, salary_override, salary_override_reason"
        )
        .eq("site_id", siteId)
        .eq("date", dateToLoad);

      if (attendanceError) throw attendanceError;

      // Store original creator info and attendance status for audit tracking (from first record)
      if (attendanceData && attendanceData.length > 0) {
        const firstRecord = attendanceData[0] as any;
        setOriginalCreator({
          entered_by: firstRecord.entered_by,
          entered_by_user_id: firstRecord.recorded_by_user_id,
        });
        setHasExistingAttendance(true);
        // Load two-phase status
        setExistingAttendanceStatus(firstRecord.attendance_status || "confirmed");
        setWorkProgressPercent(firstRecord.work_progress_percent ?? 100);
      } else {
        setHasExistingAttendance(false);
        setExistingAttendanceStatus(null);
      }

      // Populate selected laborers from existing attendance
      const existingSelected = new Map<string, SelectedLaborer>();
      let loadedSectionId: string | null = null;

      (attendanceData || []).forEach((record: any) => {
        existingSelected.set(record.laborer_id, {
          laborerId: record.laborer_id,
          workDays: record.work_days,
          dailyRate: record.daily_rate_applied,
          inTime: record.in_time || "08:00",
          lunchOut: record.lunch_out || "12:30",
          lunchIn: record.lunch_in || "13:30",
          outTime: record.out_time || "18:00",
          workHours: record.work_hours || 0,
          breakHours: record.break_hours || 0,
          totalHours: record.total_hours || 0,
          dayUnits: record.day_units || 1,
          salaryOverride: record.salary_override ?? null,
          salaryOverrideReason: record.salary_override_reason || "",
        });
        if (!loadedSectionId && record.section_id) {
          loadedSectionId = record.section_id;
        }
      });
      setSelectedLaborers(existingSelected);

      if (loadedSectionId) {
        setSectionId(loadedSectionId);
      }

      // Load existing market laborers for this date
      const { data: marketData, error: marketError } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .select(
          "id, role_id, worker_index, count, work_days, rate_per_person, in_time, lunch_out, lunch_in, out_time, work_hours, break_hours, total_hours, day_units, salary_override_per_person, salary_override_reason, labor_roles(name)"
        )
        .eq("site_id", siteId)
        .eq("date", dateToLoad)
        .order("worker_index", { ascending: true });

      let marketCount = 0;
      if (!marketError && marketData) {
        const existingMarket: MarketLaborerEntry[] = marketData.map(
          (m: any) => ({
            id: m.id,
            roleId: m.role_id,
            roleName: m.labor_roles?.name || "Unknown",
            workerIndex: m.worker_index || 1,
            count: m.count || 1,
            workDays: m.work_days || 1,
            ratePerPerson: m.rate_per_person,
            inTime: m.in_time || "08:00",
            lunchOut: m.lunch_out || "12:30",
            lunchIn: m.lunch_in || "13:30",
            outTime: m.out_time || "18:00",
            workHours: m.work_hours || 0,
            breakHours: m.break_hours || 0,
            totalHours: m.total_hours || 0,
            dayUnits: m.day_units || 1,
            salaryOverridePerPerson: m.salary_override_per_person ?? null,
            salaryOverrideReason: m.salary_override_reason || "",
          })
        );
        setMarketLaborers(existingMarket);
        marketCount = existingMarket.length; // Each entry is 1 worker now
      } else {
        setMarketLaborers([]);
      }

      // Load work summary for this date
      const { data: summaryData } = await (
        supabase.from("daily_work_summary") as any
      )
        .select("work_description, work_status, comments, work_updates")
        .eq("site_id", siteId)
        .eq("date", dateToLoad)
        .single();

      if (summaryData) {
        setWorkDescription(summaryData.work_description || "");
        setWorkStatus(summaryData.work_status || "");
        setComments(summaryData.comments || "");
        // Load new work updates if available
        if (summaryData.work_updates) {
          setWorkUpdates(summaryData.work_updates as WorkUpdates);
        } else {
          setWorkUpdates(null);
        }
      }

      // Load existing tea shop entry for this date
      if (teaShops.length > 0) {
        const shopToUse = selectedTeaShop || teaShops[0];
        const { data: teaEntryData } = await (
          supabase.from("tea_shop_entries") as any
        )
          .select("*")
          .eq("tea_shop_id", shopToUse.id)
          .eq("date", dateToLoad)
          .maybeSingle();

        if (teaEntryData) {
          setExistingTeaEntry(teaEntryData as TeaShopEntry);
        } else {
          setExistingTeaEntry(null);
        }
      }

      const namedCount = existingSelected.size;
      if (namedCount > 0 || marketCount > 0) {
        setSuccess(
          `Loaded ${namedCount} named laborer${
            namedCount !== 1 ? "s" : ""
          } and ${marketCount} market laborer${marketCount !== 1 ? "s" : ""}`
        );
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error("Error loading existing attendance:", err);
      // Let the caller handle the error via the catch block in useEffect
      throw err;
    }
  };

  // Apply default times to all laborers (preserves existing dayUnits)
  const applyDefaultTimesToAll = useCallback(() => {
    const timeCalc = calculateTimeHours(
      defaultInTime,
      defaultOutTime,
      defaultLunchOut,
      defaultLunchIn
    );

    setSelectedLaborers((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((laborer, key) => {
        newMap.set(key, {
          ...laborer,
          inTime: defaultInTime,
          lunchOut: defaultLunchOut,
          lunchIn: defaultLunchIn,
          outTime: defaultOutTime,
          ...timeCalc,
          // Preserve existing dayUnits - user's selection takes precedence
        });
      });
      return newMap;
    });

    setMarketLaborers((prev) =>
      prev.map((m) => ({
        ...m,
        inTime: defaultInTime,
        lunchOut: defaultLunchOut,
        lunchIn: defaultLunchIn,
        outTime: defaultOutTime,
        ...timeCalc,
        // Preserve existing dayUnits
      }))
    );
  }, [defaultInTime, defaultOutTime, defaultLunchOut, defaultLunchIn]);

  // Apply default work unit to all laborers (also sets corresponding times)
  const applyDefaultWorkUnitToAll = useCallback(() => {
    const preset = getPresetByValue(defaultWorkUnit);
    const inTime = preset.inTime;
    const outTime = preset.outTime;
    const lunchOut = preset.lunchOut || "";
    const lunchIn = preset.lunchIn || "";
    const timeCalc = calculateTimeHours(inTime, outTime, lunchOut, lunchIn);

    setSelectedLaborers((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((laborer, key) => {
        newMap.set(key, {
          ...laborer,
          dayUnits: defaultWorkUnit,
          inTime,
          lunchOut,
          lunchIn,
          outTime,
          ...timeCalc,
        });
      });
      return newMap;
    });

    setMarketLaborers((prev) =>
      prev.map((m) => ({
        ...m,
        dayUnits: defaultWorkUnit,
        inTime,
        lunchOut,
        lunchIn,
        outTime,
        ...timeCalc,
      }))
    );
  }, [defaultWorkUnit]);

  // Calculate summary
  const summary = useMemo(() => {
    let namedCount = 0;
    let namedSalary = 0;
    let marketCount = 0;
    let marketSalary = 0;
    let dailyCount = 0;
    let contractCount = 0;

    selectedLaborers.forEach((s) => {
      namedCount++;
      const laborer = laborers.find((l) => l.id === s.laborerId);
      // Use salary override if present, otherwise calculated
      const salary = s.salaryOverride ?? (s.dayUnits * s.dailyRate);
      namedSalary += salary;

      if (laborer?.laborer_type === "contract") {
        contractCount++;
      } else {
        dailyCount++;
      }
    });

    marketLaborers.forEach((m) => {
      marketCount += m.count;
      // Use salary override per person if present
      const ratePerPerson = m.salaryOverridePerPerson ?? m.ratePerPerson;
      marketSalary += m.count * ratePerPerson * m.dayUnits;
    });

    const totalSalary = namedSalary + marketSalary;
    const totalExpense = totalSalary;

    return {
      namedCount,
      namedSalary,
      marketCount,
      marketSalary,
      dailyCount,
      contractCount,
      totalCount: namedCount + marketCount,
      totalSalary,
      totalExpense,
    };
  }, [selectedLaborers, marketLaborers, laborers]);

  const handleLaborerToggle = (laborer: LaborerWithCategory) => {
    const timeCalc = calculateTimeHours(
      defaultInTime,
      defaultOutTime,
      defaultLunchOut,
      defaultLunchIn
    );

    setSelectedLaborers((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(laborer.id)) {
        newMap.delete(laborer.id);
      } else {
        newMap.set(laborer.id, {
          laborerId: laborer.id,
          workDays: 1,
          dailyRate: laborer.daily_rate,
          inTime: defaultInTime,
          lunchOut: defaultLunchOut,
          lunchIn: defaultLunchIn,
          outTime: defaultOutTime,
          ...timeCalc,
          dayUnits: 1, // Default to Full Day
          salaryOverride: null,
          salaryOverrideReason: "",
        });
      }
      return newMap;
    });
  };

  const handleAddMarketLaborer = () => {
    if (laborRoles.length === 0) return;

    // Prefer unused role, but allow adding same role again (will get next worker index)
    const unusedRole = laborRoles.find(
      (role) => !marketLaborers.some((m) => m.roleId === role.id)
    );
    const role = unusedRole || laborRoles[0];

    // Calculate next worker index for this role
    const existingForRole = marketLaborers.filter((m) => m.roleId === role.id);
    const nextWorkerIndex = existingForRole.length > 0
      ? Math.max(...existingForRole.map((m) => m.workerIndex || 1)) + 1
      : 1;

    const timeCalc = calculateTimeHours(
      defaultInTime,
      defaultOutTime,
      defaultLunchOut,
      defaultLunchIn
    );

    setMarketLaborers((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        roleId: role.id,
        roleName: role.name,
        count: 1, // Each entry is 1 worker
        workerIndex: nextWorkerIndex,
        workDays: 1,
        ratePerPerson: role.default_daily_rate,
        inTime: defaultInTime,
        lunchOut: defaultLunchOut,
        lunchIn: defaultLunchIn,
        outTime: defaultOutTime,
        ...timeCalc,
        dayUnits: 1, // Default to Full Day
        salaryOverridePerPerson: null,
        salaryOverrideReason: "",
      },
    ]);
  };

  const handleRemoveMarketLaborer = (id: string) => {
    setMarketLaborers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleMarketLaborerChange = (
    id: string,
    field: string,
    value: string | number
  ) => {
    setMarketLaborers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;

        let updated = { ...m };

        if (field === "roleId") {
          const role = laborRoles.find((r) => r.id === value);
          updated = {
            ...updated,
            roleId: value as string,
            roleName: role?.name || "Unknown",
            ratePerPerson: role?.default_daily_rate || 500,
          };
        } else if (field === "count") {
          const count = Math.max(1, value as number);
          updated = {
            ...updated,
            count,
          };
        } else if (field === "dayUnits") {
          // When work unit changes, auto-populate times from preset
          const newDayUnits = value as number;
          const preset = getPresetByValue(newDayUnits);
          const inTime = preset.inTime;
          const outTime = preset.outTime;
          const lunchOut = preset.lunchOut || "";
          const lunchIn = preset.lunchIn || "";
          const timeCalc = calculateTimeHours(
            inTime,
            outTime,
            lunchOut,
            lunchIn
          );
          updated = {
            ...updated,
            dayUnits: newDayUnits,
            inTime,
            outTime,
            lunchOut,
            lunchIn,
            ...timeCalc,
          };
        } else if (
          ["inTime", "lunchOut", "lunchIn", "outTime"].includes(field)
        ) {
          // When times change, recalculate hours but preserve dayUnits
          updated = { ...updated, [field]: value };
          const timeCalc = calculateTimeHours(
            field === "inTime" ? (value as string) : updated.inTime,
            field === "outTime" ? (value as string) : updated.outTime,
            field === "lunchOut" ? (value as string) : updated.lunchOut,
            field === "lunchIn" ? (value as string) : updated.lunchIn
          );
          updated = { ...updated, ...timeCalc }; // dayUnits NOT overwritten
        } else {
          updated = { ...updated, [field]: value };
        }

        return updated;
      })
    );
  };

  const handleLaborerFieldChange = (
    laborerId: string,
    field: string,
    value: string | number | null
  ) => {
    setSelectedLaborers((prev) => {
      const newMap = new Map(prev);
      const laborer = newMap.get(laborerId);
      if (!laborer) return prev;

      let updated = { ...laborer };

      if (field === "dayUnits") {
        // When work unit changes, auto-populate times from preset
        // Also clear salary override since calculation base changed
        const newDayUnits = value as number;
        const preset = getPresetByValue(newDayUnits);
        const inTime = preset.inTime;
        const outTime = preset.outTime;
        const lunchOut = preset.lunchOut || "";
        const lunchIn = preset.lunchIn || "";
        const timeCalc = calculateTimeHours(inTime, outTime, lunchOut, lunchIn);
        updated = {
          ...updated,
          dayUnits: newDayUnits,
          inTime,
          outTime,
          lunchOut,
          lunchIn,
          ...timeCalc,
          salaryOverride: null,
          salaryOverrideReason: "",
        };
      } else if (["inTime", "lunchOut", "lunchIn", "outTime"].includes(field)) {
        // When times change, recalculate hours but preserve dayUnits
        updated = { ...updated, [field]: value };
        const timeCalc = calculateTimeHours(
          field === "inTime" ? (value as string) : updated.inTime,
          field === "outTime" ? (value as string) : updated.outTime,
          field === "lunchOut" ? (value as string) : updated.lunchOut,
          field === "lunchIn" ? (value as string) : updated.lunchIn
        );
        updated = { ...updated, ...timeCalc }; // dayUnits NOT overwritten
      } else if (field === "salaryOverride") {
        // Handle salary override - can be null to clear
        updated = { ...updated, salaryOverride: value as number | null };
      } else if (field === "salaryOverrideReason") {
        updated = { ...updated, salaryOverrideReason: value as string };
      } else {
        updated = { ...updated, [field]: value };
      }

      newMap.set(laborerId, updated);
      return newMap;
    });
  };

  // Handler to show time variant popover for 1.5 day
  const handleExtendedTimeClick = (
    event: React.MouseEvent<HTMLElement>,
    laborerId: string
  ) => {
    setExtendedTimeAnchorEl(event.currentTarget);
    setPendingLaborerId(laborerId);
  };

  // Handler to apply selected time variant for 1.5 day
  const handleExtendedVariantSelect = (variantId: string) => {
    if (!pendingLaborerId) return;

    const variant = EXTENDED_TIME_VARIANTS.find((v) => v.id === variantId);
    if (!variant) return;

    setSelectedLaborers((prev) => {
      const newMap = new Map(prev);
      const laborer = newMap.get(pendingLaborerId);
      if (!laborer) return prev;

      const timeCalc = calculateTimeHours(
        variant.inTime,
        variant.outTime,
        variant.lunchOut,
        variant.lunchIn
      );

      const updated = {
        ...laborer,
        dayUnits: 1.5,
        inTime: variant.inTime,
        outTime: variant.outTime,
        lunchOut: variant.lunchOut,
        lunchIn: variant.lunchIn,
        ...timeCalc,
      };

      newMap.set(pendingLaborerId, updated);
      return newMap;
    });

    setSelectedExtendedVariant(variantId);
    setExtendedTimeAnchorEl(null);
    setPendingLaborerId(null);
  };

  // Close the extended time popover
  const handleExtendedTimeClose = () => {
    setExtendedTimeAnchorEl(null);
    setPendingLaborerId(null);
  };

  // Tea Shop dialog handler
  const handleTeaShopDialogSuccess = async () => {
    setTeaShopDialogOpen(false);
    // Refresh tea shop entry
    if (selectedTeaShop && selectedDate) {
      const { data: teaEntryData } = await (
        supabase.from("tea_shop_entries") as any
      )
        .select("*")
        .eq("tea_shop_id", selectedTeaShop.id)
        .eq("date", selectedDate)
        .single();

      if (teaEntryData) {
        setExistingTeaEntry(teaEntryData as TeaShopEntry);
      }
    }
  };

  // Check for existing attendance and show confirmation dialog
  const handleSaveClick = async () => {
    console.log("[AttendanceDrawer] handleSaveClick called");

    if (selectedLaborers.size === 0 && marketLaborers.length === 0) {
      setError("Please select at least one laborer or add market laborers");
      return;
    }

    if (!sectionId) {
      setError("Please select a section");
      return;
    }

    // Prevent future attendance
    const today = new Date().toISOString().split('T')[0];
    if (selectedDate > today) {
      setError("Cannot add attendance for future dates");
      return;
    }

    try {
      // Check if a holiday exists for this date
      const { data: existingHoliday, error: holidayError } = await supabase
        .from("site_holidays")
        .select("date, reason")
        .eq("site_id", siteId)
        .eq("date", selectedDate)
        .maybeSingle();

      if (holidayError) {
        console.error("[AttendanceDrawer] Error checking holidays:", holidayError);
        setError("Failed to check for holidays. Please try again.");
        return;
      }

      if (existingHoliday) {
        setError(`Cannot record attendance - ${selectedDate} is marked as a holiday (${existingHoliday.reason || 'No reason specified'})`);
        return;
      }

      // For new dates, check if attendance already exists
      if (!initialDate) {
        const { data: existingData, error: existingError } = await supabase
          .from("daily_attendance")
          .select("id")
          .eq("site_id", siteId)
          .eq("date", selectedDate)
          .limit(1);

        if (existingError) {
          console.error("[AttendanceDrawer] Error checking existing attendance:", existingError);
          setError("Failed to check for existing attendance. Please try again.");
          return;
        }

        setHasExistingAttendance(!!(existingData && existingData.length > 0));
      }

      // Show confirmation dialog
      setConfirmDialogOpen(true);
    } catch (err) {
      console.error("[AttendanceDrawer] Unexpected error in handleSaveClick:", err);
      setError("An unexpected error occurred. Please try again.");
    }
  };

  // Execute the actual save after confirmation
  const executeSave = async (statusOverride?: "draft") => {
    console.log("[AttendanceDrawer] executeSave called, statusOverride:", statusOverride);

    if (statusOverride === "draft") {
      setSavingDraft(true);
    } else {
      setSaving(true);
    }
    setError(null);
    setSuccess(null);

    try {
      // Ensure session is fresh before any database operations
      // This prevents silent failures after idle periods
      try {
        await ensureFreshSession();
      } catch (sessionErr) {
        console.warn("[AttendanceDrawer] Session check failed:", sessionErr);
        setError("Your session has expired. Please refresh the page and try again.");
        return;
      }

      console.log("[AttendanceDrawer] Starting save process...");

      // Helper to convert empty strings to null for time fields
      const timeOrNull = (val: string | undefined | null): string | null =>
        val && val.trim() !== "" ? val : null;

      // 1. Save named laborers to daily_attendance
      // Handle audit fields: preserve original creator when editing, add updated_by
      const isEditing = !!initialDate;
      console.log(
        "[AttendanceDrawer] isEditing:",
        isEditing,
        "originalCreator:",
        originalCreator
      );

      // Determine attendance status based on mode or override
      const attendanceStatus = statusOverride || (mode === "morning" ? "morning_entry" : "confirmed");
      const now = new Date().toISOString();

      const namedRecords = Array.from(selectedLaborers.values()).map((s) => {
        // Use salary override if present, otherwise calculated
        const effectiveSalary = s.salaryOverride ?? (s.dayUnits * s.dailyRate);
        const record: Record<string, unknown> = {
          date: selectedDate,
          laborer_id: s.laborerId,
          site_id: siteId,
          section_id: sectionId,
          work_days: s.dayUnits,
          hours_worked: s.workHours || 0,
          daily_rate_applied: s.dailyRate,
          daily_earnings: effectiveSalary,
          recorded_by: userProfile?.name || "Unknown",
          is_paid: false,
          synced_to_expense: true,
          // Time tracking fields
          in_time: timeOrNull(s.inTime),
          lunch_out: timeOrNull(s.lunchOut),
          lunch_in: timeOrNull(s.lunchIn),
          out_time: timeOrNull(s.outTime),
          work_hours: s.workHours || 0,
          break_hours: s.breakHours || 0,
          total_hours: s.totalHours || 0,
          day_units: s.dayUnits,
          // Salary override fields
          salary_override: s.salaryOverride,
          salary_override_reason: s.salaryOverrideReason || null,
          // Two-phase attendance fields
          attendance_status: attendanceStatus,
          work_progress_percent: workProgressPercent,
          ...(mode === "morning" ? { morning_entry_at: now } : {}),
          ...(mode === "evening" || mode === "full" ? { confirmed_at: now } : {}),
        };

        // Audit tracking - entered_by is UUID FK to users table
        // Always set entered_by to a valid UUID (current user's ID)
        if (userProfile?.id) {
          record.entered_by = userProfile.id;
          record.recorded_by_user_id = userProfile.id;

          // For edits, add updated_by tracking
          if (isEditing) {
            record.updated_by = userProfile.name;
            record.updated_by_user_id = userProfile.id;
          }
        }
        return record;
      });

      console.log(
        "[AttendanceDrawer] namedRecords prepared:",
        namedRecords.length
      );

      // Delete existing records for this date/site first
      console.log(
        "[AttendanceDrawer] Deleting existing attendance for date:",
        selectedDate,
        "site_id:",
        siteId
      );

      // Add timeout wrapper to detect hanging queries
      const deletePromise = supabase
        .from("daily_attendance")
        .delete()
        .eq("site_id", siteId)
        .eq("date", selectedDate);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Delete query timed out after 15s")), 15000)
      );

      try {
        const { error: deleteError } = await Promise.race([
          deletePromise,
          timeoutPromise,
        ]) as { error: unknown };

        if (deleteError) {
          console.error(
            "[AttendanceDrawer] Error deleting existing attendance:",
            deleteError
          );
          // Continue anyway - might not have existing records
        } else {
          console.log("[AttendanceDrawer] Delete completed successfully");
        }
      } catch (timeoutErr) {
        console.error("[AttendanceDrawer] Delete timed out:", timeoutErr);
        // Continue anyway - the delete might still complete in background
      }

      if (namedRecords.length > 0) {
        console.log(
          "[AttendanceDrawer] Inserting named records:",
          namedRecords
        );
        // Add timeout to prevent hanging forever on slow networks
        const insertPromise = (supabase.from("daily_attendance") as any).insert(namedRecords);
        const insertTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Insert attendance timed out after 30s")), 30000)
        );

        try {
          const { error: attendanceError } = await Promise.race([
            insertPromise,
            insertTimeoutPromise,
          ]) as { error: unknown };
          if (attendanceError) {
            console.error("[AttendanceDrawer] Insert error:", attendanceError);
            throw attendanceError;
          }
          console.log("[AttendanceDrawer] Named records inserted successfully");
        } catch (insertErr) {
          console.error("[AttendanceDrawer] Insert failed or timed out:", insertErr);
          throw insertErr;
        }
      }

      // 2. Save market laborers
      console.log("[AttendanceDrawer] Deleting existing market attendance...");
      const marketDeletePromise = supabase
        .from("market_laborer_attendance")
        .delete()
        .eq("site_id", siteId)
        .eq("date", selectedDate);

      const marketTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Market delete timed out after 15s")), 15000)
      );

      try {
        const { error: marketDeleteError } = await Promise.race([
          marketDeletePromise,
          marketTimeoutPromise,
        ]) as { error: unknown };

        if (marketDeleteError) {
          console.error(
            "[AttendanceDrawer] Error deleting existing market attendance:",
            marketDeleteError
          );
          // If delete fails and we have market laborers to insert, throw error to prevent duplicates
          if (marketLaborers.length > 0) {
            throw new Error("Failed to delete existing market attendance. Please try again.");
          }
        } else {
          console.log("[AttendanceDrawer] Market attendance delete completed");
        }
      } catch (marketTimeoutErr) {
        console.error("[AttendanceDrawer] Market delete timed out:", marketTimeoutErr);
        // If delete times out and we have market laborers to insert, throw error to prevent duplicates
        if (marketLaborers.length > 0) {
          throw marketTimeoutErr;
        }
      }

      if (marketLaborers.length > 0) {
        console.log("[AttendanceDrawer] Preparing market laborer records...");
        const marketRecords = marketLaborers.map((m) => {
          // Use salary override per person if present
          const effectiveRate = m.salaryOverridePerPerson ?? m.ratePerPerson;
          const record: Record<string, unknown> = {
            site_id: siteId,
            section_id: sectionId,
            date: selectedDate,
            role_id: m.roleId,
            worker_index: m.workerIndex || 1, // Worker index for same-role differentiation
            count: m.count, // Use actual count from entry (grouped entry support)
            work_days: m.dayUnits,
            rate_per_person: m.ratePerPerson,
            total_cost: effectiveRate * m.count * m.dayUnits, // count * rate * days
            // Salary override fields
            salary_override_per_person: m.salaryOverridePerPerson,
            salary_override_reason: m.salaryOverrideReason || null,
            // Audit fields: entered_by stores the human-readable name, entered_by_user_id stores the uuid
            entered_by: userProfile?.name || "Unknown",
            // Time tracking fields
            in_time: timeOrNull(m.inTime),
            lunch_out: timeOrNull(m.lunchOut),
            lunch_in: timeOrNull(m.lunchIn),
            out_time: timeOrNull(m.outTime),
            work_hours: m.workHours || 0,
            break_hours: m.breakHours || 0,
            total_hours: m.totalHours || 0,
            day_units: m.dayUnits,
            // Two-phase attendance fields
            attendance_status: attendanceStatus,
            ...(mode === "morning" ? { morning_entry_at: now } : {}),
            ...(mode === "evening" || mode === "full" ? { confirmed_at: now } : {}),
          };

          // Audit tracking for market laborers
          if (userProfile?.id) {
            // Always set entered_by_user_id to the current user's uuid
            record.entered_by_user_id = userProfile.id;
          }
          if (isEditing && userProfile?.name) {
            // On edit, set updated_by fields (name as text, uuid as FK where applicable)
            record.updated_by = userProfile.name;
            if (userProfile.id) {
              record.updated_by_user_id = userProfile.id;
            }
          }
          return record;
        });

        console.log(
          "[AttendanceDrawer] Inserting market records:",
          marketRecords
        );
        // Add timeout to prevent hanging forever on slow networks
        const marketInsertPromise = (supabase.from("market_laborer_attendance") as any).insert(marketRecords);
        const marketInsertTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Insert market attendance timed out after 30s")), 30000)
        );

        try {
          const { error: marketError } = await Promise.race([
            marketInsertPromise,
            marketInsertTimeoutPromise,
          ]) as { error: unknown };
          if (marketError) {
            console.error("[AttendanceDrawer] Market insert error:", marketError);
            // Surface detailed error to the UI to avoid infinite spinner
            throw marketError;
          }
          console.log("[AttendanceDrawer] Market records inserted successfully");
        } catch (marketInsertErr) {
          console.error("[AttendanceDrawer] Market insert failed or timed out:", marketInsertErr);
          throw marketInsertErr;
        }
      }

      // 3. Save/Update daily work summary (non-critical)
      try {
        console.log("[AttendanceDrawer] Preparing work summary...");
        console.log("[AttendanceDrawer] workDescription:", workDescription);

        const summaryRecord: Record<string, unknown> = {
          site_id: siteId,
          date: selectedDate,
          work_description: workDescription || null,
          work_status: workStatus || null,
          comments: comments || null,
          work_updates: workUpdates || null,
          first_in_time: timeOrNull(defaultInTime),
          last_out_time: timeOrNull(defaultOutTime),
          daily_laborer_count: summary.dailyCount,
          contract_laborer_count: summary.contractCount,
          market_laborer_count: summary.marketCount,
          total_laborer_count: summary.totalCount,
          total_salary: summary.totalSalary,
          total_snacks: 0,
          total_expense: summary.totalExpense,
          default_snacks_per_person: 0,
          entered_by: userProfile?.name || "Unknown",
        };
        if (userProfile?.id) {
          summaryRecord.entered_by_user_id = userProfile.id;
          // Always set updated_by for upsert operations
          summaryRecord.updated_by = userProfile.name;
          summaryRecord.updated_by_user_id = userProfile.id;
        }

        console.log("[AttendanceDrawer] Saving work summary:", summaryRecord);
        // Add timeout to work summary upsert (15s since it's non-critical)
        const summaryUpsertPromise = (supabase.from("daily_work_summary") as any)
          .upsert(summaryRecord, { onConflict: "site_id,date" });
        const summaryTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Work summary upsert timed out after 15s")), 15000)
        );

        try {
          const { error: summaryError } = await Promise.race([
            summaryUpsertPromise,
            summaryTimeoutPromise,
          ]) as { error: unknown };

          if (summaryError) {
            console.error("[AttendanceDrawer] Error saving work summary:", summaryError);
            console.error("[AttendanceDrawer] Summary error details:", {
              message: (summaryError as any).message,
              code: (summaryError as any).code,
              details: (summaryError as any).details,
              hint: (summaryError as any).hint
            });
          } else {
            console.log("[AttendanceDrawer] Work summary saved successfully");
          }
        } catch (summaryTimeoutErr) {
          console.warn("[AttendanceDrawer] Work summary timed out (non-critical):", summaryTimeoutErr);
        }
      } catch (summaryErr) {
        console.error("[AttendanceDrawer] Work summary save exception:", summaryErr);
      }

      // 4. AUTO-SYNC: Create expense record for labor (non-blocking)
      // Wrap in try-catch so attendance save succeeds even if expense sync fails
      try {
        const totalAmount = summary.totalExpense;
        if (totalAmount > 0) {
          // First try to get existing labor category
          let categoryId: string | null = null;
          const { data: laborCategory } = await (
            supabase.from("expense_categories") as any
          )
            .select("id")
            .eq("module", "labor")
            .maybeSingle(); // Use maybeSingle to avoid error when no match

          if (laborCategory) {
            categoryId = (laborCategory as { id: string }).id;
          } else {
            // Try to create labor category if it doesn't exist
            try {
              const { data: newCategory } = await (
                supabase.from("expense_categories") as any
              )
                .insert({
                  name: "Labor",
                  module: "labor",
                  description: "Labor and attendance expenses",
                })
                .select()
                .single();

              if (newCategory) {
                categoryId = (newCategory as { id: string }).id;
              }
            } catch (catErr) {
              console.warn("Could not create expense category:", catErr);
            }
          }

          // Only create expense if we have a valid category
          if (categoryId) {
            // Delete existing labor expense for this date
            await (supabase.from("expenses") as any)
              .delete()
              .eq("site_id", siteId)
              .eq("date", selectedDate)
              .eq("module", "labor");

            const { data: expenseData, error: expenseError } = await (
              supabase.from("expenses") as any
            )
              .insert({
                module: "labor",
                category_id: categoryId,
                date: selectedDate,
                amount: totalAmount,
                site_id: siteId,
                section_id: sectionId,
                description: `Daily labor - ${
                  summary.totalCount
                } laborers (Salary: ₹${summary.totalSalary.toLocaleString()})`,
                payment_mode: "cash",
                is_recurring: false,
                is_cleared: false,
                entered_by: userProfile?.name || "Unknown",
                entered_by_user_id: userProfile?.id || null,
              })
              .select()
              .single();

            if (expenseError) {
              console.error("Error creating expense:", expenseError);
            } else if (expenseData) {
              // Try to sync - ignore errors
              try {
                await (supabase.from("attendance_expense_sync") as any).upsert(
                  {
                    attendance_date: selectedDate,
                    site_id: siteId,
                    expense_id: expenseData.id,
                    total_laborers: summary.totalCount,
                    total_work_days: summary.totalCount,
                    total_amount: totalAmount,
                    synced_by: userProfile?.name || "Unknown",
                    synced_by_user_id: userProfile?.id || null,
                  },
                  { onConflict: "attendance_date,site_id" }
                );
              } catch (syncErr) {
                console.warn(
                  "Expense sync table error (non-critical):",
                  syncErr
                );
              }
            }
          }
        }
      } catch (expenseErr) {
        console.warn("Expense auto-sync failed (non-critical):", expenseErr);
        // Don't throw - attendance was saved successfully
      }

      // Note: Tea shop entries are now managed via TeaShopEntryDialog

      console.log("[AttendanceDrawer] All saves completed successfully!");
      setSuccess("Attendance saved successfully!");
      // Clear persisted state since save was successful
      clearPersistedState();
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } catch (err: unknown) {
      console.error("[AttendanceDrawer] Error saving attendance:", err);

      // Provide user-friendly error messages
      let errorMessage = "Failed to save attendance";

      // Type-safe error extraction
      const errorObj = err as {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
      };
      const errMessage = errorObj?.message || "";
      const errCode = errorObj?.code || "";
      const errDetails = errorObj?.details || "";
      const errHint = errorObj?.hint || "";

      console.error("[AttendanceDrawer] Error details:", {
        errMessage,
        errCode,
        errDetails,
        errHint,
      });

      if (errMessage || errCode) {
        if (errMessage.includes("foreign key") || errCode === "23503") {
          errorMessage =
            "Cannot modify: Some records are linked to payments or other data";
        } else if (errMessage.includes("unique") || errCode === "23505") {
          errorMessage =
            "Duplicate entry detected. Please refresh and try again";
        } else if (errMessage.includes("permission") || errCode === "42501") {
          errorMessage = "Permission denied. Please log out and log back in to refresh your session. If issue persists, contact administrator.";
        } else if (errMessage.includes("violates check constraint")) {
          errorMessage =
            "Invalid data: Please check work days value (must be 0.5, 1, 1.5, or 2)";
        } else if (errCode === "23502") {
          // Not null violation
          errorMessage = `Missing required field: ${errDetails || errMessage}`;
        } else if (errMessage) {
          errorMessage = `Error: ${errMessage}`;
        } else {
          errorMessage = `Database error (${errCode}): ${
            errDetails || "Unknown error"
          }`;
        }
      } else if (err instanceof Error) {
        errorMessage = `Error: ${err.message}`;
      }

      setError(errorMessage);
    } finally {
      console.log("[AttendanceDrawer] Finally block - resetting saving states");
      setSaving(false);
      setSavingDraft(false);
    }
  };

  // Save as draft - skips confirmation dialog
  const handleSaveDraft = async () => {
    console.log("[AttendanceDrawer] handleSaveDraft called");

    if (selectedLaborers.size === 0 && marketLaborers.length === 0) {
      setError("Please select at least one laborer or add market laborers");
      return;
    }

    if (!sectionId) {
      setError("Please select a section");
      return;
    }

    // Prevent future date drafts
    const today = new Date().toISOString().split('T')[0];
    if (selectedDate > today) {
      setError("Cannot save draft for future dates");
      return;
    }

    // Directly execute save with draft status (no confirmation needed)
    await executeSave("draft");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <>
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      disableScrollLock={false}
      hideBackdrop={false}
      ModalProps={{ keepMounted: false }}
      sx={{
        // Use default z-index to allow dialogs to appear on top
      }}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 700, md: 900 },
          maxWidth: "95vw",
          overflowY: "auto",
        },
      }}
    >
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Compact Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: mode === "morning" ? "warning.main" : mode === "evening" ? "info.main" : "primary.main",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Shorter date format on mobile */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
            {mode === "morning" ? (
              <>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  🌅 Start Day - {dayjs(selectedDate).format("DD MMM YYYY (ddd)")}
                </Box>
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                  🌅 Start - {dayjs(selectedDate).format("DD MMM (ddd)")}
                </Box>
              </>
            ) : mode === "evening" ? (
              <>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  🌆 Confirm - {dayjs(selectedDate).format("DD MMM YYYY (ddd)")}
                </Box>
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                  🌆 Confirm - {dayjs(selectedDate).format("DD MMM (ddd)")}
                </Box>
              </>
            ) : initialDate ? (
              <>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  Edit - {dayjs(initialDate).format("DD MMM YYYY (ddd)")}
                </Box>
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                  Edit - {dayjs(initialDate).format("DD MMM (ddd)")}
                </Box>
              </>
            ) : (
              "Add Attendance"
            )}
          </Typography>
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{ color: "white", p: 0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Date and Section Row - Stacked on mobile */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  gap: { xs: 1.5, sm: 2 },
                  mb: 2,
                }}
              >
                <TextField
                  label="Date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { max: new Date().toISOString().split('T')[0] }
                  }}
                  size="small"
                  disabled={!!initialDate}
                  sx={{ flex: { xs: "none", sm: 1 }, minWidth: { sm: 140 } }}
                />
                <SectionAutocomplete
                  siteId={siteId}
                  value={sectionId || null}
                  onChange={(id) => setSectionId(id || "")}
                  onNameChange={(name) => setSectionName(name)}
                  size="small"
                  label="Section"
                  autoSelectDefault={!initialDate}
                  sx={{ flex: { xs: "none", sm: 2 }, width: "100%" }}
                />
              </Box>

              {/* Unified Laborers Section */}
              <Box
                sx={{
                  mb: 2,
                  p: 2,
                  bgcolor: "background.paper",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                {/* Section Header */}
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
                >
                  <PeopleIcon color="primary" />
                  <Typography variant="subtitle1" fontWeight={600}>
                    Work Laborers
                  </Typography>
                  {(selectedLaborers.size > 0 || marketLaborers.length > 0) && (
                    <Chip
                      label={`${
                        selectedLaborers.size +
                        marketLaborers.reduce((acc, m) => acc + m.count, 0)
                      } total`}
                      size="small"
                      color="primary"
                    />
                  )}
                </Box>

                {/* Morning Mode: Start Time & Planned Work */}
                {mode === "morning" && (
                  <Box
                    sx={{
                      mb: 2,
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      gap: { xs: 1.5, sm: 3 },
                      alignItems: { xs: "stretch", sm: "center" },
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Start Time Input */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      {/* Show shorter label on mobile */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          minWidth: { xs: 70, sm: "auto" },
                          display: { xs: "none", sm: "block" },
                        }}
                      >
                        Work Start Time:
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          minWidth: 70,
                          display: { xs: "block", sm: "none" },
                        }}
                      >
                        Start Time:
                      </Typography>
                      <TextField
                        size="small"
                        type="time"
                        value={defaultInTime}
                        onChange={(e) => setDefaultInTime(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ width: 120 }}
                      />
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          // Apply start time to all selected laborers
                          setSelectedLaborers((prev) => {
                            const updated = new Map(prev);
                            updated.forEach((laborer, id) => {
                              updated.set(id, { ...laborer, inTime: defaultInTime });
                            });
                            return updated;
                          });
                          setMarketLaborers((prev) =>
                            prev.map((m) => ({ ...m, inTime: defaultInTime }))
                          );
                        }}
                        disabled={
                          selectedLaborers.size === 0 && marketLaborers.length === 0
                        }
                        sx={{ minWidth: "auto", px: 1 }}
                      >
                        Apply All
                      </Button>
                    </Box>
                    {/* Planned Work Day Units */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ minWidth: { xs: 70, sm: "auto" } }}
                      >
                        Planned Work:
                      </Typography>
                      <ToggleButtonGroup
                        value={defaultWorkUnit}
                        exclusive
                        onChange={(_, value) => {
                          if (value !== null) {
                            setDefaultWorkUnit(value);
                          }
                        }}
                        size="small"
                        sx={{
                          "& .MuiToggleButton-root": {
                            px: 1.5,
                            py: 0.5,
                            "&.Mui-selected": {
                              bgcolor: "warning.main",
                              color: "white",
                              "&:hover": { bgcolor: "warning.dark" },
                            },
                          },
                        }}
                      >
                        {WORK_UNIT_PRESETS.map((p) => (
                          <ToggleButton key={p.value} value={p.value}>
                            <Typography variant="body2" fontWeight={600}>
                              {p.shortLabel}
                            </Typography>
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                      <Typography variant="caption" color="text.secondary">
                        days
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* Evening Mode: As Planned / Modified Toggle */}
                {mode === "evening" && (
                  <Box sx={{ mb: 2 }}>
                    {/* Show planned value */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1.5,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Planned:
                      </Typography>
                      <Chip
                        label={`${defaultWorkUnit} Day${defaultWorkUnit !== 1 ? "s" : ""}`}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    </Box>
                    {/* As Planned / Modified Toggle */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: planFollowed ? 0 : 1.5,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ minWidth: 130 }}
                      >
                        Was the plan executed?
                      </Typography>
                      <ToggleButtonGroup
                        value={planFollowed}
                        exclusive
                        onChange={(_, value) => {
                          if (value !== null) {
                            setPlanFollowed(value);
                          }
                        }}
                        size="small"
                        sx={{
                          "& .MuiToggleButton-root": {
                            px: 2,
                            py: 0.5,
                            "&.Mui-selected": {
                              bgcolor: "success.main",
                              color: "white",
                              "&:hover": { bgcolor: "success.dark" },
                            },
                          },
                        }}
                      >
                        <ToggleButton value={true}>
                          <CheckCircleIcon sx={{ fontSize: 16, mr: 0.5 }} />
                          <Typography variant="body2" fontWeight={600}>
                            As Planned
                          </Typography>
                        </ToggleButton>
                        <ToggleButton
                          value={false}
                          sx={{
                            "&.Mui-selected": {
                              bgcolor: "info.main !important",
                              "&:hover": { bgcolor: "info.dark !important" },
                            },
                          }}
                        >
                          <SettingsIcon sx={{ fontSize: 16, mr: 0.5 }} />
                          <Typography variant="body2" fontWeight={600}>
                            Modified
                          </Typography>
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                    {/* Show day unit selector only when Modified is selected */}
                    <Collapse in={!planFollowed}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                          pl: 0,
                        }}
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ minWidth: 70 }}
                        >
                          Actual:
                        </Typography>
                        <ToggleButtonGroup
                          value={defaultWorkUnit}
                          exclusive
                          onChange={(_, value) => {
                            if (value !== null) {
                              setDefaultWorkUnit(value);
                              const preset = getPresetByValue(value);
                              setDefaultInTime(preset.inTime);
                              setDefaultOutTime(preset.outTime);
                              setDefaultLunchOut(preset.lunchOut || "13:00");
                              setDefaultLunchIn(preset.lunchIn || "14:00");
                            }
                          }}
                          size="small"
                          sx={{
                            "& .MuiToggleButton-root": {
                              px: 1.5,
                              py: 0.5,
                              "&.Mui-selected": {
                                bgcolor: "info.main",
                                color: "white",
                                "&:hover": { bgcolor: "info.dark" },
                              },
                            },
                          }}
                        >
                          {WORK_UNIT_PRESETS.map((p) => (
                            <ToggleButton key={p.value} value={p.value}>
                              <Typography variant="body2" fontWeight={600}>
                                {p.shortLabel}
                              </Typography>
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                        <Typography variant="caption" color="text.secondary">
                          days
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          onClick={applyDefaultWorkUnitToAll}
                          disabled={
                            selectedLaborers.size === 0 && marketLaborers.length === 0
                          }
                          sx={{ ml: "auto" }}
                        >
                          Apply All
                        </Button>
                      </Box>
                    </Collapse>
                  </Box>
                )}

                {/* Full Mode: Work Unit Row */}
                {mode === "full" && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minWidth: 70 }}
                    >
                      Work Day:
                    </Typography>
                    <ToggleButtonGroup
                      value={defaultWorkUnit}
                      exclusive
                      onChange={(_, value) => {
                        if (value !== null) {
                          setDefaultWorkUnit(value);
                          const preset = getPresetByValue(value);
                          setDefaultInTime(preset.inTime);
                          setDefaultOutTime(preset.outTime);
                          setDefaultLunchOut(preset.lunchOut || "13:00");
                          setDefaultLunchIn(preset.lunchIn || "14:00");
                        }
                      }}
                      size="small"
                      sx={{
                        "& .MuiToggleButton-root": {
                          px: 1.5,
                          py: 0.5,
                          "&.Mui-selected": {
                            bgcolor: "primary.main",
                            color: "white",
                            "&:hover": { bgcolor: "primary.dark" },
                          },
                        },
                      }}
                    >
                      {WORK_UNIT_PRESETS.map((p) => (
                        <ToggleButton key={p.value} value={p.value}>
                          <Typography variant="body2" fontWeight={600}>
                            {p.shortLabel}
                          </Typography>
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                    <Button
                      size="small"
                      variant="text"
                      onClick={applyDefaultWorkUnitToAll}
                      disabled={
                        selectedLaborers.size === 0 && marketLaborers.length === 0
                      }
                      sx={{ ml: "auto" }}
                    >
                      Apply All
                    </Button>
                  </Box>
                )}

                {/* Initial State - Show compact inline buttons when no laborers */}
                {selectedLaborers.size === 0 && marketLaborers.length === 0 ? (
                  <Box sx={{ display: "flex", flexDirection: "row", gap: 1, mb: 2 }}>
                    <Button
                      variant="contained"
                      startIcon={<PeopleIcon />}
                      onClick={() => setLaborerDialogOpen(true)}
                      disabled={mode === "evening"}
                      sx={{ flex: 1 }}
                    >
                      <Box
                        component="span"
                        sx={{ display: { xs: "none", sm: "inline" } }}
                      >
                        Add Laborers
                      </Box>
                      <Box
                        component="span"
                        sx={{ display: { xs: "inline", sm: "none" } }}
                      >
                        Contract L.
                      </Box>
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<StoreIcon />}
                      onClick={() => setMarketLaborerDialogOpen(true)}
                      disabled={mode === "evening"}
                      color="warning"
                      sx={{ flex: 1 }}
                    >
                      <Box
                        component="span"
                        sx={{ display: { xs: "none", sm: "inline" } }}
                      >
                        Add Market
                      </Box>
                      <Box
                        component="span"
                        sx={{ display: { xs: "inline", sm: "none" } }}
                      >
                        Market L.
                      </Box>
                    </Button>
                  </Box>
                ) : (
                  /* Action Buttons Row - Show when laborers exist */
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Add More Laborers button */}
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<PeopleIcon />}
                      onClick={() => setLaborerDialogOpen(true)}
                      disabled={mode === "evening"}
                    >
                      <Box
                        component="span"
                        sx={{ display: { xs: "none", sm: "inline" } }}
                      >
                        Add More
                      </Box>
                      <Box
                        component="span"
                        sx={{ display: { xs: "inline", sm: "none" } }}
                      >
                        + Contract
                      </Box>
                    </Button>
                    {/* Add Market Laborers button */}
                    <Button
                      variant="outlined"
                      size="small"
                      color="warning"
                      startIcon={<StoreIcon />}
                      onClick={() => setMarketLaborerDialogOpen(true)}
                      disabled={mode === "evening"}
                    >
                      <Box
                        component="span"
                        sx={{ display: { xs: "none", sm: "inline" } }}
                      >
                        Market
                      </Box>
                      <Box
                        component="span"
                        sx={{ display: { xs: "inline", sm: "none" } }}
                      >
                        + Market
                      </Box>
                    </Button>
                    {/* Custom times checkbox - Hidden in morning mode */}
                    {mode !== "morning" && (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={showGlobalCustomTimes}
                            onChange={(e) =>
                              setShowGlobalCustomTimes(e.target.checked)
                            }
                            size="small"
                          />
                        }
                        label={
                          <Typography variant="body2">Custom times</Typography>
                        }
                      />
                    )}
                    <Box sx={{ flex: 1 }} />
                    {/* Tea Button - Hidden in morning mode */}
                    {mode !== "morning" && teaShops.length > 0 && (
                      <Button
                        variant={existingTeaEntry ? "contained" : "outlined"}
                        size="small"
                        color="warning"
                        startIcon={<TeaIcon />}
                        onClick={() => {
                          // If site is in a group with a group tea shop, show choice dialog
                          if (siteGroupId && groupTeaShop) {
                            setTeaShopEntryModeDialogOpen(true);
                          } else {
                            // Regular site-specific entry
                            setTeaShopDialogOpen(true);
                          }
                        }}
                        disabled={!selectedTeaShop && !groupTeaShop}
                      >
                        {existingTeaEntry
                          ? `Tea ₹${teaShopTotal.toLocaleString()}`
                          : "Tea"}
                      </Button>
                    )}
                  </Box>
                )}

                {/* Custom Times - Collapsible - Hidden in morning mode */}
                <Collapse in={showGlobalCustomTimes && mode !== "morning"}>
                  <Box
                    sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1, mb: 2 }}
                  >
                    <Grid container spacing={1.5} alignItems="center">
                      <Grid size={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          label="In"
                          type="time"
                          value={defaultInTime}
                          onChange={(e) => setDefaultInTime(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                      <Grid size={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          label="L-Out"
                          type="time"
                          value={defaultLunchOut}
                          onChange={(e) => setDefaultLunchOut(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                      <Grid size={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          label="L-In"
                          type="time"
                          value={defaultLunchIn}
                          onChange={(e) => setDefaultLunchIn(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                      <Grid size={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Out"
                          type="time"
                          value={defaultOutTime}
                          onChange={(e) => setDefaultOutTime(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                      <Grid size={2}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={applyDefaultTimesToAll}
                          disabled={
                            selectedLaborers.size === 0 &&
                            marketLaborers.length === 0
                          }
                          fullWidth
                        >
                          Apply
                        </Button>
                      </Grid>
                    </Grid>
                  </Box>
                </Collapse>

                {/* Only show sections when laborers exist */}
                {(selectedLaborers.size > 0 || marketLaborers.length > 0) && (
                  <Divider sx={{ mb: 2 }} />
                )}

                {/* Named Laborers Subsection - Only show when laborers selected */}
                {selectedLaborers.size > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        fontWeight={600}
                      >
                        Named Laborers ({selectedLaborers.size})
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setLaborerDialogOpen(true)}
                        disabled={mode === "evening"}
                      >
                        Add More
                      </Button>
                    </Box>

                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      {Array.from(selectedLaborers.values()).map(
                        (selection) => {
                          const laborer = laborers.find(
                            (l) => l.id === selection.laborerId
                          );
                          if (!laborer) return null;

                          const isHalfDay = selection.dayUnits === 0.5;
                          const preset = getPresetByValue(selection.dayUnits);
                          const alignmentStatus = getAlignmentStatus(
                            selection.workHours,
                            preset,
                            !!(selection.inTime && selection.outTime)
                          );

                          return (
                            <Box
                              key={selection.laborerId}
                              sx={{
                                p: 2,
                                border: 1,
                                borderColor: "divider",
                                borderRadius: 2,
                                borderLeft: 4,
                                borderLeftColor:
                                  laborer.laborer_type === "contract"
                                    ? "info.main"
                                    : "warning.main",
                                bgcolor: "background.paper",
                              }}
                            >
                              {/* Header Row */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  mb: 1.5,
                                }}
                              >
                                <Box>
                                  <Typography
                                    variant="subtitle2"
                                    fontWeight={600}
                                  >
                                    {laborer.name}
                                  </Typography>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      gap: 0.5,
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      {laborer.category_name}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      •
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      {laborer.team_name || "No Team"}
                                    </Typography>
                                    <Chip
                                      label={
                                        laborer.laborer_type === "contract"
                                          ? "Contract"
                                          : "Daily"
                                      }
                                      size="small"
                                      color={
                                        laborer.laborer_type === "contract"
                                          ? "info"
                                          : "warning"
                                      }
                                      sx={{
                                        height: 18,
                                        fontSize: "0.6rem",
                                        ml: 0.5,
                                      }}
                                    />
                                    {/* Salary Badge - Always visible */}
                                    <Typography
                                      variant="caption"
                                      fontWeight={600}
                                      color="success.main"
                                      sx={{
                                        bgcolor: "success.50",
                                        px: 1,
                                        py: 0.25,
                                        borderRadius: 1,
                                        ml: 0.5,
                                      }}
                                    >
                                      ₹{selection.dailyRate.toLocaleString()}/day
                                    </Typography>
                                  </Box>
                                </Box>
                                <IconButton
                                  size="small"
                                  onClick={() => handleLaborerToggle(laborer)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>

                              {/* Work Unit Selection - PRIMARY - Now visible in all modes */}
                              <Box sx={{ mb: 1.5 }}>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ mb: 0.5, display: "block" }}
                                >
                                  WORK DAY UNIT
                                </Typography>
                                <ToggleButtonGroup
                                  value={selection.dayUnits}
                                  exclusive
                                  onChange={(event, value) => {
                                    if (value !== null) {
                                      if (value === 1.5) {
                                        // Show popover for 1.5 day time variant selection
                                        handleExtendedTimeClick(
                                          event as React.MouseEvent<HTMLElement>,
                                          selection.laborerId
                                        );
                                      } else {
                                        handleLaborerFieldChange(
                                          selection.laborerId,
                                          "dayUnits",
                                          value
                                        );
                                      }
                                    }
                                  }}
                                  size="small"
                                  fullWidth
                                  sx={{
                                    "& .MuiToggleButton-root": {
                                      flex: 1,
                                      py: 0.75,
                                      flexDirection: "column",
                                      "&.Mui-selected": {
                                        bgcolor: "primary.main",
                                        color: "white",
                                        "&:hover": { bgcolor: "primary.dark" },
                                      },
                                    },
                                  }}
                                >
                                  {WORK_UNIT_PRESETS.map((p) => (
                                    <ToggleButton key={p.value} value={p.value}>
                                      <Typography
                                        variant="body2"
                                        fontWeight={700}
                                      >
                                        {p.shortLabel}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontSize: "0.6rem",
                                          lineHeight: 1,
                                        }}
                                      >
                                        {p.label}
                                      </Typography>
                                    </ToggleButton>
                                  ))}
                                </ToggleButtonGroup>
                              </Box>

                              {/* Enable Custom Time button - Morning mode only */}
                              {mode === "morning" && (
                                <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
                                  <Button
                                    size="small"
                                    variant="text"
                                    startIcon={
                                      expandedLaborerTimes.has(selection.laborerId) ? (
                                        <CollapseIcon />
                                      ) : (
                                        <TimeIcon />
                                      )
                                    }
                                    onClick={() => {
                                      setExpandedLaborerTimes((prev) => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(selection.laborerId)) {
                                          newSet.delete(selection.laborerId);
                                        } else {
                                          newSet.add(selection.laborerId);
                                        }
                                        return newSet;
                                      });
                                    }}
                                    sx={{ color: "text.secondary" }}
                                  >
                                    {expandedLaborerTimes.has(selection.laborerId)
                                      ? "Hide custom time"
                                      : "Enable custom time"}
                                  </Button>
                                </Box>
                              )}

                              {/* Earnings Row with Settings Button - Hidden in morning mode */}
                              {mode !== "morning" && (
                                <Box
                                  sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    py: 1,
                                    px: 1.5,
                                    bgcolor: "action.hover",
                                    borderRadius: 1,
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    Rate:{" "}
                                    <strong>
                                      ₹{selection.dailyRate.toLocaleString()}
                                    </strong>
                                  </Typography>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 1,
                                    }}
                                  >
                                    <Typography
                                      variant="body2"
                                      fontWeight={700}
                                      color="success.main"
                                    >
                                      {selection.salaryOverride ? (
                                        <>
                                          ₹{selection.salaryOverride.toLocaleString()}
                                          <Typography
                                            component="span"
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ ml: 0.5, textDecoration: "line-through" }}
                                          >
                                            (₹{(selection.dayUnits * selection.dailyRate).toLocaleString()})
                                          </Typography>
                                        </>
                                      ) : (
                                        <>
                                          ₹
                                          {(
                                            selection.dayUnits * selection.dailyRate
                                          ).toLocaleString()}
                                        </>
                                      )}
                                    </Typography>
                                    {/* Settings button to expand time & salary fields */}
                                    <Tooltip
                                      title={
                                        expandedLaborerTimes.has(
                                          selection.laborerId
                                        )
                                          ? "Hide settings"
                                          : "Custom time & salary"
                                      }
                                    >
                                      <IconButton
                                        size="small"
                                        onClick={() => {
                                          setExpandedLaborerTimes((prev) => {
                                            const newSet = new Set(prev);
                                            if (newSet.has(selection.laborerId)) {
                                              newSet.delete(selection.laborerId);
                                            } else {
                                              newSet.add(selection.laborerId);
                                            }
                                            return newSet;
                                          });
                                        }}
                                        sx={{
                                          bgcolor: expandedLaborerTimes.has(
                                            selection.laborerId
                                          )
                                            ? "primary.100"
                                            : "transparent",
                                        }}
                                      >
                                        {expandedLaborerTimes.has(
                                          selection.laborerId
                                        ) ? (
                                          <CollapseIcon fontSize="small" />
                                        ) : (
                                          <SettingsIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </Box>
                              )}

                              {/* Collapsible Time Fields - Now visible in all modes */}
                              <Collapse
                                in={expandedLaborerTimes.has(selection.laborerId)}
                              >
                                <Box
                                  sx={{
                                    mt: 1.5,
                                    p: 1.5,
                                    bgcolor: "action.hover",
                                    borderRadius: 1,
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ mb: 1, display: "block" }}
                                  >
                                    {mode === "morning"
                                      ? "Custom In Time"
                                      : "Custom Time (this laborer only)"}
                                  </Typography>
                                  <Grid container spacing={1}>
                                    <Grid size={mode === "morning" ? 12 : isHalfDay ? 6 : 3}>
                                      <TextField
                                        fullWidth
                                        size="small"
                                        type="time"
                                        label="In"
                                        value={selection.inTime}
                                        onChange={(e) =>
                                          handleLaborerFieldChange(
                                            selection.laborerId,
                                            "inTime",
                                            e.target.value
                                          )
                                        }
                                        slotProps={{
                                          inputLabel: { shrink: true },
                                        }}
                                      />
                                    </Grid>
                                    {/* Only show lunch fields for non-half-day and not morning mode */}
                                    {!isHalfDay && mode !== "morning" && (
                                      <>
                                        <Grid size={3}>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            type="time"
                                            label="L-Out"
                                            value={selection.lunchOut}
                                            onChange={(e) =>
                                              handleLaborerFieldChange(
                                                selection.laborerId,
                                                "lunchOut",
                                                e.target.value
                                              )
                                            }
                                            slotProps={{
                                              inputLabel: { shrink: true },
                                            }}
                                          />
                                        </Grid>
                                        <Grid size={3}>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            type="time"
                                            label="L-In"
                                            value={selection.lunchIn}
                                            onChange={(e) =>
                                              handleLaborerFieldChange(
                                                selection.laborerId,
                                                "lunchIn",
                                                e.target.value
                                              )
                                            }
                                            slotProps={{
                                              inputLabel: { shrink: true },
                                            }}
                                          />
                                        </Grid>
                                      </>
                                    )}
                                    {/* Out time - hidden in morning mode */}
                                    {mode !== "morning" && (
                                    <Grid size={isHalfDay ? 6 : 3}>
                                      <TextField
                                        fullWidth
                                        size="small"
                                        type="time"
                                        label="Out"
                                        value={selection.outTime}
                                        onChange={(e) =>
                                          handleLaborerFieldChange(
                                            selection.laborerId,
                                            "outTime",
                                            e.target.value
                                          )
                                        }
                                        slotProps={{
                                          inputLabel: { shrink: true },
                                        }}
                                      />
                                    </Grid>
                                    )}
                                  </Grid>

                                  {/* Salary Override Section - Only show in non-morning mode */}
                                  {mode !== "morning" && (
                                    <>
                                      <Divider sx={{ my: 2 }} />
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ mb: 1, display: "block" }}
                                      >
                                        Salary Override (optional)
                                      </Typography>
                                      <Grid container spacing={1.5}>
                                        <Grid size={6}>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            type="number"
                                            label="Final Salary"
                                            placeholder={String(
                                              selection.dayUnits * selection.dailyRate
                                            )}
                                            value={selection.salaryOverride ?? ""}
                                            onChange={(e) => {
                                              const value =
                                                e.target.value === ""
                                                  ? null
                                                  : parseFloat(e.target.value);
                                              handleLaborerFieldChange(
                                                selection.laborerId,
                                                "salaryOverride",
                                                value
                                              );
                                            }}
                                            slotProps={{
                                              input: {
                                                startAdornment: (
                                                  <InputAdornment position="start">
                                                    ₹
                                                  </InputAdornment>
                                                ),
                                              },
                                              inputLabel: { shrink: true },
                                            }}
                                            helperText={
                                              selection.salaryOverride
                                                ? `Calculated: ₹${(
                                                    selection.dayUnits * selection.dailyRate
                                                  ).toLocaleString()}`
                                                : undefined
                                            }
                                          />
                                        </Grid>
                                        <Grid size={6}>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            label="Reason"
                                            placeholder="e.g., Festival bonus"
                                            value={selection.salaryOverrideReason}
                                            onChange={(e) =>
                                              handleLaborerFieldChange(
                                                selection.laborerId,
                                                "salaryOverrideReason",
                                                e.target.value
                                              )
                                            }
                                            slotProps={{
                                              inputLabel: { shrink: true },
                                            }}
                                          />
                                        </Grid>
                                      </Grid>
                                    </>
                                  )}
                                </Box>
                              </Collapse>
                            </Box>
                          );
                        }
                      )}
                    </Box>
                  </Box>
                )}

                {/* Laborer Selection Dialog */}
                <LaborerSelectionDialog
                  open={laborerDialogOpen}
                  onClose={() => setLaborerDialogOpen(false)}
                  siteId={siteId}
                  selectedLaborers={selectedLaborers}
                  onConfirm={(selected) => {
                    // Merge new selections with existing time data
                    const merged = new Map<string, SelectedLaborer>();
                    const timeCalc = calculateTimeHours(
                      defaultInTime,
                      defaultOutTime,
                      defaultLunchOut,
                      defaultLunchIn
                    );

                    selected.forEach((sel, key) => {
                      const existing = selectedLaborers.get(key);
                      if (existing) {
                        merged.set(key, { ...existing, ...sel });
                      } else {
                        merged.set(key, {
                          ...sel,
                          inTime: defaultInTime,
                          lunchOut: defaultLunchOut,
                          lunchIn: defaultLunchIn,
                          outTime: defaultOutTime,
                          ...timeCalc,
                          dayUnits: 1, // Default to Full Day for new selections
                          salaryOverride: null,
                          salaryOverrideReason: "",
                        });
                      }
                    });
                    setSelectedLaborers(merged);
                    setLaborerDialogOpen(false);
                    // Show market laborer prompt if laborers were selected and no market laborers yet
                    if (selected.size > 0 && marketLaborers.length === 0) {
                      setShowMarketPrompt(true);
                    }
                  }}
                />

                {/* Market Laborers Prompt - Show after company laborers selected */}
                {showMarketPrompt && (
                  <Box
                    sx={{
                      bgcolor: "info.50",
                      border: "1px solid",
                      borderColor: "info.200",
                      borderRadius: 1,
                      p: 2,
                      mb: 2,
                      textAlign: "center",
                    }}
                  >
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 1.5 }}>
                      Did market laborers work today?
                    </Typography>
                    <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        onClick={() => {
                          setMarketLaborerDialogOpen(true);
                          setShowMarketPrompt(false);
                        }}
                      >
                        Yes, Add Market Laborers
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setShowMarketPrompt(false)}
                      >
                        No
                      </Button>
                    </Box>
                  </Box>
                )}

                {/* Market Laborers Subsection - Only show when market laborers exist */}
                {marketLaborers.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        fontWeight={600}
                      >
                        Market Laborers ({marketLaborers.length})
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setMarketLaborerDialogOpen(true)}
                        disabled={mode === "evening"}
                      >
                        Add More
                      </Button>
                    </Box>

                    {marketLaborers.map((entry) => {
                  const isHalfDay = entry.dayUnits === 0.5;
                  const preset = getPresetByValue(entry.dayUnits);
                  const alignmentStatus = getAlignmentStatus(
                    entry.workHours,
                    preset,
                    !!(entry.inTime && entry.outTime)
                  );

                  return (
                    <Box
                      key={entry.id}
                      sx={{
                        mb: 2,
                        p: { xs: 1.5, sm: 2 },
                        bgcolor: (theme) =>
                          theme.palette.mode === "dark"
                            ? "rgba(237, 108, 2, 0.08)"
                            : "warning.50",
                        borderRadius: 2,
                        border: 1,
                        borderColor: "warning.200",
                        "& .MuiTypography-root": {
                          color: "text.primary",
                        },
                        "& .MuiInputLabel-root": {
                          color: "text.secondary",
                        },
                      }}
                    >
                      {/* Worker Title - shows "Mason (3)" for grouped, "Mason #1" for individual */}
                      <Box sx={{ display: "flex", alignItems: "center", mb: 1.5, gap: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600} color="warning.dark">
                          {entry.roleName} {entry.count > 1 ? `(${entry.count})` : `#${entry.workerIndex || 1}`}
                        </Typography>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveMarketLaborer(entry.id)}
                          sx={{ ml: "auto" }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      {/* Header Row with Role, Count, Rate */}
                      <Grid container spacing={{ xs: 1, sm: 2 }} alignItems="flex-start">
                        <Grid size={{ xs: 6, sm: 5 }}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Role</InputLabel>
                            <Select
                              value={entry.roleId}
                              onChange={(e) => {
                                const newRole = laborRoles.find(r => r.id === e.target.value);
                                handleMarketLaborerChange(
                                  entry.id,
                                  "roleId",
                                  e.target.value
                                );
                                // Update roleName when role changes
                                if (newRole) {
                                  handleMarketLaborerChange(entry.id, "roleName", newRole.name);
                                }
                              }}
                              label="Role"
                            >
                              {laborRoles.map((role) => (
                                <MenuItem key={role.id} value={role.id}>
                                  {role.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        {/* Salary Badge - Morning mode only */}
                        {mode === "morning" && (
                          <Grid size={{ xs: 6, sm: 5 }}>
                            <Box sx={{ display: "flex", alignItems: "center", height: "100%", pt: 0.5 }}>
                              <Typography
                                variant="caption"
                                fontWeight={600}
                                color="success.main"
                                sx={{
                                  bgcolor: "success.50",
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 1,
                                }}
                              >
                                ₹{entry.ratePerPerson.toLocaleString()}/person
                              </Typography>
                            </Box>
                          </Grid>
                        )}
                        {/* Rate/Person - Hidden in morning mode */}
                        {mode !== "morning" && (
                          <Grid size={3}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Rate/Person"
                              type="number"
                              value={entry.ratePerPerson}
                              onChange={(e) =>
                                handleMarketLaborerChange(
                                  entry.id,
                                  "ratePerPerson",
                                  Number(e.target.value)
                                )
                              }
                              slotProps={{
                                input: {
                                  startAdornment: (
                                    <InputAdornment position="start">
                                      ₹
                                    </InputAdornment>
                                  ),
                                },
                              }}
                            />
                          </Grid>
                        )}
                        {/* Total - Hidden in morning mode */}
                        {mode !== "morning" && (
                          <Grid size={2}>
                            <Box sx={{ textAlign: "center" }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Total
                              </Typography>
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                color="success.main"
                              >
                                ₹
                                {(
                                  entry.count *
                                  entry.ratePerPerson *
                                  entry.dayUnits
                                ).toLocaleString()}
                              </Typography>
                            </Box>
                          </Grid>
                        )}
                      </Grid>

                      {/* Work Unit Selection - Now visible in all modes */}
                      <Box sx={{ mt: 2, mb: 1.5 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mb: 0.5, display: "block" }}
                          >
                            WORK DAY UNIT
                          </Typography>
                          <ToggleButtonGroup
                            value={entry.dayUnits}
                            exclusive
                            onChange={(_, value) => {
                              if (value !== null) {
                                handleMarketLaborerChange(
                                  entry.id,
                                  "dayUnits",
                                  value
                                );
                              }
                            }}
                            size="small"
                            fullWidth
                            sx={{
                              "& .MuiToggleButton-root": {
                                flex: 1,
                                py: 0.5,
                                flexDirection: "column",
                                "&.Mui-selected": {
                                  bgcolor: "warning.main",
                                  color: "white",
                                  "&:hover": { bgcolor: "warning.dark" },
                                },
                              },
                            }}
                          >
                            {WORK_UNIT_PRESETS.map((p) => (
                              <ToggleButton key={p.value} value={p.value}>
                                <Typography variant="body2" fontWeight={700}>
                                  {p.shortLabel}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: "0.6rem", lineHeight: 1 }}
                                >
                                  {p.label}
                                </Typography>
                              </ToggleButton>
                            ))}
                          </ToggleButtonGroup>
                        </Box>

                      {/* Settings button for custom times - Now visible in all modes */}
                      <Box
                        sx={{
                          mt: 1,
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <Button
                          size="small"
                          variant="text"
                          startIcon={
                            expandedLaborerTimes.has(entry.id) ? (
                              <CollapseIcon />
                            ) : (
                              <TimeIcon />
                            )
                          }
                          onClick={() => {
                            setExpandedLaborerTimes((prev) => {
                              const newSet = new Set(prev);
                              if (newSet.has(entry.id)) {
                                newSet.delete(entry.id);
                              } else {
                                newSet.add(entry.id);
                              }
                              return newSet;
                            });
                          }}
                          sx={{ color: "text.secondary" }}
                        >
                          {expandedLaborerTimes.has(entry.id)
                            ? "Hide custom time"
                            : mode === "morning"
                            ? "Enable custom time"
                            : "Custom Time"}
                        </Button>
                      </Box>

                      {/* Collapsible Time row - Now visible in all modes */}
                      <Collapse in={expandedLaborerTimes.has(entry.id)}>
                        <Box
                          sx={{
                            mt: 1,
                            p: 1.5,
                            bgcolor: "background.paper",
                            borderRadius: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mb: 1, display: "block" }}
                          >
                            {mode === "morning"
                              ? "Custom In Time"
                              : "Custom Time"}
                          </Typography>
                          <Grid container spacing={1}>
                            <Grid size={mode === "morning" ? 12 : isHalfDay ? 6 : 3}>
                              <TextField
                                fullWidth
                                size="small"
                                type="time"
                                label="In"
                                value={entry.inTime}
                                onChange={(e) =>
                                  handleMarketLaborerChange(
                                    entry.id,
                                    "inTime",
                                    e.target.value
                                  )
                                }
                                slotProps={{ inputLabel: { shrink: true } }}
                              />
                            </Grid>
                            {/* Lunch fields - hidden in morning mode */}
                            {!isHalfDay && mode !== "morning" && (
                              <>
                                <Grid size={3}>
                                  <TextField
                                    fullWidth
                                    size="small"
                                    type="time"
                                    label="L-Out"
                                    value={entry.lunchOut}
                                    onChange={(e) =>
                                      handleMarketLaborerChange(
                                        entry.id,
                                        "lunchOut",
                                        e.target.value
                                      )
                                    }
                                    slotProps={{ inputLabel: { shrink: true } }}
                                  />
                                </Grid>
                                <Grid size={3}>
                                  <TextField
                                    fullWidth
                                    size="small"
                                    type="time"
                                    label="L-In"
                                    value={entry.lunchIn}
                                    onChange={(e) =>
                                      handleMarketLaborerChange(
                                        entry.id,
                                        "lunchIn",
                                        e.target.value
                                      )
                                    }
                                    slotProps={{ inputLabel: { shrink: true } }}
                                  />
                                </Grid>
                              </>
                            )}
                            {/* Out time - hidden in morning mode */}
                            {mode !== "morning" && (
                              <Grid size={isHalfDay ? 6 : 3}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="time"
                                  label="Out"
                                  value={entry.outTime}
                                  onChange={(e) =>
                                    handleMarketLaborerChange(
                                      entry.id,
                                      "outTime",
                                      e.target.value
                                    )
                                  }
                                  slotProps={{ inputLabel: { shrink: true } }}
                                />
                              </Grid>
                            )}
                          </Grid>
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}

                    {/* Bottom Add Group button */}
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setMarketLaborerDialogOpen(true)}
                      sx={{ mt: 1 }}
                      fullWidth
                      variant="outlined"
                      disabled={mode === "evening"}
                    >
                      Add Another Group
                    </Button>
                  </>
                )}
              </Box>
              {/* End Laborers Section wrapper */}

              {/* Work Updates Section - Morning/Evening Photo Documentation */}
              <WorkUpdatesSection
                supabase={supabase}
                siteId={siteId}
                date={selectedDate}
                mode={mode}
                initialData={workUpdates}
                onChange={setWorkUpdates}
                expanded={expandedSection === "work"}
                onExpandChange={(expanded) =>
                  setExpandedSection(expanded ? "work" : false)
                }
              />
            </>
          )}
        </Box>

        {/* Compact Summary & Save */}
        <Box
          sx={{
            borderTop: 1,
            borderColor: "divider",
            px: 2,
            py: 1.5,
            bgcolor: "action.hover",
          }}
        >
          {/* Line 1: Laborers count with breakdown */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 0.5,
              flexWrap: "wrap",
              gap: { xs: 0.5, sm: 1 },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="body2" fontWeight={600}>
                {summary.totalCount} Workers
              </Typography>
              {/* Breakdown - clearer labels on mobile */}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: { xs: "none", sm: "inline" } }}
              >
                (Daily:{summary.dailyCount} | Contract:{summary.contractCount} | Market:{summary.marketCount})
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={700} color="primary.main">
              ₹{(summary.totalExpense + teaShopTotal).toLocaleString()}
            </Typography>
          </Box>
          {/* Line 2: Salary and Tea Shop */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.5, sm: 2 },
              mb: 1.5,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="caption" color="success.main" fontWeight={600}>
              Salary: ₹{summary.totalSalary.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="warning.main" fontWeight={600}>
              Tea: ₹{teaShopTotal.toLocaleString()}
            </Typography>
            {/* Show compact breakdown on mobile */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: "inline", sm: "none" } }}
            >
              D:{summary.dailyCount} C:{summary.contractCount} M:{summary.marketCount}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              color="warning"
              size="large"
              onClick={handleSaveDraft}
              disabled={
                saving ||
                savingDraft ||
                (selectedLaborers.size === 0 && marketLaborers.length === 0)
              }
              sx={{ flex: 1 }}
            >
              {savingDraft ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                <>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Save as </Box>Draft
                </>
              )}
            </Button>
            <Button
              variant="contained"
              size="large"
              onClick={handleSaveClick}
              disabled={
                saving ||
                savingDraft ||
                (selectedLaborers.size === 0 && marketLaborers.length === 0)
              }
              sx={{ flex: 2 }}
            >
              {saving ? (
                <CircularProgress size={24} color="inherit" />
              ) : mode === "morning" ? (
                <>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Save </Box>Morning
                </>
              ) : mode === "evening" ? (
                <>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Evening </Box>Closing
                </>
              ) : (
                <>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Save </Box>Attendance
                </>
              )}
            </Button>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "block" }, textAlign: "center", mt: 1 }}
          >
            Auto-synced to Daily Expenses
          </Typography>
        </Box>
      </Box>

      {/* Tea Shop Entry Dialog */}
      {selectedTeaShop && (
        <TeaShopEntryDialog
          open={teaShopDialogOpen}
          onClose={() => setTeaShopDialogOpen(false)}
          shop={selectedTeaShop}
          entry={existingTeaEntry}
          onSuccess={handleTeaShopDialogSuccess}
          initialDate={selectedDate}
        />
      )}

      {/* Tea Shop Entry Mode Dialog - For choosing between group and site entry */}
      {siteGroup && (
        <TeaShopEntryModeDialog
          open={teaShopEntryModeDialogOpen}
          onClose={() => setTeaShopEntryModeDialogOpen(false)}
          siteName={siteName}
          groupSites={siteGroup.sites?.map((s: any) => s.name) || []}
          onSelectGroupEntry={() => {
            setTeaShopEntryModeDialogOpen(false);
            setGroupTeaShopDialogOpen(true);
          }}
          onSelectSiteEntry={() => {
            setTeaShopEntryModeDialogOpen(false);
            setTeaShopDialogOpen(true);
          }}
        />
      )}

      {/* Group Tea Shop Entry Dialog */}
      {groupTeaShop && siteGroup && (
        <GroupTeaShopEntryDialog
          open={groupTeaShopDialogOpen}
          onClose={() => setGroupTeaShopDialogOpen(false)}
          shop={groupTeaShop}
          siteGroup={siteGroup as SiteGroupWithSites}
          initialDate={selectedDate}
          onSuccess={() => {
            setGroupTeaShopDialogOpen(false);
            // Refresh tea shop data
            handleTeaShopDialogSuccess();
          }}
        />
      )}

      {/* Market Laborer Dialog */}
      <MarketLaborerDialog
        open={marketLaborerDialogOpen}
        onClose={() => setMarketLaborerDialogOpen(false)}
        laborRoles={laborRoles}
        onConfirm={(groups) => {
          const timeCalc = calculateTimeHours(
            defaultInTime,
            defaultOutTime,
            defaultLunchOut,
            defaultLunchIn
          );

          // Add groups as market laborers - each group becomes a separate worker entry
          setMarketLaborers((prev) => {
            // Calculate max worker index for each role
            const maxIndexByRole = new Map<string, number>();
            prev.forEach((m) => {
              const current = maxIndexByRole.get(m.roleId) || 0;
              maxIndexByRole.set(m.roleId, Math.max(current, m.workerIndex || 1));
            });

            // Create new entries with proper worker indices
            const newEntries: MarketLaborerEntry[] = groups.map((group, idx) => {
              const currentMax = maxIndexByRole.get(group.roleId) || 0;
              // Count how many of this role we've added in this batch
              const sameRoleBefore = groups.slice(0, idx).filter((g) => g.roleId === group.roleId).length;
              const workerIndex = currentMax + sameRoleBefore + 1;

              return {
                id: `new-${Date.now()}-${group.id}`,
                roleId: group.roleId,
                roleName: group.roleName,
                count: group.count, // Use actual count from dialog (grouped entry)
                workerIndex,
                workDays: group.dayUnits,
                ratePerPerson: group.rate,
                inTime: defaultInTime,
                lunchOut: defaultLunchOut,
                lunchIn: defaultLunchIn,
                outTime: defaultOutTime,
                ...timeCalc,
                dayUnits: group.dayUnits,
                salaryOverridePerPerson: null,
                salaryOverrideReason: "",
              };
            });

            return [...prev, ...newEntries];
          });
        }}
        defaultTimes={{
          inTime: defaultInTime,
          outTime: defaultOutTime,
          lunchOut: defaultLunchOut,
          lunchIn: defaultLunchIn,
        }}
      />

      {/* Extended Time Variant Popover for 1.5 day */}
      <Popover
        open={Boolean(extendedTimeAnchorEl)}
        anchorEl={extendedTimeAnchorEl}
        onClose={handleExtendedTimeClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
      >
        <Box sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
            Select Time Schedule
          </Typography>
          <RadioGroup
            value={selectedExtendedVariant}
            onChange={(e) => handleExtendedVariantSelect(e.target.value)}
          >
            {EXTENDED_TIME_VARIANTS.map((variant) => (
              <FormControlLabel
                key={variant.id}
                value={variant.id}
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {variant.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {variant.shortLabel} (with lunch)
                    </Typography>
                  </Box>
                }
                sx={{ mb: 0.5 }}
              />
            ))}
          </RadioGroup>
        </Box>
      </Popover>

    </Drawer>

    {/* Save Confirmation Dialog - outside Drawer for proper layering */}
    <AttendanceSaveConfirmDialog
      open={confirmDialogOpen}
      onClose={() => setConfirmDialogOpen(false)}
      onConfirm={() => {
        setConfirmDialogOpen(false);
        executeSave();
      }}
      onEdit={() => setConfirmDialogOpen(false)}
      siteName={siteName}
      sectionName={sectionName}
      date={selectedDate}
      summary={summary}
      teaShopTotal={teaShopTotal}
      hasExistingAttendance={hasExistingAttendance}
      saving={saving}
    />
    </>
  );
}
