"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
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
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Handyman as HandymanIcon,
  Storefront as StorefrontIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { FilterBar, type FilterChipDef } from "@/components/common/FilterBar";
import { ViewToggle, type ViewMode } from "@/components/common/ViewToggle";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useTechnicians,
  useDeleteTechnician,
} from "@/hooks/queries/useTechnicians";
import { useVendor, useDeleteVendor } from "@/hooks/queries/useVendors";
import {
  canonicalTrade,
  sourceCountsOf,
  technicianToEntry,
  tradeChipsOf,
} from "@/lib/utils/directory";
import {
  SOURCE_META,
  type ContactKind,
  type DirectoryEntry,
  type DirectorySource,
  type DirectoryPageData,
} from "@/types/directory.types";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { DirectoryGridCard } from "@/components/directory/DirectoryGridCard";
import ContactDetailDrawer from "@/components/directory/ContactDetailDrawer";
import TechnicianFormDialog from "@/components/directory/TechnicianFormDialog";
import VendorDialog from "@/components/materials/VendorDialog";

const SOURCE_ORDER: DirectorySource[] = [
  "technician",
  "brand",
  "laborer",
  "mestri",
  "vendor",
];

const SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "worked", label: "Worked-with first" },
  { value: "type", label: "By type" },
];

const VIEW_MODE_KEY = "directory_view_mode";

interface DirectoryContentProps {
  initialData: DirectoryPageData;
}

