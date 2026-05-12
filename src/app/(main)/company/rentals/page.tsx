// src/app/(main)/company/rentals/page.tsx
"use client";

import { useState, useDeferredValue } from "react";
import {
  Box,
  Button,
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
import { useRentalItems, useRentalCategories } from "@/hooks/queries/useRentals";
import { RentalItemCard } from "@/components/rentals/RentalItemCard";
import { RentalItemInspectPane } from "@/components/rentals/RentalItemInspectPane";
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
  const [basketOpen, setBasketOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const { itemCount } = useEstimateBasket();
  const { data: categories = [] } = useRentalCategories();
  const { data: items = [], isLoading } = useRentalItems(categoryFilter);

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
          onChange={(_, v) => v && setView(v)}
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
                        vendorCount={0}
                        lowestRate={null}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={() =>
                          setSelectedItem(selectedItem?.id === item.id ? null : item)
                        }
                        onAddToEstimate={() => setSelectedItem(item)}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </>
          )}

          {view === "vendors" && (
            <Typography variant="body2" color="text.secondary">
              Vendor view wired in Task 11.
            </Typography>
          )}
        </Box>

        {/* Inspect pane */}
        {selectedItem && (
          <RentalItemInspectPane
            itemId={selectedItem.id}
            itemName={selectedItem.name}
            isOpen
            onClose={() => setSelectedItem(null)}
          />
        )}
      </Box>

      {/* Dialogs */}
      <EstimateBasketDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        onConvertToRequest={handleConvertToRequest}
      />

      {/* Add Item dialog — Task 12 wires up RentalItemDialog */}
      {addItemOpen && null}
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
