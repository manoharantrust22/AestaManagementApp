"use client";

import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  FormHelperText,
} from "@mui/material";
import type { VariantFieldDefinition } from "@/types/category-variant-fields.types";

interface DynamicVariantFieldProps {
  field: VariantFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  size?: "small" | "medium";
  disabled?: boolean;
  variant?: "standard" | "outlined" | "filled";
  fullWidth?: boolean;
  /**
   * Render `field.name` as the input's own label. Off for the variant TABLE,
   * where the column header already names the field; on for the inline CARD,
   * which has no header row.
   */
  showLabel?: boolean;
}

/**
 * Renders a dynamic form field from a category template's field definition.
 * Supports number, integer, text, and select field types.
 */
export default function DynamicVariantField({
  field,
  value,
  onChange,
  size = "small",
  disabled = false,
  variant = "standard",
  fullWidth = false,
  showLabel = false,
}: DynamicVariantFieldProps) {
  const label = showLabel ? field.name : undefined;
  // Templates size table columns in pixels. In the card the fields flex, so the
  // fixed width has to yield or they render at column size inside a flex row.
  const widthSx = (fallback: number) =>
    fullWidth ? undefined : { width: field.columnWidth ? field.columnWidth - 20 : fallback };

  const handleChange = (newValue: string | number | null) => {
    if (field.type === "number" || field.type === "integer") {
      if (newValue === "" || newValue === null) {
        onChange(null);
        return;
      }
      // `integer` used to fall through to the raw-string branch, which stored
      // e.g. "10" in the JSONB where every other numeric spec holds a number.
      const num =
        typeof newValue === "string"
          ? field.type === "integer"
            ? parseInt(newValue, 10)
            : parseFloat(newValue)
          : newValue;
      onChange(isNaN(num) ? null : num);
      return;
    }
    onChange(newValue);
  };

  // Select field
  if (field.type === "select" && field.options) {
    // A Select is a listbox trigger, not an input, so an unlinked <InputLabel>
    // leaves it with no accessible name. labelId/id wire them together.
    const labelId = `variant-field-${field.key}-label`;
    return (
      <FormControl
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        disabled={disabled}
        required={showLabel && field.required}
        sx={fullWidth ? undefined : { minWidth: field.columnWidth ? field.columnWidth - 20 : 100 }}
      >
        {label ? <InputLabel id={labelId}>{label}</InputLabel> : null}
        <Select
          labelId={label ? labelId : undefined}
          aria-label={label ? undefined : field.name}
          value={(value as string | number | undefined) ?? ""}
          onChange={(e) => handleChange(e.target.value as string)}
          displayEmpty={!label}
          label={label}
          size={size}
        >
          <MenuItem value="">
            <em>Select...</em>
          </MenuItem>
          {field.options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
        {field.helperText && <FormHelperText>{field.helperText}</FormHelperText>}
      </FormControl>
    );
  }

  // Number / integer field
  if (field.type === "number" || field.type === "integer") {
    return (
      <TextField
        size={size}
        type="number"
        label={label}
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        variant={variant}
        disabled={disabled}
        fullWidth={fullWidth}
        required={showLabel && field.required}
        placeholder={field.placeholder}
        helperText={field.helperText}
        slotProps={{
          input: {
            inputProps: {
              step: field.type === "integer" ? 1 : field.step ?? 1,
              min: field.min,
              max: field.max,
            },
            endAdornment: field.unit ? (
              <InputAdornment position="end">{field.unit}</InputAdornment>
            ) : undefined,
          },
        }}
        sx={widthSx(100)}
      />
    );
  }

  // Text field (default)
  return (
    <TextField
      size={size}
      type="text"
      label={label}
      value={value ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      variant={variant}
      disabled={disabled}
      fullWidth={fullWidth}
      required={showLabel && field.required}
      placeholder={field.placeholder}
      helperText={field.helperText}
      slotProps={{
        input: {
          endAdornment: field.unit ? (
            <InputAdornment position="end">{field.unit}</InputAdornment>
          ) : undefined,
        },
      }}
      sx={widthSx(150)}
    />
  );
}
