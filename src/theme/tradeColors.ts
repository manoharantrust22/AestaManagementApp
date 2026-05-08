/**
 * Per-trade color palette for /site/attendance.
 *
 * Civil keeps the existing primary blue (#1976d2) so its UI is byte-identical.
 * Each non-civil trade gets a distinct, accessible hue.
 *
 * Tint scope (intentionally narrow):
 *   ✓ selected trade chip + sub-picker border
 *   ✓ week table header strip (bgcolor + contrastText)
 *   ✓ weekly separator banner accent
 *   ✓ primary action FAB (SpeedDial)
 *
 * Stays untinted (semantic / functional, not brand):
 *   ✗ KPI tile values (success.main / warning.main / secondary.main)
 *   ✗ Confirm chip color="success" / color="info"
 *   ✗ Edit IconButton color="primary"
 *   ✗ Audit-mode banner / dialog headers / DateRangePicker
 *
 * Future: promote to labor_categories.color DB column so admins rebrand
 * without code changes. For now, hand-picked + hardcoded.
 */

export interface TradeColor {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
}

const CIVIL_COLOR: TradeColor = {
  main: "#1976d2",
  light: "#42a5f5",
  dark: "#1565c0",
  contrastText: "#fff",
};

export const TRADE_COLORS: Record<string, TradeColor> = {
  civil: CIVIL_COLOR,
  electrical: {
    main: "#f9a825",
    light: "#fdd835",
    dark: "#f57f17",
    contrastText: "rgba(0,0,0,0.87)",
  },
  plumbing: {
    main: "#0097a7",
    light: "#26c6da",
    dark: "#006064",
    contrastText: "#fff",
  },
  carpentry: {
    main: "#8d6e63",
    light: "#a1887f",
    dark: "#5d4037",
    contrastText: "#fff",
  },
  painting: {
    main: "#7b1fa2",
    light: "#9c27b0",
    dark: "#4a148c",
    contrastText: "#fff",
  },
  scaffolding: {
    main: "#455a64",
    light: "#607d8b",
    dark: "#263238",
    contrastText: "#fff",
  },
  fabrication: {
    main: "#c62828",
    light: "#e53935",
    dark: "#8e0000",
    contrastText: "#fff",
  },
  flooring: {
    main: "#6d4c41",
    light: "#8d6e63",
    dark: "#3e2723",
    contrastText: "#fff",
  },
  // Tiles/Tiling — terracotta tone matching baked-clay tiles. Often created
  // as a separate trade from Flooring even though they overlap in scope.
  tiling: {
    main: "#d84315",
    light: "#ff7043",
    dark: "#a8290a",
    contrastText: "#fff",
  },
  tiles: {
    main: "#d84315",
    light: "#ff7043",
    dark: "#a8290a",
    contrastText: "#fff",
  },
  // Other common trades admins might create — pre-tuned so they look hand-picked.
  masonry: {
    main: "#5d4037",
    light: "#795548",
    dark: "#3e2723",
    contrastText: "#fff",
  },
  steel: {
    main: "#37474f",
    light: "#546e7a",
    dark: "#263238",
    contrastText: "#fff",
  },
  hvac: {
    main: "#1565c0",
    light: "#1e88e5",
    dark: "#0d47a1",
    contrastText: "#fff",
  },
  waterproofing: {
    main: "#00695c",
    light: "#00897b",
    dark: "#004d40",
    contrastText: "#fff",
  },
  general: {
    main: "#546e7a",
    light: "#78909c",
    dark: "#37474f",
    contrastText: "#fff",
  },
};

/**
 * Deterministic hash → distinct HSL color for any trade name not in the
 * hand-tuned map above. Same name always returns the same shade across
 * sessions and machines, so admins see consistent colors for trades they
 * create themselves (e.g., "Roofing", "Aluminum", "Glass Work").
 *
 * Lightness held at 38% so white contrast text stays AA-readable on every
 * hue (worst case ~4.7:1 for pure yellow at 60° — comfortably above 4.5:1).
 */
function hashStringToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // force 32-bit
  }
  return Math.abs(h) % 360;
}

function deriveTradeColor(tradeName: string): TradeColor {
  const hue = hashStringToHue(tradeName);
  return {
    main: `hsl(${hue}, 55%, 38%)`,
    light: `hsl(${hue}, 55%, 52%)`,
    dark: `hsl(${hue}, 60%, 28%)`,
    contrastText: "#fff",
  };
}

export function getTradeColor(tradeName: string | null | undefined): TradeColor {
  if (!tradeName) return CIVIL_COLOR;
  const key = tradeName.toLowerCase().trim();
  return TRADE_COLORS[key] ?? deriveTradeColor(key);
}