export default function DirectoryContent({ initialData }: DirectoryContentProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: techRows } = useTechnicians(initialData.technicians);
  const deleteMut = useDeleteTechnician();
  const deleteVendorMut = useDeleteVendor();

  // View mode — default to the card grid; rehydrate the saved choice after mount.
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, []);
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  // State
  const [search, setSearch] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [sourceFilters, setSourceFilters] = useState<
    Record<DirectorySource, boolean>
  >({ technician: true, brand: true, laborer: true, vendor: true, mestri: true });
  const [workedWithOnly, setWorkedWithOnly] = useState(false);
  const [sort, setSort] = useState("name");

  const [detailEntry, setDetailEntry] = useState<DirectoryEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DirectoryEntry | null>(null);
  const [addKind, setAddKind] = useState<ContactKind>("technician");
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryEntry | null>(null);
  const [snack, setSnack] = useState("");

  // Shared per-entry ⋮ menu (one instance serves both the list and grid views).
  const [entryMenu, setEntryMenu] = useState<{
    anchorEl: HTMLElement;
    entry: DirectoryEntry;
  } | null>(null);
  const openEntryMenu = useCallback(
    (anchorEl: HTMLElement, entry: DirectoryEntry) =>
      setEntryMenu({ anchorEl, entry }),
    []
  );

  // Vendor in-place edit / delete (reuses the vendors page dialog + mutations).
  const [vendorEditId, setVendorEditId] = useState<string | null>(null);
  const { data: vendorToEdit } = useVendor(vendorEditId ?? undefined);
  const [vendorDeleteTarget, setVendorDeleteTarget] =
    useState<DirectoryEntry | null>(null);

  // All entries = live technicians + the read-only server-rendered rest.
  const allEntries = useMemo<DirectoryEntry[]>(() => {
    const techEntries = (techRows ?? [])
      .filter((t) => t.is_active !== false)
      .map(technicianToEntry);
    return [...techEntries, ...initialData.entries];
  }, [techRows, initialData.entries]);

  const counts = useMemo(() => sourceCountsOf(allEntries), [allEntries]);
  const tradeChips = useMemo(() => tradeChipsOf(allEntries), [allEntries]);

  // Dialog dropdown options: the curated list ∪ every trade already in use, so
  // a trade typed once reappears next time (the list self-curates). Deduped by
  // canonical key, curated entries first.
  const formTradeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const label of [
      ...initialData.tradeOptions,
      ...tradeChips.map((c) => c.label),
    ]) {
      const key = canonicalTrade(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  }, [initialData.tradeOptions, tradeChips]);

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

  const openAdd = (kind: ContactKind) => {
    setEditing(null);
    setAddKind(kind);
    setAddMenuAnchor(null);
    setFormOpen(true);
  };
  // Edit/delete branch by source: technicians & brands use the technician form,
  // vendors reuse the vendors page dialog. (Laborers/mestris only deep-link.)
  const handleEdit = (entry: DirectoryEntry) => {
    setDetailEntry(null);
    if (entry.source === "vendor") {
      setVendorEditId(entry.sourceRowId);
      return;
    }
    setEditing(entry);
    setFormOpen(true);
  };

  const handleDeleteRequest = (entry: DirectoryEntry) => {
    if (entry.source === "vendor") setVendorDeleteTarget(entry);
    else setDeleteTarget(entry);
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

  const confirmVendorDelete = async () => {
    if (!vendorDeleteTarget) return;
    try {
      await deleteVendorMut.mutateAsync(vendorDeleteTarget.sourceRowId);
      setSnack(`Removed ${vendorDeleteTarget.name}`);
      setVendorDeleteTarget(null);
      setDetailEntry(null);
      router.refresh(); // vendor entries are server-loaded — refetch them
    } catch (e) {
      setSnack(e instanceof Error ? e.message : "Failed to delete vendor");
    }
  };

  /** Close the ⋮ menu, then run the action. */
  const closeMenuThen = (fn: () => void) => () => {
    setEntryMenu(null);
    fn();
  };

  return (
    <Box sx={{ pb: { xs: 9, sm: 2 } }}>
      <PageHeader
        title="Directory"
        subtitle="Find a trade and call — technicians, brands, laborers, vendors & mestris."
        actions={
          canEdit && !isMobile ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={(e) => setAddMenuAnchor(e.currentTarget)}
            >
              Add contact
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
        viewToggle={
          <ViewToggle
            value={viewMode}
            onChange={handleViewModeChange}
            modes={["list", "grid"]}
          />
        }
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
      ) : viewMode === "list" ? (
        <Stack spacing={1} sx={{ px: { xs: 1, sm: 1.5 } }}>
          {filtered.map((entry) => (
            <DirectoryCard
              key={entry.id}
              entry={entry}
              onOpen={setDetailEntry}
              onMenuOpen={canEdit ? openEntryMenu : undefined}
            />
          ))}
        </Stack>
      ) : (
        <Box
          sx={{
            px: { xs: 1, sm: 1.5 },
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, 1fr)",
              sm: "repeat(3, 1fr)",
              md: "repeat(4, 1fr)",
              lg: "repeat(5, 1fr)",
            },
            gap: 1.25,
          }}
        >
          {filtered.map((entry) => (
            <DirectoryGridCard
              key={entry.id}
              entry={entry}
              onOpen={setDetailEntry}
              onMenuOpen={canEdit ? openEntryMenu : undefined}
            />
          ))}
        </Box>
      )}

      {/* Mobile add FAB */}
      {canEdit && isMobile ? (
        <Fab
          color="primary"
          onClick={(e) => setAddMenuAnchor(e.currentTarget)}
          sx={{ position: "fixed", bottom: 16, right: 16, zIndex: 1200 }}
          aria-label="Add contact"
        >
          <AddIcon />
        </Fab>
      ) : null}

      {/* Add menu — technician vs brand contact */}
      <Menu
        anchorEl={addMenuAnchor}
        open={!!addMenuAnchor}
        onClose={() => setAddMenuAnchor(null)}
      >
        <MenuItem onClick={() => openAdd("technician")}>
          <ListItemIcon>
            <HandymanIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Add technician"
            secondary="A person you call for work"
          />
        </MenuItem>
        <MenuItem onClick={() => openAdd("brand")}>
          <ListItemIcon>
            <StorefrontIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Add brand contact"
            secondary="A brand's enquiry / care line"
          />
        </MenuItem>
      </Menu>

      {/* Per-entry ⋮ menu — shared by the list rows and grid cards */}
      <Menu
        anchorEl={entryMenu?.anchorEl ?? null}
        open={!!entryMenu}
        onClose={() => setEntryMenu(null)}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        {entryMenu &&
        (entryMenu.entry.source === "technician" ||
          entryMenu.entry.source === "brand" ||
          entryMenu.entry.source === "vendor")
          ? [
              <MenuItem
                key="edit"
                onClick={closeMenuThen(() => handleEdit(entryMenu.entry))}
              >
                <ListItemIcon>
                  <EditIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Edit" />
              </MenuItem>,
              <MenuItem
                key="delete"
                onClick={closeMenuThen(() => handleDeleteRequest(entryMenu.entry))}
                sx={{ color: "error.main" }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" sx={{ color: "error.main" }} />
                </ListItemIcon>
                <ListItemText primary="Delete" />
              </MenuItem>,
            ]
          : entryMenu
            ? [
                <MenuItem
                  key="deep"
                  component={NextLink}
                  href={
                    entryMenu.entry.source === "laborer"
                      ? "/company/laborers"
                      : "/company/teams"
                  }
                  onClick={() => setEntryMenu(null)}
                >
                  <ListItemIcon>
                    <OpenInNewIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      entryMenu.entry.source === "laborer"
                        ? "Edit on laborers page"
                        : "Edit on teams page"
                    }
                  />
                </MenuItem>,
              ]
            : null}
      </Menu>

      <ContactDetailDrawer
        entry={detailEntry}
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        canEdit={canEdit}
        isMobile={isMobile}
      />

      <TechnicianFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing?.rawTechnician ?? null}
        tradeOptions={formTradeOptions}
        defaultKind={addKind}
        onSaved={(kind) =>
          setSnack(
            editing
              ? "Saved changes"
              : kind === "brand"
                ? "Brand contact added"
                : "Technician added"
          )
        }
      />

      {/* Vendor in-place edit — the vendors page dialog, fed by a fetch-by-id.
          Opens once the row arrives so it never flashes "Add New Vendor". */}
      <VendorDialog
        open={!!vendorEditId && !!vendorToEdit}
        vendor={vendorToEdit ?? null}
        onClose={() => setVendorEditId(null)}
        onSaved={() => {
          setSnack("Vendor updated");
          router.refresh(); // vendor entries are server-loaded — refetch them
        }}
      />

      <ConfirmDialog
        open={!!vendorDeleteTarget}
        title="Delete Vendor"
        message={`Delete "${vendorDeleteTarget?.name ?? ""}"? The vendor will be removed from the active list (their purchase history is kept).`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteVendorMut.isPending}
        onConfirm={confirmVendorDelete}
        onCancel={() => setVendorDeleteTarget(null)}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>
          {deleteTarget?.source === "brand"
            ? "Remove brand contact?"
            : "Remove technician?"}
        </DialogTitle>
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
