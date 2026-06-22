/**
 * Design tokens for the Workforce "Workspace" redesign.
 *
 * Unlike material-hub/tokens.ts (which remaps onto the app's MUI palette), this surface was
 * deliberately re-designed end-to-end (docs/design_handoff_workforce/README.md) with its own
 * visual identity, so we use the handoff's EXACT hex values for fidelity. Material Symbols are
 * mapped to bundled MUI icons per the README's explicit guidance (no extra icon font to load).
 */
import type { SvgIconComponent } from "@mui/icons-material";
import Warning from "@mui/icons-material/Warning";
import PriorityHigh from "@mui/icons-material/PriorityHigh";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Shield from "@mui/icons-material/Shield";
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";
import Adjust from "@mui/icons-material/Adjust";
import Foundation from "@mui/icons-material/Foundation";
import Bolt from "@mui/icons-material/Bolt";
import FormatPaint from "@mui/icons-material/FormatPaint";
import Plumbing from "@mui/icons-material/Plumbing";
import Carpenter from "@mui/icons-material/Carpenter";
import GridView from "@mui/icons-material/GridView";
import Construction from "@mui/icons-material/Construction";
import WaterDrop from "@mui/icons-material/WaterDrop";
import Layers from "@mui/icons-material/Layers";
import Groups from "@mui/icons-material/Groups";
import FactCheck from "@mui/icons-material/FactCheck";
import Diversity3 from "@mui/icons-material/Diversity3";
import Payments from "@mui/icons-material/Payments";
import Apartment from "@mui/icons-material/Apartment";
import HomeRepairService from "@mui/icons-material/HomeRepairService";
import type { Severity } from "./exposure";
import type { ContractStatus, LaborTrackingMode } from "@/types/trade.types";
import type { ContractTier } from "./workspaceModel";

export const wsColors = {
  primary: "#2f6bed",
  primaryTint: "#eaf1fe",
  ink: "#18202f",
  ink2: "#5b6678",
  muted: "#8a8f9c",
  muted2: "#9aa0ad",
  canvas: "#f4f6f9",
  surface: "#ffffff",
  hairline: "#e9ebf0",
  hairline2: "#eef1f6",
  railBg: "#0f1626",
  workBar: "#cdd5e2", // grey "work done" layer under the blue "paid" layer
  // Verdict palette — reserve these strictly for the exposure verdict.
  green: "#1f9d57",
  greenBg: "#e8f6ee",
  amber: "#d9870b",
  amberBg: "#fdf2e0",
  red: "#d64545",
  redBg: "#fbeaea",
  // Meter
  meterSafeTrack: "#e8f6ee",
  meterExposedTrack: "#fdeede",
  meterDivider: "#c2c7d2",
  markerInk: "#0f1626",
} as const;

export const wsRadius = {
  card: 16,
  row: 12,
  input: 10,
  pill: 999,
  avatar: 12,
} as const;

export const wsShadow = {
  card: "0 1px 2px rgba(20,28,46,.04)",
  raised: "0 4px 14px rgba(47,107,237,.32)",
  modal: "0 30px 80px rgba(15,22,38,.4)",
  toast: "0 12px 30px rgba(15,22,38,.4)",
} as const;

/** Plus Jakarta Sans (loaded via a Google Fonts <link> in the root layout) with system fallback. */
export const wsFont =
  '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Below this width the Workspace renders the single-column mobile experience. */
export const WS_MOBILE_BREAKPOINT = 900;

export interface SeverityMeta {
  color: string;
  bg: string;
  label: string;
  sub: string;
  icon: SvgIconComponent;
  /** the small status-dot colour in the tree/list */
  dot: string;
}

export const severityMeta: Record<Severity, SeverityMeta> = {
  untracked: {
    color: wsColors.muted2,
    bg: "#f0f2f6",
    label: "Set progress",
    sub: "Update progress to see exposure",
    icon: Adjust,
    dot: "#c2c7d2",
  },
  none: {
    color: wsColors.muted2,
    bg: "#f0f2f6",
    label: "Not started",
    sub: "No work or payment yet",
    icon: HourglassEmpty,
    dot: "#c2c7d2",
  },
  high: {
    color: wsColors.red,
    bg: wsColors.redBg,
    label: "High risk",
    sub: "Paid well ahead of work",
    icon: Warning,
    dot: wsColors.red,
  },
  watch: {
    color: wsColors.amber,
    bg: wsColors.amberBg,
    label: "Watch",
    sub: "Slightly ahead of work",
    icon: PriorityHigh,
    dot: wsColors.amber,
  },
  instep: {
    color: wsColors.primary,
    bg: wsColors.primaryTint,
    label: "In step",
    sub: "Paid matches work done",
    icon: CheckCircle,
    dot: wsColors.primary,
  },
  safe: {
    color: wsColors.green,
    bg: wsColors.greenBg,
    label: "Safe",
    sub: "Money still in hand",
    icon: Shield,
    dot: wsColors.green,
  },
};

