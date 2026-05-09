"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Stack,
  TextField,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  Avatar,
  InputAdornment,
} from "@mui/material";
import {
  Close as CloseIcon,
  Save as SaveIcon,
  PersonAdd as PersonAddIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useContractMidEntries,
  useSaveMidEntry,
} from "@/hooks/queries/useContractMidEntries";
import type { TradeColor } from "@/theme/tradeColors";

interface MidAttendanceEntryDrawerProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractTitle: string;
  date: string;
  tradeColor: TradeColor;
}

interface RosterLaborer {
  id: string;
  name: string;
}

/**
 * Reads the contract's team / specialist roster so the supervisor can toggle
 * presence with chips.
 */
function useContractRoster(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-roster", contractId],
    enabled: !!contractId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<RosterLaborer[]> => {
      if (!contractId) return [];
      const sb = supabase as any;
      // 1. Fetch contract to know if it's team-based or specialist-based
      const { data: c, error: ce } = await sb
        .from("subcontracts")
        .select("team_id, laborer_id")
        .eq("id", contractId)
        .maybeSingle();
      if (ce) throw ce;
      if (!c) return [];

      const out: RosterLaborer[] = [];

      if (c.team_id) {
        const { data: team, error: te } = await sb
          .from("laborers")
          .select("id, name")
          .eq("team_id", c.team_id)
          .eq("status", "active");
        if (te) throw te;
        for (const l of team ?? []) out.push({ id: l.id, name: l.name });
      } else if (c.laborer_id) {
        const { data: solo, error: le } = await sb
          .from("laborers")
          .select("id, name")
          .eq("id", c.laborer_id)
          .maybeSingle();
        if (le) throw le;
        if (solo) out.push({ id: solo.id, name: solo.name });
      }

      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Mid-mode entry drawer — supervisor toggles which laborers came + records
 * one day-total amount + optional work-done units (e.g., 0.5 day, 1.5 day).
 *
 * Design: matches the layout supervisors saw in the trade-modes-demo page.
 * Header is tinted with the trade color so it feels native to the trade.
 */
export function MidAttendanceEntryDrawer({
  open,
  onClose,
  contractId,
  contractTitle,
  date,
  tradeColor,
}: MidAttendanceEntryDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { data: roster, isLoading: rosterLoading } = useContractRoster(
    open ? contractId : undefined
  );
  const { data: entries } = useContractMidEntries(open ? contractId : undefined);
  const existing = useMemo(
    () => entries?.find((e) => e.attendanceDate === date) ?? null,
    [entries, date]
  );
  const saveMutation = useSaveMidEntry();

  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [dayTotal, setDayTotal] = useState<string>("");
  const [workDone, setWorkDone] = useState<string>("1.0");
  const [note, setNote] = useState<string>("");
  const [savedToast, setSavedToast] = useState(false);

  // Hydrate from existing entry whenever drawer opens or date changes
  useEffect(() => {
    if (!open) return;
    setPresentIds(new Set(existing?.laborerIds ?? []));
    setDayTotal(existing ? String(existing.dayTotalAmount) : "");
    setWorkDone(existing ? String(existing.workDoneUnits || 1) : "1.0");
    setNote(existing?.note ?? "");
  }, [open, existing, date]);

  const togglePresence = (id: string) => {
    setPresentIds((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const total = Number(dayTotal) || 0;
    const work = Number(workDone) || 0;
    await saveMutation.mutateAsync({
      contractId,
      attendanceDate: date,
      laborerIds: Array.from(presentIds),
      dayTotalAmount: total,
      workDoneUnits: work,
      note: note.trim() || null,
    });
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 600);
  };

  const presentCount = presentIds.size;
  const totalCount = roster?.length ?? 0;

  const drawerContent = (
    <Box sx={{ width: { xs: "100%", md: 480 }, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        sx={{
          bgcolor: tradeColor.main,
          color: tradeColor.contrastText,
          px: 2,
          py: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            Day Entry — {new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", weekday: "short" })}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            {contractTitle}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: tradeColor.contrastText }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ p: 2, flex: 1, overflowY: "auto" }}>
        {/* Roster presence */}
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
          Who came today?
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            (tap chips to toggle)
          </Typography>
        </Typography>

        {rosterLoading && (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
          </Stack>
        )}

        {!rosterLoading && (!roster || roster.length === 0) && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No laborers in this contract&apos;s team. Add laborers to the team in
            Workforce settings, then come back here.
          </Alert>
        )}

        {roster && roster.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }} alignItems="center">
              {roster.map((l) => {
                const present = presentIds.has(l.id);
                return (
                  <Chip
                    key={l.id}
                    label={l.name}
                    avatar={
                      <Avatar
                        sx={{
                          width: 22,
                          height: 22,
                          fontSize: "0.7rem",
                          bgcolor: present ? "success.main" : "grey.400",
                          color: "#fff",
                        }}
                      >
                        {present ? "✓" : l.name[0]?.toUpperCase()}
                      </Avatar>
                    }
                    onClick={() => togglePresence(l.id)}
                    sx={{
                      bgcolor: present ? "success.50" : "grey.100",
                      color: present ? "success.dark" : "text.disabled",
                      borderColor: present ? "success.main" : "divider",
                      cursor: "pointer",
                    }}
                  />
                );
              })}
              <Chip
                label="Add laborer"
                size="small"
                icon={<PersonAddIcon sx={{ fontSize: 16 }} />}
                variant="outlined"
                onClick={() => router.push("/company/laborers")}
                sx={{
                  borderStyle: "dashed",
                  cursor: "pointer",
                  color: "text.secondary",
                }}
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {presentCount} of {totalCount} present
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Roster pulls from the contract&apos;s team — add laborers to that team to see them here.
              </Typography>
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Day total + work done */}
        <Stack direction="row" spacing={1.5} sx={{ mb: 0.5 }}>
          <TextField
            label="Day total ₹ paid"
            type="number"
            value={dayTotal}
            onChange={(e) => setDayTotal(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            inputProps={{ min: 0, step: 100 }}
            placeholder="0"
            helperText="What you paid the crew for today's work"
          />
          <TextField
            label="Work done"
            type="number"
            value={workDone}
            onChange={(e) => setWorkDone(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              endAdornment: <InputAdornment position="end">days</InputAdornment>,
            }}
            inputProps={{ min: 0, step: 0.5 }}
            helperText="0.5 = half day, 1 = full day, 1.5 = day + half"
          />
        </Stack>

        {/* Note */}
        <TextField
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          size="small"
          multiline
          rows={2}
          sx={{ mb: 2 }}
          placeholder="What was done today, special notes…"
        />

        {saveMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Failed to save"}
          </Alert>
        )}

        {savedToast && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Saved.
          </Alert>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {presentCount} of {totalCount} came
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            ₹{formatINR(Number(dayTotal) || 0)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saveMutation.isPending}
            sx={{
              bgcolor: tradeColor.main,
              "&:hover": { bgcolor: tradeColor.dark },
              color: tradeColor.contrastText,
            }}
          >
            {saveMutation.isPending ? "Saving…" : existing ? "Update day" : "Save day"}
          </Button>
        </Stack>
      </Box>
    </Box>
  );

  return (
    <Drawer
      anchor={isMobile ? "bottom" : "right"}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: isMobile
          ? { height: "85vh", borderTopLeftRadius: 12, borderTopRightRadius: 12 }
          : { width: 480 },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
