"use client";

import React, { memo, useState, useMemo } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  Checkbox,
  Chip,
  CircularProgress,
  Rating,
} from "@mui/material";
import {
  Store as ShopIcon,
  LocalShipping as DealerIcon,
  Factory as ManufacturerIcon,
  Person as IndividualIcon,
  Handyman as RentalIcon,
} from "@mui/icons-material";
import { useVendors } from "@/hooks/queries/useVendors";
import type { VendorWithCategories, VendorType } from "@/types/material.types";

export interface VendorAutocompleteProps {
  value: string | string[] | null;
  onChange: (value: string | string[] | null, vendor?: VendorWithCategories | VendorWithCategories[] | null) => void;
  multiple?: boolean;
  categoryId?: string | null;
  vendorType?: VendorType | VendorType[];
  excludeVendorIds?: string[];
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  size?: "small" | "medium";
  label?: string;
  placeholder?: string;
  sx?: object;
}

const VENDOR_TYPE_ICONS: Record<VendorType, React.ReactNode> = {
  shop: <ShopIcon fontSize="small" />,
  dealer: <DealerIcon fontSize="small" />,
  manufacturer: <ManufacturerIcon fontSize="small" />,
  individual: <IndividualIcon fontSize="small" />,
  rental_store: <RentalIcon fontSize="small" />,
};

const VENDOR_TYPE_COLORS: Record<VendorType, string> = {
  shop: "#4caf50",
  dealer: "#2196f3",
  manufacturer: "#9c27b0",
  individual: "#ff9800",
  rental_store: "#795548",
};

const VendorAutocomplete = memo(function VendorAutocomplete({
  value,
  onChange,
  multiple = false,
  categoryId,
  vendorType,
  excludeVendorIds = [],
  disabled = false,
  error = false,
  helperText,
  size = "small",
  label = "Vendor",
  placeholder = "Search vendors...",
  sx,
}: VendorAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const { data: allVendors = [], isLoading } = useVendors(categoryId);

  // Filter out excluded vendors and apply search
  const filteredVendors = useMemo(() => {
    let vendors = allVendors.filter((v) => !excludeVendorIds.includes(v.id));

    if (vendorType) {
      const allowed = Array.isArray(vendorType) ? vendorType : [vendorType];
      vendors = vendors.filter((v) => allowed.includes(v.vendor_type));
    }

    // Apply local search filter
    if (inputValue.length >= 2) {
      const searchLower = inputValue.toLowerCase();
      vendors = vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(searchLower) ||
          v.code?.toLowerCase().includes(searchLower) ||
          v.phone?.includes(inputValue) ||
          v.city?.toLowerCase().includes(searchLower)
      );
    }

    return vendors;
  }, [allVendors, excludeVendorIds, inputValue, vendorType]);

  // Get selected value(s)
  const getSelectedValue = () => {
    if (multiple) {
      const valueArray = Array.isArray(value) ? value : [];
      return allVendors.filter((v) => valueArray.includes(v.id));
    } else {
      return allVendors.find((v) => v.id === value) || null;
    }
  };

  const selectedValue = getSelectedValue();

  const renderVendorOption = (
    props: React.HTMLAttributes<HTMLLIElement> & { key?: React.Key },
    option: VendorWithCategories,
    selected?: boolean
  ) => {
    const { key, ...otherProps } = props;
    return (
      <Box
        component="li"
        key={key}
        {...otherProps}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          py: 1,
        }}
      >
        {multiple && <Checkbox checked={selected} size="small" sx={{ p: 0.5, mt: 0.5 }} />}

        {/* Vendor type icon */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: `${VENDOR_TYPE_COLORS[option.vendor_type]}20`,
            color: VENDOR_TYPE_COLORS[option.vendor_type],
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          {VENDOR_TYPE_ICONS[option.vendor_type]}
        </Box>

        {/* Vendor details */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={500} noWrap>
            {option.name}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
            {option.code && (
              <Typography variant="caption" color="text.secondary">
                {option.code}
              </Typography>
            )}
            {option.city && (
              <Typography variant="caption" color="text.secondary">
                {option.city}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Rating */}
        {option.rating && option.rating > 0 && (
          <Rating value={option.rating} size="small" readOnly precision={0.5} sx={{ flexShrink: 0 }} />
        )}
      </Box>
    );
  };

  if (multiple) {
    return (
      <Autocomplete
        multiple
        disableCloseOnSelect
        value={selectedValue as VendorWithCategories[]}
        inputValue={inputValue}
        onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
        onChange={(_, newValue) => {
          const vendors = newValue as VendorWithCategories[];
          onChange(vendors.map((v) => v.id), vendors);
        }}
        options={filteredVendors}
        loading={isLoading}
        disabled={disabled}
        size={size}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        filterOptions={(x) => x} // Disable built-in filtering, we do it ourselves
        renderOption={(props, option, { selected }) =>
          renderVendorOption(props, option, selected)
        }
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return (
              <Chip
                key={key}
                label={option.name}
                size="small"
                icon={
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: 0.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: `${VENDOR_TYPE_COLORS[option.vendor_type]}20`,
                      color: VENDOR_TYPE_COLORS[option.vendor_type],
                      "& svg": { fontSize: 12 },
                    }}
                  >
                    {VENDOR_TYPE_ICONS[option.vendor_type]}
                  </Box>
                }
                {...tagProps}
                sx={{ maxWidth: 180 }}
              />
            );
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={
              (selectedValue as VendorWithCategories[])?.length > 0
                ? ""
                : placeholder
            }
            error={error}
            helperText={helperText}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {isLoading ? (
                    <CircularProgress color="inherit" size={18} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        slotProps={{
          popper: {
            sx: { minWidth: 320 },
          },
          paper: {
            sx: { maxWidth: 450 },
          },
        }}
        sx={{
          ...sx,
          width: "100%",
        }}
        noOptionsText={
          inputValue.length < 2
            ? "Type at least 2 characters to search"
            : "No vendors found"
        }
        loadingText="Loading vendors..."
      />
    );
  }

  // Single select mode
  return (
    <Autocomplete
      value={selectedValue as VendorWithCategories | null}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      onChange={(_, newValue) => {
        const vendor = newValue as VendorWithCategories | null;
        onChange(vendor?.id || null, vendor);
      }}
      options={filteredVendors}
      loading={isLoading}
      disabled={disabled}
      size={size}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      filterOptions={(x) => x} // Disable built-in filtering
      renderOption={(props, option) => renderVendorOption(props, option)}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            startAdornment: selectedValue ? (
              <>
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: `${VENDOR_TYPE_COLORS[(selectedValue as VendorWithCategories).vendor_type]}20`,
                    color: VENDOR_TYPE_COLORS[(selectedValue as VendorWithCategories).vendor_type],
                    mr: 0.5,
                    "& svg": { fontSize: 14 },
                  }}
                >
                  {VENDOR_TYPE_ICONS[(selectedValue as VendorWithCategories).vendor_type]}
                </Box>
                {params.InputProps.startAdornment}
              </>
            ) : (
              params.InputProps.startAdornment
            ),
            endAdornment: (
              <>
                {isLoading ? (
                  <CircularProgress color="inherit" size={18} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      slotProps={{
        popper: {
          sx: { minWidth: 320 },
        },
        paper: {
          sx: { maxWidth: 450 },
        },
      }}
      sx={{
        ...sx,
        width: "100%",
      }}
      noOptionsText={
        inputValue.length < 2
          ? "Type at least 2 characters to search"
          : "No vendors found"
      }
      loadingText="Loading vendors..."
    />
  );
});

export default VendorAutocomplete;
