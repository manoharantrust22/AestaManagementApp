"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  SwipeableDrawer,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
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
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useToast } from "@/contexts/ToastContext";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useSiteStock } from "@/hooks/queries/useStockInventory";
import { useCreateMaterialRequest } from "@/hooks/queries/useMaterialRequests";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
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
  const createRequest = useCreateMaterialRequest();

  const { data: groupMembership } = useSiteGroupMembership(selectedSite?.id);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [requestDate, setRequestDate] = useState<string>(todayIso());
  const [purchaseType, setPurchaseType] = useState<'own_site' | 'group_stock'>('own_site');
  const [payingSiteId, setPayingSiteId] = useState<string>("");
  const [pickerMaterial, setPickerMaterial] = useState<MaterialWithDetails | null>(null);
  const [pickerQty, setPickerQty] = useState(1);
  const isSubmittingRef = useRef(false);

  const stockByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    stockItems.forEach((s) => {
      map.set(s.material_id, (map.get(s.material_id) || 0) + (s.available_qty || 0));
    });
    return map;
  }, [stockItems]);

  const filteredMaterials = useMemo(() => {
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

  const cartTotalItems = cart.length;
  const isBackdated = requestDate !== todayIso();

  const openPicker = (material: MaterialWithDetails) => {
    const existing = cart.find((c) => c.material_id === material.id);
    setPickerMaterial(material);
    setPickerQty(existing?.qty || 1);
  };

  const closePicker = () => {
    setPickerMaterial(null);
    setPickerQty(1);
  };

  const addOrUpdateCart = () => {
    if (!pickerMaterial || pickerQty <= 0) return;
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.material_id === pickerMaterial.id);
      const next: CartItem = {
        material_id: pickerMaterial.id,
        material_name: pickerMaterial.name,
        unit: pickerMaterial.unit || "",
        qty: pickerQty,
      };
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = next;
        return copy;
      }
      return [...prev, next];
    });
    closePicker();
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

  const submitting = createRequest.isPending;

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
              p: 1.25,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={500} noWrap>
                {item.material_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.qty} {item.unit}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() =>
                openPicker({
                  id: item.material_id,
                  name: item.material_name,
                  unit: item.unit,
                } as MaterialWithDetails)
              }
              aria-label="Edit quantity"
            >
              <AddIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => removeFromCart(item.material_id)}
              aria-label="Remove"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))
      )}
    </Stack>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: !isDesktop && cart.length > 0 ? 22 : 4 }}>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ maxWidth: 1200, mx: "auto", width: "100%" }}>
          <IconButton edge="start" onClick={() => router.back()} aria-label="Back">
            <BackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Request Material
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
        {!selectedSite && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Select a site first.
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gap: { xs: 0, md: 3 },
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 360px" },
            alignItems: "start",
          }}
        >
          <Box>
            {!isDesktop && (
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                {dateInput}
                {purchaseTypeToggle}
              </Stack>
            )}

            <TextField
              fullWidth
              autoFocus
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

            <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 3, mb: 1 }}>
              {search ? `Results (${filteredMaterials.length})` : `All materials (${filteredMaterials.length})`}
            </Typography>

            {materialsLoading ? (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                Loading…
              </Typography>
            ) : filteredMaterials.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                {search ? `No materials match "${search}".` : "No materials available."}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {filteredMaterials.map((material) => {
                  const stock = stockByMaterial.get(material.id) || 0;
                  const inCart = cart.find((c) => c.material_id === material.id);
                  return (
                    <Card key={material.id} variant="outlined">
                      <CardActionArea
                        onClick={() => openPicker(material)}
                        sx={{
                          p: { xs: 2, md: 1.5 },
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={2}>
                          <Box
                            sx={{
                              width: { xs: 44, md: 36 },
                              height: { xs: 44, md: 36 },
                              borderRadius: 1.5,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              bgcolor: "action.hover",
                              color: "text.secondary",
                              flexShrink: 0,
                            }}
                          >
                            <MaterialIcon fontSize={isDesktop ? "small" : "medium"} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body1" fontWeight={500} noWrap>
                              {material.name}
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                              {material.unit && (
                                <Typography variant="caption" color="text.secondary">
                                  per {material.unit}
                                </Typography>
                              )}
                              {stock > 0 && (
                                <Chip
                                  size="small"
                                  label={`In stock: ${stock}`}
                                  color="success"
                                  variant="outlined"
                                  sx={{ height: 20 }}
                                />
                              )}
                            </Stack>
                          </Box>
                          {inCart ? (
                            <Chip
                              color="primary"
                              label={`${inCart.qty} ${inCart.unit}`}
                              sx={{ flexShrink: 0 }}
                            />
                          ) : (
                            <AddIcon color="action" />
                          )}
                        </Stack>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Box>

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
                {submitting ? "Sending…" : `Send request${cartTotalItems > 0 ? ` (${cartTotalItems})` : ""}`}
              </Button>
            </Box>
          )}
        </Box>
      </Box>

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
            p: 2,
            zIndex: 1100,
            boxShadow: "0 -4px 12px rgba(0,0,0,0.04)",
          }}
        >
          {isBackdated && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <CalendarIcon fontSize="small" color="warning" />
              <Typography variant="caption" color="warning.main" fontWeight={600}>
                Backdated to {formatDateLabel(requestDate)}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5 }}>
            {cart.map((item) => (
              <Chip
                key={item.material_id}
                label={`${item.qty} ${item.unit} · ${item.material_name}`}
                onDelete={() => removeFromCart(item.material_id)}
                deleteIcon={<DeleteIcon />}
                sx={{ flexShrink: 0 }}
              />
            ))}
          </Stack>
          <Button
            fullWidth
            size="large"
            variant="contained"
            disabled={submitting || !selectedSite?.id}
            onClick={handleSubmit}
            sx={{ height: 52, fontSize: 16, fontWeight: 600 }}
          >
            {submitting ? "Sending…" : `Send request (${cartTotalItems})`}
          </Button>
        </Box>
      )}

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
            <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">{pickerMaterial.name}</Typography>
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

            <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ my: 3 }}>
              <IconButton
                onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                size="large"
                sx={{ border: 1, borderColor: "divider", width: 56, height: 56 }}
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
                  style: { textAlign: "center", fontSize: 32, fontWeight: 600, padding: "8px 0", width: 100 },
                }}
                variant="standard"
              />
              <IconButton
                onClick={() => setPickerQty((q) => q + 1)}
                size="large"
                sx={{ border: 1, borderColor: "divider", width: 56, height: 56 }}
              >
                <AddIcon fontSize="large" />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center", mb: 3 }}>
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
              {cart.find((c) => c.material_id === pickerMaterial.id) ? "Update" : "Add to request"}
            </Button>
          </Box>
        )}
      </SwipeableDrawer>
    </Box>
  );
}
