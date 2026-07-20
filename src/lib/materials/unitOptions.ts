import type { MaterialUnit } from "@/types/material.types";

/** Every unit a material can be created with, for a full Select dropdown. */
export const UNIT_OPTIONS: { value: MaterialUnit; label: string }[] = [
  { value: "kg", label: "Kilogram (kg)" },
  { value: "g", label: "Gram (g)" },
  { value: "ton", label: "Ton" },
  { value: "bag", label: "Bag" },
  { value: "piece", label: "Piece" },
  { value: "nos", label: "Numbers (nos)" },
  { value: "sqft", label: "Square Feet (sqft)" },
  { value: "sqm", label: "Square Meter (sqm)" },
  { value: "cft", label: "Cubic Feet (cft)" },
  { value: "cum", label: "Cubic Meter (cum)" },
  { value: "rmt", label: "Running Meter (rmt)" },
  { value: "liter", label: "Liter" },
  { value: "ml", label: "Milliliter (ml)" },
  { value: "bundle", label: "Bundle" },
  { value: "box", label: "Box" },
  { value: "set", label: "Set" },
];

export function unitLabelFor(unit: MaterialUnit | string): string {
  return UNIT_OPTIONS.find((u) => u.value === unit)?.label ?? String(unit);
}
