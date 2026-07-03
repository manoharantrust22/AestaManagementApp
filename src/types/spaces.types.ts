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

export interface Space {
  id: string;
  site_id: string;
  /** Floor (building_section). NULL groups under "Unassigned". */
  section_id: string | null;
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

/** One floor-plan image per building_section. */
export interface SpaceFloorPlan {
  id: string;
  site_id: string;
  section_id: string;
  plan: ScopePhotoRef;
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
