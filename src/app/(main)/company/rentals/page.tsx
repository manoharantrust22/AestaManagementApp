// src/app/(main)/company/rentals/page.tsx
"use client";

import { useState, useDeferredValue } from "react";
import {
  Box,
  Button,
  Card,
  Chip,
  Grid,
  InputAdornment,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Badge,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import StoreIcon from "@mui/icons-material/Store";
import AddIcon from "@mui/icons-material/Add";
import { useRentalItemsWithVendorStats, useRentalCategories } from "@/hooks/queries/useRentals";
import { useVendors } from "@/hooks/queries/useVendors";
import { RentalItemCard } from "@/components/rentals/RentalItemCard";
import { RentalItemDialog } from "@/components/rentals";
import { RentalItemInspectPane } from "@/components/rentals/RentalItemInspectPane";
import { VendorInspectPane } from "@/components/vendors/VendorInspectPane";
import { EstimateBasketDrawer } from "@/components/rentals/EstimateBasketDrawer";
import { EstimateBasketProvider, useEstimateBasket } from "@/components/rentals/EstimateBasket";
import type { RentalItemWithDetails } from "@/types/rental.types";

// ─── INNER PAGE (inside provider) ────────────────────────────────────────────

type CatalogView = "items" | "vendors";

function CompanyRentalsPageInner() {
  const [view, setView] = useState<CatalogView>("items");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [selectedItem, setSelectedItem] = useState<RentalItemWithDetails | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const { itemCount, addItem } = useEstimateBasket();
  const { data: categories = [] } = useRentalCategories();
  const { data: items = [], isLoading } = useRentalItemsWithVendorStats(categoryFilter);
  const { data: allVendors = [] } = useVendors();
  const rentalStoreVendors = allVendors.filter((v) => v.vendor_type === "rental_store");

  const filteredItems =
    deferredSearch.length >= 2
      ? items.filter(
          (i) =>
            i.name.toLowerCase().includes(deferredSearch.toLowerCase()) ||
            (i.code ?? "").toLowerCase().includes(deferredSearch.toLowerCase())
        )
      : items;

  const handleConvertToRequest = () => {
    setBasketOpen(false);
    // Phase 2 will navigate to /site/rentals with basket pre-filled
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top bar */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="h6" fontWeight={700} sx={{ flex: "none" }}>
          Rental Catalog
        </Typography>

        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => {
            if (v) {
              setView(v);
              setSelectedItem(null);
              setSelectedVendorId(null);
            }
          }}
          size="small"
          sx={{ flex: "none" }}
        >
          <ToggleButton value="items">
            <ViewModuleIcon sx={{ fontSize: 16, mr: 0.5 }} />
            By Item
          </ToggleButton>
          <ToggleButton value="vendors">
            <StoreIcon sx={{ fontSize: 16, mr: 0.5 }} />
            By Vendor
          </ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: 1, minWidth: 160, maxWidth: 280 }}
        />

        <Badge badgeContent={itemCount} color="warning" sx={{ flex: "none" }}>
          <Button
            variant={itemCount > 0 ? "contained" : "outlined"}
            color="warning"
            startIcon={<ShoppingCartIcon />}
            onClick={() => setBasketOpen(true)}
            size="small"
          >
            Estimate Basket
          </Button>
        </Badge>

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setAddItemOpen(true)}
          size="small"
          sx={{ flex: "none" }}
        >
          Add Item
        </Button>
      </Box>

      {/* Category chips */}
      {view === "items" && (
        <Box
          sx={{
            px: 2,
            py: 1,
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Chip
            label="All"
            onClick={() => setCategoryFilter(null)}
            color={categoryFilter === null ? "primary" : "default"}
            size="small"
          />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              onClick={() => setCategoryFilter(cat.id)}
              color={categoryFilter === cat.id ? "primary" : "default"}
              size="small"
            />
          ))}
        </Box>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {view === "items" && (
            <>
              {isLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading catalog…
                </Typography>
              ) : filteredItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No items found.
                </Typography>
              ) : (
                <Grid container spacing={1.5}>
                  {filteredItems.map((item) => (
                    <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                      <RentalItemCard
                        item={item}
                        sizes={item.sizes ?? []}
                        vendorCount={item.vendor_count ?? 0}
                        lowestRate={item.lowest_rate ?? null}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={() =>
                          setSelectedItem(selectedItem?.id === item.id ? null : item)
                        }
                        onAddToEstimate={() => {
                          const wasEmpty = itemCount === 0;
                          addItem({
                            rental_item_id: item.id,
                            rental_item_name: item.name,
                            size_label: item.sizes?.[0]?.size_label ?? null,
                            rental_item_size_id: item.sizes?.[0]?.id ?? null,
                            quantity: 10,
                            days: 25,
                          });
                          if (wasEmpty) setBasketOpen(true);
                        }}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </>
          )}

          {view === "vendors" && (
            <Grid container spacing={1.5}>
              {rentalStoreVendors.length === 0 ? (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="body2" color="text.secondary">
                    No rental vendors found. Add a vendor with type &quot;Rental Store&quot; to see them here.
                  </Typography>
                </Grid>
              ) : (
                rentalStoreVendors.map((vendor) => (
                  <Grid key={vendor.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 2,
                        borderColor: selectedVendorId === vendor.id ? "primary.main" : "divider",
                        borderWidth: selectedVendorId === vendor.id ? 2 : 1,
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                      }}
                      onClick={() =>
                        setSelectedVendorId(vendor.id === selectedVendorId ? null : vendor.id)
                      }
                    >
                      <Box sx={{ p: 1.5 }}>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {vendor.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {vendor.store_city ?? vendor.shop_name ?? "—"}
                        </Typography>
                        <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                          <Chip
                            label="Rental Store"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ fontSize: 10 }}
                          />
                          <Chip
                            label={vendor.is_active ? "Active" : "Inactive"}
                            size="small"
                            color={vendor.is_active ? "success" : "default"}
                            sx={{ fontSize: 10 }}
                          />
                        </Box>
                      </Box>
                    </Card>
                  </Grid>
                ))
              )}
            </Grid>
          )}
        </Box>

        {/* Inspect pane */}
        {selectedItem && (
          <RentalItemInspectPane
            itemId={selectedItem.id}
            itemName={selectedItem.name}
            rateType={selectedItem.rate_type}
            item={selectedItem}
            isOpen
            onClose={() => setSelectedItem(null)}
          />
        )}
        {view === "vendors" && selectedVendorId && (
          <VendorInspectPane
            vendorId={selectedVendorId}
            isOpen
            onClose={() => setSelectedVendorId(null)}
          />
        )}
      </Box>

      {/* Dialogs */}
      <EstimateBasketDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        onConvertToRequest={handleConvertToRequest}
      />

      {/* Add Item dialog */}
      {addItemOpen && (
        <RentalItemDialog
          open={addItemOpen}
          onClose={() => setAddItemOpen(false)}
        />
      )}
    </Box>
  );
}

// ─── OUTER PAGE ───────────────────────────────────────────────────────────────

export default function CompanyRentalsPage() {
  return (
    <EstimateBasketProvider>
      <CompanyRentalsPageInner />
    </EstimateBasketProvider>
  );
}
