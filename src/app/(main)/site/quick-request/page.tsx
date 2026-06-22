"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  SwipeableDrawer,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Inventory2 as MaterialIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  CalendarToday as CalendarIcon,
  ShoppingBasket as BasketIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useToast } from "@/contexts/ToastContext";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useSiteStock } from "@/hooks/queries/useStockInventory";
import {
  useCreateMaterialRequest,
  useFrequentMaterials,
} from "@/hooks/queries/useMaterialRequests";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { MaterialRequestRow } from "@/components/materials/quick-request/MaterialRequestRow";
import {
  CategoryChips,
  type CategoryChipOption,
  type CategoryChipValue,
} from "@/components/materials/quick-request/CategoryChips";
import { FrequentMaterials } from "@/components/materials/quick-request/FrequentMaterials";
import {
  categoryTabIdForCode,
  categorySectionLabel,
  CATEGORY_SECTION_ORDER,
  CATEGORY_COLORS,
  type CategorySectionId,
} from "@/lib/constants/materialCategories";
import type { MaterialWithDetails } from "@/types/material.types";

interface CartItem {
  material_id: string;
  material_name: string;
  unit: string;
  qty: number;
}

const QUICK_QTY_PRESETS = [1, 5, 10, 25, 50];

const todayIso = () => new Date().toISOString().split("T")[0];

const formatDateLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
};

