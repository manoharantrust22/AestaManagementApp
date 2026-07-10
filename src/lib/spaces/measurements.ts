/**
 * Pure measurement math for the Spaces & Measurements Register.
 * All lengths are INCHES internally; conversion to feet/sqft happens at
 * the edges. No I/O, no React — fully unit-testable.
 */

import type {
  GraniteLine,
  MeasureMode,
  Space,
  SpaceOpening,
  SpaceQuantities,
  SpaceStatus,
} from "@/types/spaces.types";

/** Field value differing from drawing by more than this is a variance. */
export const VARIANCE_TOLERANCE_IN = 1;

/** Typical residential ceiling height — pre-filled for new spaces. */
export const DEFAULT_CEILING_HEIGHT_IN = 120;

// ==================== feet-inches parse / format ====================

/**
 * Parse a feet-inches string into total inches.
 * Accepts: `14' 6"`, `14'6`, `14' 6`, `14 6`, `14.5` (decimal feet),
 * `14`, `6"` (inches only). Returns null when unparseable/negative.
 */
export function parseFeetInches(input: string): number | null {
  // Normalize curly quotes ("" '') from mobile keyboards and Unicode
  // primes (′ ″) from AI output to straight quote characters.
  const raw = input
    .trim()
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'");
  if (!raw) return null;

  // Inches only: 6"
  let m = raw.match(/^(\d+(?:\.\d+)?)\s*"$/);
  if (m) return toNum(m[1]);

  // Feet + optional inches: 14' 6" | 14'6 | 14'
  m = raw.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
  if (m) {
    const feet = toNum(m[1]);
    const inches = m[2] ? toNum(m[2]) : 0;
    if (feet === null || inches === null || inches >= 12) return null;
    return feet * 12 + inches;
  }

  // Two bare numbers: "14 6" => 14 ft 6 in
  m = raw.match(/^(\d+)\s+(\d+(?:\.\d+)?)$/);
  if (m) {
    const feet = toNum(m[1]);
    const inches = toNum(m[2]);
    if (feet === null || inches === null || inches >= 12) return null;
    return feet * 12 + inches;
  }

  // Single number => decimal feet
  m = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (m) {
    const feet = toNum(m[1]);
    return feet === null ? null : feet * 12;
  }

  return null;
}

function toNum(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Format inches as `14' 6"` (nearest inch; omits zero inches: `14'`). */
export function formatFeetInches(inches: number | null | undefined): string {
  if (inches === null || inches === undefined || !Number.isFinite(inches))
    return "—";
  const total = Math.round(inches);
  const feet = Math.floor(total / 12);
  const rem = total - feet * 12;
  return rem === 0 ? `${feet}'` : `${feet}' ${rem}"`;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const sqInToSqFt = (sqIn: number): number => sqIn / 144;

/**
 * True when a material's unit is an area unit (priced by square feet/metre).
 * Such materials (granite, marble, tiles) are entered by slab size, not count.
 */
export const isAreaUnit = (unit: string | null | undefined): boolean =>
  unit === "sqft" || unit === "sqm";

// ==================== geometry ====================

export function perimeterIn(lengthIn: number, widthIn: number): number {
  return 2 * (lengthIn + widthIn);
}

export function floorTileSqft(lengthIn: number, widthIn: number): number {
  return round2(sqInToSqFt(lengthIn * widthIn));
}

/** Skirting = perimeter minus widths of skirting-breaking openings (doors). */
export function skirtingRft(
  lengthIn: number,
  widthIn: number,
  openings: SpaceOpening[]
): number {
  const deducted = openings.reduce(
    (s, o) =>
      s + (deductsSkirting(o) ? o.width_in * Math.max(o.count, 0) : 0),
    0
  );
  return round2(Math.max(perimeterIn(lengthIn, widthIn) - deducted, 0) / 12);
}

const deductsSkirting = (o: SpaceOpening): boolean =>
  o.deduct_skirting ?? o.kind === "door";

/**
 * Wall tile area = perimeter × tiling height − Σ opening areas.
 * V1 simplification: the FULL opening area is deducted even when the
 * opening extends above the tiling band — acceptable for bathrooms where
 * doors/windows sit within the tiled band.
 */
export function wallTileSqft(
  lengthIn: number,
  widthIn: number,
  tilingHeightIn: number,
  openings: SpaceOpening[]
): number {
  const band = perimeterIn(lengthIn, widthIn) * tilingHeightIn;
  const deducted = openings.reduce(
    (s, o) => s + o.width_in * o.height_in * Math.max(o.count, 0),
    0
  );
  return round2(Math.max(sqInToSqFt(band - deducted), 0));
}

export function graniteSqft(lines: GraniteLine[]): number {
  return round2(
    sqInToSqFt(
      lines.reduce(
        (s, l) => s + l.length_in * l.width_in * Math.max(l.count, 0),
        0
      )
    )
  );
}

// ==================== dimension resolution & status ====================

export interface ResolvedDims {
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

/**
 * Resolve the dimensions used for computation.
 * `drawing` = drawing values only; `best` = verified where present,
 * falling back to drawing per-dimension.
 */
export function resolveDims(space: Space, mode: MeasureMode): ResolvedDims {
  if (mode === "drawing") {
    return {
      lengthIn: space.drawing_length_in,
      widthIn: space.drawing_width_in,
      heightIn: space.drawing_height_in,
    };
  }
  return {
    lengthIn: space.verified_length_in ?? space.drawing_length_in,
    widthIn: space.verified_width_in ?? space.drawing_width_in,
    heightIn: space.verified_height_in ?? space.drawing_height_in,
  };
}

/** Per-dimension |drawing − verified| in inches (null when either missing). */
export function dimensionVariance(
  space: Space
): { length: number | null; width: number | null; height: number | null } {
  const diff = (a: number | null, b: number | null) =>
    a !== null && b !== null ? Math.abs(a - b) : null;
  return {
    length: diff(space.drawing_length_in, space.verified_length_in),
    width: diff(space.drawing_width_in, space.verified_width_in),
    height: diff(space.drawing_height_in, space.verified_height_in),
  };
}

/**
 * Space verification status:
 * - `verified`  — L & W field-measured (+H when wall tile enabled), all
 *                 within VARIANCE_TOLERANCE_IN of the drawing.
 * - `variance`  — any field-measured dimension differs beyond tolerance.
 * - `unverified`— required field measurements missing.
 */
export function spaceStatus(space: Space): SpaceStatus {
  const v = dimensionVariance(space);
  const checked = [v.length, v.width, v.height].filter(
    (x): x is number => x !== null
  );
  if (checked.some((x) => x > VARIANCE_TOLERANCE_IN)) return "variance";

  const required =
    space.verified_length_in !== null &&
    space.verified_width_in !== null &&
    (!space.wall_tile_enabled || space.verified_height_in !== null);
  return required ? "verified" : "unverified";
}

// ==================== quantities & totals ====================

const EMPTY: SpaceQuantities = {
  floorTileSqft: 0,
  skirtingRft: 0,
  wallTileSqft: 0,
  graniteSqft: 0,
};

/**
 * Compute the four finish quantities for a space in the given mode.
 * Manual overrides are applied last and win in every mode.
 */
export function computeQuantities(
  space: Space,
  mode: MeasureMode
): SpaceQuantities {
  const { lengthIn, widthIn } = resolveDims(space, mode);
  const q: SpaceQuantities = { ...EMPTY };

  if (lengthIn !== null && widthIn !== null) {
    q.floorTileSqft = floorTileSqft(lengthIn, widthIn);
    q.skirtingRft = skirtingRft(lengthIn, widthIn, space.openings);
    if (space.wall_tile_enabled && space.tiling_height_in !== null) {
      q.wallTileSqft = wallTileSqft(
        lengthIn,
        widthIn,
        space.tiling_height_in,
        space.openings
      );
    }
  }
  q.graniteSqft = graniteSqft(space.granite_lines);

  const o = space.overrides ?? {};
  if (typeof o.floor_tile_sqft === "number") q.floorTileSqft = o.floor_tile_sqft;
  if (typeof o.skirting_rft === "number") q.skirtingRft = o.skirting_rft;
  if (typeof o.wall_tile_sqft === "number") q.wallTileSqft = o.wall_tile_sqft;
  if (typeof o.granite_sqft === "number") q.graniteSqft = o.granite_sqft;
  return q;
}

export interface SpacesTotals {
  grand: SpaceQuantities;
  /** Keyed by section_id; null key = spaces with no floor assigned. */
  bySection: Map<string | null, SpaceQuantities>;
}

const addQuantities = (acc: SpaceQuantities, q: SpaceQuantities): void => {
  acc.floorTileSqft = round2(acc.floorTileSqft + q.floorTileSqft);
  acc.skirtingRft = round2(acc.skirtingRft + q.skirtingRft);
  acc.wallTileSqft = round2(acc.wallTileSqft + q.wallTileSqft);
  acc.graniteSqft = round2(acc.graniteSqft + q.graniteSqft);
};

/**
 * Sum quantities per floor and grand. A space contributes once per floor
 * it appears on: its primary floor plus each mirrored ("typical") floor.
 * Pass `knownSectionIds` to drop mirrors pointing at deleted sections
 * (the uuid[] column has no FK).
 */
export function rollupTotals(
  spaces: Space[],
  mode: MeasureMode,
  knownSectionIds?: ReadonlySet<string>
): SpacesTotals {
  const grand: SpaceQuantities = { ...EMPTY };
  const bySection = new Map<string | null, SpaceQuantities>();

  for (const space of spaces) {
    const q = computeQuantities(space, mode);
    const mirrors = [...new Set(space.mirrored_section_ids ?? [])].filter(
      (id) => id !== space.section_id && (knownSectionIds?.has(id) ?? true)
    );
    for (const key of [space.section_id, ...mirrors]) {
      const acc = bySection.get(key) ?? { ...EMPTY };
      addQuantities(acc, q);
      bySection.set(key, acc);
      addQuantities(grand, q);
    }
  }
  return { grand, bySection };
}

/**
 * Plain-text totals block for sharing (WhatsApp / vendor message).
 * `builtUpBySection` — manually-entered built-up sqft per floor (includes
 * walls; basis for civil/electrical per-sqft contracts).
 */
export function formatTotalsForWhatsApp(
  totals: SpacesTotals,
  siteName: string,
  mode: MeasureMode,
  sectionNames?: Map<string | null, string>,
  builtUpBySection?: Map<string, number>
): string {
  const modeLabel = mode === "drawing" ? "as per drawing" : "field-verified";
  const lines: string[] = [
    `*${siteName} — Measurement totals* (${modeLabel})`,
    "",
    `Floor tile: ${totals.grand.floorTileSqft} sq.ft`,
    `Skirting: ${totals.grand.skirtingRft} r.ft`,
    `Wall tile: ${totals.grand.wallTileSqft} sq.ft`,
    `Granite: ${totals.grand.graniteSqft} sq.ft`,
  ];
  const builtUpTotal = builtUpBySection
    ? round2([...builtUpBySection.values()].reduce((s, v) => s + v, 0))
    : 0;
  if (builtUpTotal > 0) {
    lines.push(`Built-up area: ${builtUpTotal} sq.ft (incl. walls)`);
  }
  if (sectionNames && totals.bySection.size > 1) {
    lines.push("");
    for (const [key, q] of totals.bySection) {
      const name = sectionNames.get(key) ?? "Unassigned";
      const builtUp = key !== null ? builtUpBySection?.get(key) : undefined;
      lines.push(
        `_${name}_: floor ${q.floorTileSqft} sqft · skirting ${q.skirtingRft} rft` +
          (q.wallTileSqft ? ` · wall ${q.wallTileSqft} sqft` : "") +
          (q.graniteSqft ? ` · granite ${q.graniteSqft} sqft` : "") +
          (builtUp ? ` · built-up ${builtUp} sqft` : "")
      );
    }
  }
  return lines.join("\n");
}