export interface ModeMeta {
  label: string;
  short: string;
  icon: SvgIconComponent;
}

export const modeMeta: Record<LaborTrackingMode, ModeMeta> = {
  detailed: { label: "Detailed attendance", short: "Detailed", icon: FactCheck },
  headcount: { label: "Daily headcount", short: "Headcount", icon: Groups },
  mid: { label: "Crew roster + daily total", short: "Mid", icon: Diversity3 },
  mesthri_only: { label: "Money paid only", short: "Mesthri-only", icon: Payments },
};

export interface StatusMeta {
  /** Short chip label (distinct from the raw enum wording). */
  label: string;
  color: string;
  bg: string;
}

/**
 * Lifecycle-status palette for the small status chip.
 *
 * IMPORTANT: this is a DIFFERENT axis from the exposure verdict (`severityMeta`),
 * which owns the saturated green/amber/red risk dot. Status uses calm *tints* so the
 * two signals never read as the same thing. With the Future/Active/Completed tabs
 * separating buckets, the chip mainly earns its place flagging the odd `on_hold`
 * row that mixes into the Active tab.
 */
export const statusMeta: Record<ContractStatus, StatusMeta> = {
  draft: { label: "Planned", color: wsColors.ink2, bg: "#eef1f6" },
  active: { label: "Active", color: wsColors.primary, bg: wsColors.primaryTint },
  on_hold: { label: "On hold", color: wsColors.amber, bg: wsColors.amberBg },
  completed: { label: "Done", color: wsColors.green, bg: wsColors.greenBg },
  cancelled: { label: "Cancelled", color: wsColors.muted2, bg: "#f0f2f6" },
};

export interface TierMeta {
  /** Tier tag shown on each row so the ladder reads parent → child → child-of-child. */
  label: string;
  /** What the next level down is called (drives the "+ Add …" affordance + child word). */
  childLabel: string;
  icon: SvgIconComponent;
  /** Row title weight per tier — Contract heaviest, Task lightest. */
  weight: number;
  /** Small tag tint. */
  color: string;
  bg: string;
}

/**
 * Structural tier cue for the Contract ▸ Section ▸ Task ladder. A THIRD axis, distinct
 * from the exposure verdict (`severityMeta`) and the lifecycle chip (`statusMeta`): it
 * answers "what level am I looking at, and what nests under it" so the names finally read
 * as parent / child / child-of-child. Calm slate tints — the colour signals stay with risk.
 */
export const tierMeta: Record<ContractTier, TierMeta> = {
  contract: {
    label: "Contract",
    childLabel: "section",
    icon: Apartment,
    weight: 800,
    color: wsColors.ink,
    bg: "#eef1f6",
  },
  section: {
    label: "Section",
    childLabel: "task",
    icon: Layers,
    weight: 700,
    color: wsColors.ink2,
    bg: "#eef1f6",
  },
  task: {
    label: "Task",
    childLabel: "task",
    icon: HomeRepairService,
    weight: 600,
    color: wsColors.muted,
    bg: "#f0f2f6",
  },
};

const TRADE_ICONS: Array<[RegExp, SvgIconComponent]> = [
  [/civil|concret|found|struct|masonry/i, Foundation],
  [/elec|wiring|bolt/i, Bolt],
  [/paint/i, FormatPaint],
  [/plumb|sanitary|water\s*supply/i, Plumbing],
  [/carp|wood|door|furniture/i, Carpenter],
  [/fabric|steel|weld|metal|grill/i, Construction],
  [/floor|tile|tiling|granite|marble/i, GridView],
  [/waterproof|water\s*proof/i, WaterDrop],
  [/scaffold/i, Layers],
];

/** Map a trade/discipline name to a bundled MUI icon (falls back to a generic grid). */
export function tradeIcon(name: string | null | undefined): SvgIconComponent {
  if (!name) return GridView;
  for (const [re, icon] of TRADE_ICONS) if (re.test(name)) return icon;
  return GridView;
}