export default function QuickRequestPage() {
  const router = useRouter();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const { showSuccess, showError } = useToast();

  const { data: materials = [], isLoading: materialsLoading } = useMaterials();
  const { data: stockItems = [] } = useSiteStock(selectedSite?.id);
  const { data: frequentRaw = [] } = useFrequentMaterials(selectedSite?.id, 6);
  const createRequest = useCreateMaterialRequest();

  const { data: groupMembership } = useSiteGroupMembership(selectedSite?.id);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryChipValue>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [requestDate, setRequestDate] = useState<string>(todayIso());
  const [purchaseType, setPurchaseType] = useState<"own_site" | "group_stock">("own_site");
  const [deliveryType, setDeliveryType] = useState<"one_time" | "bulk">("one_time");
  const [payingSiteId, setPayingSiteId] = useState<string>("");
  const [pickerMaterial, setPickerMaterial] = useState<MaterialWithDetails | null>(null);
  const [pickerQty, setPickerQty] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isSubmittingRef = useRef(false);

  const stockByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    stockItems.forEach((s) => {
      map.set(s.material_id, (map.get(s.material_id) || 0) + (s.available_qty || 0));
    });
    return map;
  }, [stockItems]);

  const materialById = useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials]
  );

  const cartByMaterial = useMemo(
    () => new Map(cart.map((c) => [c.material_id, c])),
    [cart]
  );
  const cartIds = useMemo(() => new Set(cart.map((c) => c.material_id)), [cart]);

  // Search + sort (in-stock first, then alphabetical) — category grouping happens after.
  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...materials].sort((a, b) => {
      const stockA = stockByMaterial.get(a.id) || 0;
      const stockB = stockByMaterial.get(b.id) || 0;
      if (stockA !== stockB) return stockB - stockA;
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.code || "").toLowerCase().includes(q)
    );
  }, [materials, search, stockByMaterial]);

  const sectionOf = (m: MaterialWithDetails): CategorySectionId =>
    categoryTabIdForCode(m.category?.code);

  // Category chips with counts over the current search results.
  const chipOptions = useMemo<CategoryChipOption[]>(() => {
    const counts = new Map<CategorySectionId, number>();
    for (const m of searchFiltered) {
      const s = sectionOf(m);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const opts: CategoryChipOption[] = [
      { id: "all", label: "All", count: searchFiltered.length },
    ];
    for (const id of CATEGORY_SECTION_ORDER) {
      const c = counts.get(id) || 0;
      // Keep the selected chip visible even if a search drops its count to 0,
      // so the user never lands in a chip-less dead end.
      if (c > 0 || id === selectedCategory) {
        opts.push({ id, label: categorySectionLabel(id), count: c });
      }
    }
    return opts;
  }, [searchFiltered, selectedCategory]);

  // Grouped (chip = All) or single-section (specific chip) view.
  const groups = useMemo(() => {
    if (selectedCategory !== "all") {
      const items = searchFiltered.filter((m) => sectionOf(m) === selectedCategory);
      return [
        {
          id: selectedCategory,
          label: categorySectionLabel(selectedCategory),
          items,
        },
      ];
    }
    const bySection = new Map<CategorySectionId, MaterialWithDetails[]>();
    for (const m of searchFiltered) {
      const s = sectionOf(m);
      if (!bySection.has(s)) bySection.set(s, []);
      bySection.get(s)!.push(m);
    }
    return CATEGORY_SECTION_ORDER.filter((id) => bySection.has(id)).map((id) => ({
      id,
      label: categorySectionLabel(id),
      items: bySection.get(id)!,
    }));
  }, [searchFiltered, selectedCategory]);

  const visibleCount = useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups]
  );

  const frequentMaterials = useMemo(
    () =>
      frequentRaw
        .map((f) => materialById.get(f.material_id))
        .filter((m): m is MaterialWithDetails => !!m),
    [frequentRaw, materialById]
  );
  const showFrequent =
    !search.trim() && selectedCategory === "all" && frequentMaterials.length > 0;

  const cartTotalItems = cart.length;
  const isBackdated = requestDate !== todayIso();
  const submitting = createRequest.isPending;

  const openPicker = (material: MaterialWithDetails) => {
    const existing = cartByMaterial.get(material.id);
    setPickerMaterial(material);
    setPickerQty(existing?.qty || 1);
  };

  const openPickerById = (materialId: string, fallback?: Partial<MaterialWithDetails>) => {
    const full = materialById.get(materialId);
    if (full) {
      openPicker(full);
    } else if (fallback) {
      openPicker(fallback as MaterialWithDetails);
    }
  };

  const closePicker = () => {
    setPickerMaterial(null);
    setPickerQty(1);
  };

  const addOrUpdateCart = () => {
    if (!pickerMaterial || pickerQty <= 0) return;
    setQty(pickerMaterial, pickerQty);
    closePicker();
  };

  // Set the cart quantity for a material (qty <= 0 removes it). Used by the
  // inline row stepper and the picker.
  const setQty = (material: Pick<MaterialWithDetails, "id" | "name" | "unit">, qty: number) => {
    if (qty <= 0) {
      removeFromCart(material.id);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.material_id === material.id);
      const next: CartItem = {
        material_id: material.id,
        material_name: material.name,
        unit: material.unit || "",
        qty,
      };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      }
      return [...prev, next];
    });
  };

  const removeFromCart = (materialId: string) => {
    setCart((prev) => prev.filter((c) => c.material_id !== materialId));
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    if (!userProfile?.id) {
      showError("You must be signed in.");
      return;
    }
    if (!selectedSite?.id) {
      showError("Pick a site first.");
      return;
    }
    if (cart.length === 0) return;

    isSubmittingRef.current = true;
    try {
      await createRequest.mutateAsync({
        site_id: selectedSite.id,
        requested_by: userProfile.id,
        request_date: requestDate,
        purchase_type: purchaseType,
        delivery_type: deliveryType,
        payment_source_site_id:
          purchaseType === "group_stock" ? payingSiteId || selectedSite.id : null,
        priority: "normal",
        items: cart.map((c) => ({
          material_id: c.material_id,
          requested_qty: c.qty,
        })),
      });
      const datePart = isBackdated ? ` for ${formatDateLabel(requestDate)}` : "";
      showSuccess(
        cart.length === 1
          ? `Request sent${datePart}: ${cart[0].qty} ${cart[0].unit} ${cart[0].material_name}`
          : `Request sent${datePart} for ${cart.length} materials`
      );
      router.push("/site/material-requests");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send request";
      showError(message);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Reusable request-settings fields (date + purchase-for) ────────────────
  const dateInput = (
    <TextField
      type="date"
      size="small"
      fullWidth
      label="Request date"
      value={requestDate}
      onChange={(e) => setRequestDate(e.target.value || todayIso())}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { max: todayIso() },
      }}
      helperText={
        isBackdated
          ? `Backdated to ${formatDateLabel(requestDate)}`
          : "Defaults to today — change to backfill old entries"
      }
    />
  );

  const purchaseTypeToggle = groupMembership?.isInGroup ? (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Purchase for
      </Typography>
      <ToggleButtonGroup
        value={purchaseType}
        exclusive
        onChange={(_, val) => {
          if (!val) return;
          setPurchaseType(val);
          if (val === "group_stock" && !payingSiteId) setPayingSiteId(selectedSite?.id ?? "");
        }}
        size="small"
        fullWidth
      >
        <ToggleButton value="own_site">This site only</ToggleButton>
        <ToggleButton value="group_stock">Group stock</ToggleButton>
      </ToggleButtonGroup>
      {purchaseType === "group_stock" && (
        <TextField
          select
          fullWidth
          size="small"
          label="Paying site (payer)"
          value={payingSiteId || selectedSite?.id || ""}
          onChange={(e) => setPayingSiteId(e.target.value)}
          sx={{ mt: 1.5 }}
          helperText={`Payer = whose money is used. Requested for ${
            selectedSite?.name ?? "this site"
          } (debtor).`}
        >
          {(groupMembership?.allSites ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
              {s.id === selectedSite?.id ? " (this site)" : ""}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  ) : null;

  // Regular vs bulk-advance: shown for ALL sites (not gated on group membership).
  // Bulk advance = a large discounted buy the vendor delivers part-by-part; it
  // flows to the PO as payment_timing='advance'. Regular = delivered & settled now.
  const deliveryTypeToggle = (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Type
      </Typography>
      <ToggleButtonGroup
        value={deliveryType}
        exclusive
        onChange={(_, val) => {
          if (!val) return;
          setDeliveryType(val);
        }}
        size="small"
        fullWidth
      >
        <ToggleButton value="one_time">Regular</ToggleButton>
        <ToggleButton value="bulk">Bulk advance</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        Bulk advance = buy a large qty (often discounted); vendor delivers part-by-part.
      </Typography>
    </Box>
  );

  const settingsSummaryLabel = `${formatDateLabel(requestDate)}${
    groupMembership?.isInGroup && purchaseType === "group_stock" ? " · Group" : ""
  }${deliveryType === "bulk" ? " · Bulk advance" : ""}`;

  // ── Cart list (used in desktop sidebar + mobile review sheet) ─────────────
  const cartList = (
    <Stack spacing={1}>
      {cart.length === 0 ? (
        <Box
          sx={{
            py: 4,
            textAlign: "center",
            color: "text.secondary",
            border: 1,
            borderStyle: "dashed",
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          <BasketIcon sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
          <Typography variant="body2">Tap a material to add it.</Typography>
        </Box>
      ) : (
        cart.map((item) => (
          <Stack
            key={item.material_id}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              p: 1,
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              bgcolor: "background.paper",
            }}
          >
            <EntityImageAvatar
              src={materialById.get(item.material_id)?.image_url}
              name={item.material_name}
              size={40}
              radius={1.25}
              fallbackIcon={<MaterialIcon />}
              tint="primary"
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {item.material_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.qty} {item.unit}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() =>
                openPickerById(item.material_id, {
                  id: item.material_id,
                  name: item.material_name,
                  unit: item.unit as MaterialWithDetails["unit"],
                })
              }
              aria-label={`Edit quantity for ${item.material_name}`}
            >
              <AddIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => removeFromCart(item.material_id)}
              aria-label={`Remove ${item.material_name}`}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))
      )}
    </Stack>
  );

  // ── Material list (grouped image rows) ────────────────────────────────────
  const renderRows = (items: MaterialWithDetails[]) => (
    <Stack spacing={1}>
      {items.map((material) => (
        <MaterialRequestRow
          key={material.id}
          material={material}
          stock={stockByMaterial.get(material.id) || 0}
          cartQty={cartByMaterial.get(material.id)?.qty ?? null}
          onOpenPicker={() => openPicker(material)}
          onChangeQty={(qty) => setQty(material, qty)}
        />
      ))}
    </Stack>
  );

  const materialList = materialsLoading ? (
    <Stack spacing={1}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 1.5 }} />
      ))}
    </Stack>
  ) : visibleCount === 0 ? (
    <Box sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
      <MaterialIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
      <Typography color="text.secondary">
        {search
          ? `No materials match "${search}".`
          : selectedCategory !== "all"
            ? `No materials in ${categorySectionLabel(selectedCategory)}.`
            : "No materials available."}
      </Typography>
    </Box>
  ) : (
    <Stack spacing={2.5}>
      {groups.map((group) => (
        <Box key={group.id}>
          {selectedCategory === "all" && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor:
                    (CATEGORY_COLORS[group.id] ?? CATEGORY_COLORS.other).color,
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="overline"
                sx={{ fontWeight: 700, color: "text.secondary", letterSpacing: 0.5 }}
              >
                {group.label} ({group.items.length})
              </Typography>
              <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            </Stack>
          )}
          {renderRows(group.items)}
        </Box>
      ))}
    </Stack>
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        pb:
          !isDesktop && cart.length > 0
            ? "calc(96px + env(safe-area-inset-bottom))"
            : 4,
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        {/* Slim in-flow page header (no second AppBar — the app shell already
            renders the top bar). */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ px: { xs: 0.5, md: 1 }, pt: 0.5, pb: 1 }}
        >
          <IconButton onClick={() => router.back()} aria-label="Back">
            <BackIcon />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              Request Material
            </Typography>
            {selectedSite && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {selectedSite.name}
              </Typography>
            )}
          </Box>
        </Stack>

        <Box sx={{ px: { xs: 0.5, md: 1 } }}>
          {!selectedSite && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Select a site first.
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gap: { xs: 0, md: 3 },
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                md: "minmax(0, 1fr) 360px",
              },
              alignItems: "start",
            }}
          >
            {/* Main column */}
            <Box sx={{ minWidth: 0 }}>
              {/* Sticky toolbar: search + (mobile) settings chip + category chips */}
              <Box
                sx={{
                  position: "sticky",
                  top: { xs: 56, sm: 64 },
                  zIndex: (t) => t.zIndex.appBar - 1,
                  bgcolor: "background.default",
                  pt: 1,
                  pb: 1,
                  mb: 1,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    placeholder="Search material…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  {!isDesktop && (
                    <Button
                      onClick={() => setSettingsOpen(true)}
                      variant="outlined"
                      color={isBackdated ? "warning" : "inherit"}
                      startIcon={<CalendarIcon />}
                      endIcon={<ExpandMoreIcon />}
                      sx={{
                        flexShrink: 0,
                        minHeight: 40,
                        whiteSpace: "nowrap",
                        textTransform: "none",
                        borderColor: "divider",
                        color: isBackdated ? "warning.main" : "text.secondary",
                      }}
                      aria-label="Request settings"
                    >
                      {settingsSummaryLabel}
                    </Button>
                  )}
                </Stack>
                <Box sx={{ mt: 1 }}>
                  <CategoryChips
                    options={chipOptions}
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                  />
                </Box>
              </Box>

              {showFrequent && (
                <FrequentMaterials
                  materials={frequentMaterials}
                  cartIds={cartIds}
                  onSelect={openPicker}
                />
              )}

              {materialList}
            </Box>

            {/* Desktop sidebar: settings + cart + send */}
            {isDesktop && (
              <Box
                component="aside"
                sx={{
                  position: "sticky",
                  top: 80,
                  alignSelf: "start",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  bgcolor: "background.paper",
                  p: 2.5,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Request details
                  </Typography>
                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    {dateInput}
                    {purchaseTypeToggle}
                    {deliveryTypeToggle}
                  </Stack>
                </Box>

                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <BasketIcon fontSize="small" color="action" />
                    <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
                      Your request {cartTotalItems > 0 && `(${cartTotalItems})`}
                    </Typography>
                  </Stack>
                  {cartList}
                </Box>

                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  disabled={submitting || !selectedSite?.id || cart.length === 0}
                  onClick={handleSubmit}
                  sx={{ height: 48, fontSize: 15, fontWeight: 600 }}
                >
                  {submitting
                    ? "Sending…"
                    : `Send request${cartTotalItems > 0 ? ` (${cartTotalItems})` : ""}`}
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Mobile sticky bottom review bar */}
      {!isDesktop && cart.length > 0 && (
        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            bgcolor: "background.paper",
            borderTop: 1,
            borderColor: "divider",
            px: 2,
            pt: 1.5,
            pb: "calc(12px + env(safe-area-inset-bottom))",
            zIndex: 1200,
            boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
          }}
        >
          <Button
            fullWidth
            size="large"
            variant="contained"
            onClick={() => setReviewOpen(true)}
            startIcon={<BasketIcon />}
            endIcon={<ChevronRightIcon />}
            sx={{ height: 52, fontSize: 16, fontWeight: 700, justifyContent: "center" }}
          >
            {cartTotalItems} {cartTotalItems === 1 ? "item" : "items"} · Review &amp; send
          </Button>
        </Box>
      )}

      {/* Mobile request-settings drawer */}
      <SwipeableDrawer
        anchor="bottom"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpen={() => {}}
        disableSwipeToOpen
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "90vh",
              maxWidth: { xs: "100%", md: 480 },
              mx: { xs: 0, md: "auto" },
            },
          },
        }}
      >
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              Request settings
            </Typography>
            <IconButton onClick={() => setSettingsOpen(false)} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Stack spacing={2}>
            {dateInput}
            {purchaseTypeToggle}
            {deliveryTypeToggle}
          </Stack>
          <Button
            fullWidth
            size="large"
            variant="contained"
            onClick={() => setSettingsOpen(false)}
            sx={{ mt: 3, height: 48, fontWeight: 600 }}
          >
            Done
          </Button>
        </Box>
      </SwipeableDrawer>

      {/* Mobile review & send sheet */}
      <SwipeableDrawer
        anchor="bottom"
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onOpen={() => {}}
        disableSwipeToOpen
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "92vh",
              maxWidth: { xs: "100%", md: 480 },
              mx: { xs: 0, md: "auto" },
            },
          },
        }}
      >
        <Box sx={{ p: 2.5, pb: "calc(20px + env(safe-area-inset-bottom))" }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              Review request
            </Typography>
            <IconButton onClick={() => setReviewOpen(false)} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Stack>

          {isBackdated && (
            <Alert
              severity="warning"
              icon={<CalendarIcon fontSize="small" />}
              sx={{ mb: 2, py: 0.5 }}
            >
              Backdated to {formatDateLabel(requestDate)}
            </Alert>
          )}

          <Stack spacing={2} sx={{ mb: 2 }}>
            {dateInput}
            {purchaseTypeToggle}
            {deliveryTypeToggle}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {cartTotalItems} {cartTotalItems === 1 ? "material" : "materials"}
          </Typography>
          {cartList}

          <Button
            fullWidth
            size="large"
            variant="contained"
            disabled={submitting || !selectedSite?.id || cart.length === 0}
            onClick={handleSubmit}
            sx={{ mt: 3, height: 52, fontSize: 16, fontWeight: 700 }}
          >
            {submitting ? "Sending…" : `Send request (${cartTotalItems})`}
          </Button>
        </Box>
      </SwipeableDrawer>

      {/* Quantity picker */}
      <SwipeableDrawer
        anchor="bottom"
        open={!!pickerMaterial}
        onClose={closePicker}
        onOpen={() => {}}
        disableSwipeToOpen
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "90vh",
              maxWidth: { xs: "100%", md: 480 },
              mx: { xs: 0, md: "auto" },
            },
          },
        }}
      >
        {pickerMaterial && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <EntityImageAvatar
                src={pickerMaterial.image_url}
                name={pickerMaterial.name}
                size={48}
                radius={1.5}
                fallbackIcon={<MaterialIcon />}
                tint="primary"
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap>
                  {pickerMaterial.name}
                </Typography>
                {pickerMaterial.unit && (
                  <Typography variant="caption" color="text.secondary">
                    Quantity in {pickerMaterial.unit}
                  </Typography>
                )}
              </Box>
              <IconButton onClick={closePicker} aria-label="Close">
                <CloseIcon />
              </IconButton>
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              spacing={2}
              sx={{ my: 3 }}
            >
              <IconButton
                onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                size="large"
                sx={{ border: 1, borderColor: "divider", width: 56, height: 56 }}
                aria-label="Decrease quantity"
              >
                <RemoveIcon fontSize="large" />
              </IconButton>
              <TextField
                value={pickerQty}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setPickerQty(isNaN(v) || v < 0 ? 0 : v);
                }}
                inputProps={{
                  inputMode: "decimal",
                  "aria-label": "Quantity",
                  style: {
                    textAlign: "center",
                    fontSize: 32,
                    fontWeight: 600,
                    padding: "8px 0",
                    width: 100,
                  },
                }}
                variant="standard"
              />
              <IconButton
                onClick={() => setPickerQty((q) => q + 1)}
                size="large"
                sx={{ border: 1, borderColor: "divider", width: 56, height: 56 }}
                aria-label="Increase quantity"
              >
                <AddIcon fontSize="large" />
              </IconButton>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: "wrap", justifyContent: "center", mb: 3 }}
            >
              {QUICK_QTY_PRESETS.map((n) => (
                <Chip
                  key={n}
                  label={n}
                  onClick={() => setPickerQty(n)}
                  variant={pickerQty === n ? "filled" : "outlined"}
                  color={pickerQty === n ? "primary" : "default"}
                  sx={{ minWidth: 56 }}
                />
              ))}
            </Stack>

            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={pickerQty <= 0}
              onClick={addOrUpdateCart}
              sx={{ height: 52, fontSize: 16, fontWeight: 600 }}
            >
              {cartByMaterial.has(pickerMaterial.id) ? "Update" : "Add to request"}
            </Button>
          </Box>
        )}
      </SwipeableDrawer>
    </Box>
  );
}
