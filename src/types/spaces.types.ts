/**
 * Spaces & Measurements Register — per-site rooms with drawing +
 * field-verified dimensions (stored in INCHES) and the inputs needed to
 * derive finish quantities: floor tile (sqft), skirting (rft), wall tile
 * (sqft) and granite (sqft). Computed quantities are never stored — they
 * are derived client-side by `src/lib/spaces/measurements.ts`; only manual
 * overrides persist.
 */

import type { ScopePhotoRef } from "./scopeSheet.types";

export type { ScopePhotoRef };

export type SpaceType =
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "living"
  | "dining"
  | "balcony"
  | "utility"
  | "staircase"
  | "corridor"
  | "other";

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  living: "Living",
  dining: "Dining",
  balcony: "Balcony",
  utility: "Utility",
  staircase: "Staircase",
  corridor: "Corridor",
  other: "Other",
};

/**
 * Dimension labels follow plan-reading convention: the FIRST number printed
 * on a room is the horizontal (X) dimension, the SECOND is vertical (Y).
 * Column mapping: X → drawing_length_in / verified_length_in,
 * Y → drawing_width_in / verified_width_in. The math is symmetric, so only
 * labels and the AI-import prompt care about this convention.
 */
export const DIMENSION_LABELS = {
  x: "X (horizontal)",
  y: "Y (vertical)",
  h: "Height",
} as const;

export type OpeningKind = "door" | "window";

/** A door/window in a space. Doors deduct from skirting by default. */
export interface SpaceOpening {
  id: string;
  kind: OpeningKind;
  width_in: number;
  height_in: number;
  count: number;
  /** Whether this opening's width is deducted from skirting (doors: true). */
  deduct_skirting?: boolean;
}

/** Manual granite line item, e.g. "Kitchen top 12' × 2'". */
export interface GraniteLine {
  id: string;
  label: string;
  length_in: number;
  width_in: number;
  count: number;
}

/**
 * Manual overrides of computed quantities, in display units.
 * A set override wins over the computed value in every display mode.
 */
export interface SpaceOverrides {
  floor_tile_sqft?: number;
  skirting_rft?: number;
  wall_tile_sqft?: number;
  granite_sqft?: number;
}

/** A rectangular no-tile zone inside a space (wardrobe, counter…). */
export interface TileExclusion {
  id: string;
  /** Offset from the room's top-left corner, inches (X → right, Y → down). */
  x_in: number;
  y_in: number;
  w_in: number;
  h_in: number;
  label?: string;
}

/** Per-space tile layout settings (persisted as jsonb). */
export interface TileLayout {
  exclusions?: TileExclusion[];
  /** Extra tiles for breakage/cuts, percent. Default 5. */
  wastage_pct?: number;
  /** Skirting strips are cut from the same floor tile. */
  skirting_from_same_tile?: boolean;
  /** Skirting strip height, inches. Default 4. */
  skirting_strip_in?: number;
  /** A separate (contrast) tile for skirting; overrides skirting_from_same_tile. */
  skirting_tile_option_id?: string | null;
}

/** A shop tile option (size + photo) shared by the site's spaces. */
export interface SpaceTileOption {
  id: string;
  site_id: string;
  label: string;
  tile_width_in: number;
  tile_height_in: number;
  tiles_per_box: number | null;
  price_per_box: number | null;
  photo: ScopePhotoRef | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SpaceTileOptionInsert = Omit<
  SpaceTileOption,
  "id" | "created_at" | "updated_at" | "created_by"
> &
  Partial<Pick<SpaceTileOption, "created_by">>;

export interface Space {
  id: string;
  site_id: string;
  /** Floor (building_section). NULL groups under "Unassigned". */
  section_id: string | null;
  /**
   * Additional floors this space repeats on ("typical" apartment units) —
   * quantities count once per floor it appears on.
   */
  mirrored_section_ids: string[];
  name: string;
  space_type: SpaceType;
  drawing_length_in: number | null;
  drawing_width_in: number | null;
  drawing_height_in: number | null;
  verified_length_in: number | null;
  verified_width_in: number | null;
  verified_height_in: number | null;
  verified_by: string | null;
  verified_at: string | null;
  openings: SpaceOpening[];
  wall_tile_enabled: boolean;
  tiling_height_in: number | null;
  granite_lines: GraniteLine[];
  overrides: SpaceOverrides;
  photos: ScopePhotoRef[];
  /** Selected floor-tile option (space_tile_options), null until chosen. */
  tile_option_id: string | null;
  tile_layout: TileLayout;
  notes: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SpaceInsert = Omit<
  Space,
  "id" | "created_at" | "updated_at" | "created_by"
> &
  Partial<Pick<Space, "created_by">>;

export type SpaceUpdate = Partial<Omit<Space, "id" | "site_id" | "created_at">>;

/**
 * Per-floor metadata: one row per building_section holding the plan image
 * and/or the manually-entered built-up area (incl. wall thickness — the
 * basis for civil/electrical per-sqft contracts; never derived from rooms).
 */
export interface SpaceFloorPlan {
  id: string;
  site_id: string;
  section_id: string;
  plan: ScopePhotoRef | null;
  built_area_sqft: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Which quantity mode the register displays / totals roll up in. */
export type MeasureMode = "drawing" | "best";

export type SpaceStatus = "unverified" | "verified" | "variance";

/** The four derived finish quantities, in display units. */
export interface SpaceQuantities {
  floorTileSqft: number;
  skirtingRft: number;
  wallTileSqft: number;
  graniteSqft: number;
}
