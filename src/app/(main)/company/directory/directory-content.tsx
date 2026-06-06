"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Fab,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { FilterBar, type FilterChipDef } from "@/components/common/FilterBar";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useTechnicians,
  useDeleteTechnician,
} from "@/hooks/queries/useTechnicians";
import {
  canonicalTrade,
  sourceCountsOf,
  technicianToEntry,
  tradeChipsOf,
} from "@/lib/utils/directory";
import {
  SOURCE_META,
  type DirectoryEntry,
  type DirectorySource,
  type DirectoryPageData,
} from "@/types/directory.types";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import ContactDetailDrawer from "@/components/directory/ContactDetailDrawer";
import TechnicianFormDialog from "@/components/directory/TechnicianFormDialog";

const SOURCE_ORDER: DirectorySource[] = [
  "technician",
  "laborer",
  "mestri",
  "vendor",
];

const SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "worked", label: "Worked-with first" },
  { value: "type", label: "By type" },
];

interface DirectoryContentProps {
  initialData: DirectoryPageData;
}

export default function DirectoryContent({ initialData }: DirectoryContentProps) {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: techRows } = useTechnicians(initialData.technicians);
  const deleteMut = useDeleteTechnician();

  // State
  const [search, setSearch] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [sourceFilters, setSourceFilters] = useState<
    Record<DirectorySource, boolean>
  >({ technician: true, laborer: true, vendor: true, mestri: true });
  const [workedWithOnly, setWorkedWithOnly] = useState(false);
  const [sort, setSort] = useState("name");

  const [detailEntry, setDetailEntry] = useState<DirectoryEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DirectoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryEntry | null>(null);
  const [snack, setSnack] = useState("");

  // All entries = live technicians + the read-only server-rendered rest.
  const allEntries = useMemo<DirectoryEntry[]>(() => {
    const techEntries = (techRows ?? [])
      .filter((t) => t.is_active !== false)
      .map(technicianToEntry);
    return [...techEntries, ...initialData.entries];
  }, [techRows, initialData.entries]);

  const counts = useMemo(() => sourceCountsOf(allEntries), [allEntries]);
  const tradeChips = useMemo(() => tradeChipsOf(allEntries), [allEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const list = allEntries.filter((e) => {
      // Source filter (an alsoMestri laborer shows under laborer OR mestri)
      const sourceVisible =
        sourceFilters[e.source] ||
        (e.source === "laborer" && e.alsoMestri && sourceFilters.mestri);
      if (!sourceVisible) return false;

      if (workedWithOnly && !e.workedWith) return false;

      // Trade filter
      if (selectedTrades.size > 0) {
        const keys = [e.trade, ...e.secondaryTrades].map(canonicalTrade);
        if (!keys.some((k) => k && selectedTrades.has(k))) return false;
      }

      // Search
      if (q) {
        const hay = [e.name, e.trade, e.area, ...e.secondaryTrades]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const phoneDigits = `${e.phone ?? ""}${e.whatsapp ?? ""}`.replace(
          /\D/g,
          ""
        );
        const textMatch = hay.includes(q);
        const phoneMatch = qDigits.length >= 3 && phoneDigits.includes(qDigits);
        if (!textMatch && !phoneMatch) return false;
      }
      return true;
    });

    const byName = (a: DirectoryEntry, b: DirectoryEntry) =>
      a.name.localeCompare(b.name);
    list.sort((a, b) => {
      if (sort === "worked") {
        if (a.workedWith !== b.workedWith) return a.workedWith ? -1 : 1;
        return byName(a, b);
      }
      if (sort === "type") {
        const ai = SOURCE_ORDER.indexOf(a.source);
        const bi = SOURCE_ORDER.indexOf(b.source);
        if (ai !== bi) return ai - bi;
        return byName(a, b);
      }
      return byName(a, b);
    });
    return list;
  }, [allEntries, search, selectedTrades, sourceFilters, workedWithOnly, sort]);

  // Filter chips: one per source (with count) + a worked-with toggle.
  const filterChips: FilterChipDef[] = [
    ...SOURCE_ORDER.map((s) => ({
      key: `src:${s}`,
      label: `${SOURCE_META[s].plural} (${counts[s]})`,
      active: sourceFilters[s],
    })),
    { key: "flag:worked", label: "Worked with", active: workedWithOnly },
  ];

  const handleChipToggle = (key: string) => {
    if (key === "flag:worked") {
      setWorkedWithOnly((v) => !v);
      return;
    }
    if (key.startsWith("src:")) {
      const s = key.slice(4) as DirectorySource;
      setSourceFilters((prev) => ({ ...prev, [s]: !prev[s] }));
    }
  };

  const toggleTrade = (key: string) => {
    setSelectedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (entry: DirectoryEntry) => {
    setEditing(entry);
    setFormOpen(true);
    setDetailEntry(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.rawTechnician) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.rawTechnician.id);
      setSnack(`Removed ${deleteTarget.name}`);
      setDeleteTarget(null);
      setDetailEntry(null);
    } catch (e) {
      setSnack(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <Box sx={{ pb: { xs: 9, sm: 2 } }}>
      <PageHeader
        title="Directory"
        subtitle="Find a trade and call — technicians, laborers, vendors & mestris."
        actions={
          canEdit && !isMobile ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              Add technician
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, trade, area, phone…"
        filterChips={filterChips}
        onFilterChipToggle={handleChipToggle}
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={setSort}
      />

      {/* Trade chips */}
      {tradeChips.length > 0 ? (
        <Box
          sx={{
            display: "flex",
            gap: 0.75,
            overflowX: "auto",
            px: { xs: 1, sm: 1.5 },
            pb: 1,
            "&::-webkit-scrollbar": { height: 6 },
          }}
        >
          <Chip
            size="small"
            label="All trades"
            onClick={() => setSelectedTrades(new Set())}
            color={selectedTrades.size === 0 ? "primary" : "default"}
            variant={selectedTrades.size === 0 ? "filled" : "outlined"}
            sx={{ flexShrink: 0 }}
          />
          {tradeChips.map((t) => {
            const active = selectedTrades.has(t.key);
            return (
              <Chip
                key={t.key}
                size="small"
                label={`${t.label} (${t.count})`}
                onClick={() => toggleTrade(t.key)}
                color={active ? "primary" : "default"}
                variant={active ? "filled" : "outlined"}
                sx={{ flexShrink: 0 }}
              />
            );
          })}
        </Box>
      ) : null}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ px: { xs: 1, sm: 1.5 }, display: "block", mb: 1 }}
      >
        {filtered.length} {filtered.length === 1 ? "contact" : "contacts"}
      </Typography>

      {filtered.length === 0 ? (
        <Alert severity="info" sx={{ mx: { xs: 1, sm: 1.5 } }}>
          No contacts match your filters.
        </Alert>
      ) : (
        <Stack spacing={1} sx={{ px: { xs: 1, sm: 1.5 } }}>
          {filtered.map((entry) => (
            <DirectoryCard key={entry.id} entry={entry} onOpen={setDetailEntry} />
          ))}
        </Stack>
      )}

      {/* Mobile add FAB */}
      {canEdit && isMobile ? (
        <Fab
          color="primary"
          onClick={openAdd}
          sx={{ position: "fixed", bottom: 16, right: 16, zIndex: 1200 }}
          aria-label="Add technician"
        >
          <AddIcon />
        </Fab>
      ) : null}

      <ContactDetailDrawer
        entry={detailEntry}
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        onEdit={openEdit}
        onDelete={(e) => setDeleteTarget(e)}
        canEdit={canEdit}
        isMobile={isMobile}
      />

      <TechnicianFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing?.rawTechnician ?? null}
        tradeOptions={initialData.tradeOptions}
        onSaved={() => setSnack(editing ? "Saved changes" : "Technician added")}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Remove technician?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget?.name} will be removed from the directory. This can be
            restored later from the database if needed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            disabled={deleteMut.isPending}
          >
            {deleteMut.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack("")}
        message={snack}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
