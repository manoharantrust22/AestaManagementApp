/**
 * "Import from plan" — the copy-prompt → external AI → paste-JSON pipeline
 * for bulk-adding spaces. The app never calls an LLM: the owner runs the
 * generated prompt with the plan image/PDF in his own ChatGPT/Gemini/Claude
 * and pastes the JSON back. Pure module: prompt builder, tolerant zod
 * schema with per-row isolation, row normalization, SpaceInsert mapping.
 */

import { z } from "zod";

import type {
  GraniteLine,
  Space,
  SpaceInsert,
  SpaceOpening,
  SpaceType,
} from "@/types/spaces.types";
import { extractJson } from "@/lib/ai-ingestion/extractJson";
import { DEFAULT_CEILING_HEIGHT_IN, parseFeetInches } from "./measurements";
import { matchFloorByName, type FloorSectionLike } from "./floors";

const WALL_TILE_DEFAULT_HEIGHT_IN = 84; // 7'0" bathroom dado
const DOOR_DEFAULT_HEIGHT_IN = 84; // 7'
const WINDOW_DEFAULT_HEIGHT_IN = 48; // 4'
const OPENING_WIDTH_SUSPICIOUS_IN = 96; // >8' wide door — probably inches

const rid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `imp-${Math.random().toString(36).slice(2)}`;

// ==================== prompt ====================

/**
 * The prompt the owner copies into an external AI tool alongside the
 * floor-plan image. Conventions here MUST stay in sync with the schema
 * below and with DIMENSION_LABELS (X = horizontal, Y = vertical).
 */
export function buildSpacesImportPrompt(opts: {
  floorNames: string[];
}): string {
  const floorList = opts.floorNames.length
    ? opts.floorNames.map((n) => `  - ${n}`).join("\n")
    : `  (no floors defined on this site — use [] for "floors")`;

  return `You are reading a residential building floor plan for a construction measurement register.

I will attach the floor-plan image or PDF. Extract EVERY room/space that has printed dimensions and return ONE JSON object exactly matching the schema below.

# Output schema — return inside a \`\`\`json code fence
{
  "spaces": [
    {
      "name": "Bed 2",
      "type": "bedroom",          // one of: bedroom | bathroom | kitchen | living | dining | balcony | utility | staircase | corridor | other
      "floors": ["Ground Floor"], // names EXACTLY from the floor list below; several when the same unit repeats on multiple floors; [] if unknown
      "x": "9'4\\"",              // HORIZONTAL dimension as printed (feet-inches string)
      "y": "11'",                 // VERTICAL dimension as printed
      "height": "10'",            // ceiling height; use "10'" unless the plan prints one
      "doors": [{ "width": "3'", "height": "7'", "count": 1 }],
      "windows": [{ "width": "4'", "height": "4'", "count": 1 }],
      "wall_tile": false,         // true for bathrooms (dado band)
      "tiling_height": null,      // "7'" for bathrooms
      "granite": [{ "label": "Kitchen counter", "length": "8'", "width": "2'", "count": 1 }],
      "notes": null
    }
  ]
}

# Floors on this site — use these names VERBATIM in "floors"
${floorList}

# Rules
1. ALL dimensions are feet-inches strings like 9'4" or 12' or 4'6" — never bare numbers, never metres.
2. The FIRST number printed on a room label is the horizontal (X) dimension as drawn; the SECOND is the vertical (Y). Keep that order.
3. "height": use "10'" unless a ceiling height is printed on the plan.
4. Include every room that has printed dimensions. Describe unmeasurable areas in the "notes" of the nearest room.
5. Doors/windows: read sizes from the plan or door schedule. If unreadable, assume ONE 3' x 7' door per room and no windows. For corridors/passages, count EVERY door opening onto them.
6. Bathrooms: set "wall_tile": true and "tiling_height": "7'".
7. Add "granite" lines for kitchen counters and staircase slabs when a size is visible.
8. Anything ambiguous (unclear digit, cut-off text) — explain it in that room's "notes".
9. Output ONLY the JSON in a single \`\`\`json fence — no commentary before or after.`;
}

// ==================== schema ====================

/** Feet-inches string (or bare number = decimal feet) → inches. */
const dimIn = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = typeof v === "number" ? String(v) : v;
  const inches = parseFeetInches(s);
  if (inches === null || inches <= 0) {
    ctx.addIssue({
      code: "custom",
      message: `Unreadable dimension "${s}" — expected feet-inches like 9'4"`,
    });
    return z.NEVER;
  }
  return inches;
});

const dimInOptional = dimIn.nullish().catch(null);

const SPACE_TYPE_VALUES = [
  "bedroom",
  "bathroom",
  "kitchen",
  "living",
  "dining",
  "balcony",
  "utility",
  "staircase",
  "corridor",
  "other",
] as const;

/** Unknown labels ("hall", "foyer") fall back to 'other' — never a hard error. */
const spaceTypeLoose = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.enum(SPACE_TYPE_VALUES)
  )
  .catch("other");

const countLoose = z
  .preprocess(
    (v) => (v === null || v === undefined || v === "" ? 1 : v),
    z.coerce.number().int().min(1)
  )
  .catch(1);

const boolLoose = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() === "true" : v),
    z.boolean()
  )
  .catch(false);

const aiOpeningSchema = z.object({
  width: dimIn,
  height: dimInOptional,
  count: countLoose,
});

const aiGraniteSchema = z.object({
  label: z.string().trim().catch("Granite"),
  length: dimIn,
  width: dimIn,
  count: countLoose,
});

export const aiSpaceSchema = z.object({
  name: z.string().trim().min(1, "Room name is required"),
  type: spaceTypeLoose,
  /** Preferred: array of floor names. A single `floor` string is tolerated. */
  floors: z.array(z.string()).catch([]).default([]),
  floor: z.string().nullish().catch(null),
  x: dimIn,
  y: dimIn,
  height: dimInOptional,
  doors: z.array(aiOpeningSchema).catch([]).default([]),
  windows: z.array(aiOpeningSchema).catch([]).default([]),
  wall_tile: boolLoose,
  tiling_height: dimInOptional,
  granite: z.array(aiGraniteSchema).catch([]).default([]),
  notes: z.string().nullish().catch(null),
});

type AiSpace = z.infer<typeof aiSpaceSchema>;

/** Tolerate a bare top-level array as well as { spaces: [...] }. */
const envelopeSchema = z.preprocess(
  (v) => (Array.isArray(v) ? { spaces: v } : v),
  z.object({ spaces: z.array(z.unknown()).min(1, "No spaces found in the JSON") })
);

// ==================== parse & normalize ====================

export interface ImportRow {
  key: string;
  include: boolean;
  name: string;
  type: SpaceType;
  sectionId: string | null;
  /** Extra matched floors beyond the first ("typical" units). */
  mirroredSectionIds: string[];
  /** The AI's raw floor string(s) — shown when matching failed. */
  floorRaw: string | null;
  xIn: number;
  yIn: number;
  hIn: number | null;
  openings: SpaceOpening[];
  wallTileEnabled: boolean;
  tilingHeightIn: number | null;
  graniteLines: GraniteLine[];
  notes: string | null;
  warnings: string[];
}

export interface ImportRowError {
  index: number;
  name?: string;
  issues: string[];
}

export interface ParseSpacesResult {
  rows: ImportRow[];
  /** Rows that failed validation — excluded from the preview. */
  rowErrors: ImportRowError[];
  source: "fenced" | "raw" | "loose" | null;
  /** Fatal: nothing could be parsed at all. */
  error: string | null;
}

/**
 * Parse pasted AI output into editable preview rows. One bad room never
 * kills the batch — each element validates independently.
 */
export function parseSpacesImport(
  raw: string,
  sections: FloorSectionLike[],
  existingNames: string[] = []
): ParseSpacesResult {
  const extracted = extractJson(raw);
  if (!extracted.ok) {
    return { rows: [], rowErrors: [], source: null, error: extracted.error };
  }

  const envelope = envelopeSchema.safeParse(extracted.value);
  if (!envelope.success) {
    return {
      rows: [],
      rowErrors: [],
      source: extracted.source,
      error:
        'The JSON doesn\'t contain a spaces list — expected { "spaces": [ … ] }.',
    };
  }

  const rows: ImportRow[] = [];
  const rowErrors: ImportRowError[] = [];
  const seenNames = new Set(
    existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean)
  );

  envelope.data.spaces.forEach((element, index) => {
    const parsed = aiSpaceSchema.safeParse(element);
    if (!parsed.success) {
      const rawName = (element as { name?: unknown } | null)?.name;
      rowErrors.push({
        index,
        name: typeof rawName === "string" ? rawName : undefined,
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "row"}: ${i.message}`
        ),
      });
      return;
    }
    rows.push(normalizeRow(parsed.data, sections, seenNames));
  });

  return { rows, rowErrors, source: extracted.source, error: null };
}

function normalizeRow(
  ai: AiSpace,
  sections: FloorSectionLike[],
  seenNames: Set<string>
): ImportRow {
  const warnings: string[] = [];

  // Floors: prefer the array, tolerate a single string; first match is the
  // primary floor, further matches become mirrors ("typical" units).
  const floorInputs = ai.floors.length > 0 ? ai.floors : ai.floor ? [ai.floor] : [];
  const matchedIds: string[] = [];
  for (const f of floorInputs) {
    const match = matchFloorByName(f, sections);
    if (match) {
      if (!matchedIds.includes(match.id)) matchedIds.push(match.id);
    } else if (f.trim()) {
      warnings.push(`Floor "${f.trim()}" not recognised — assign it below.`);
    }
  }

  let hIn = ai.height ?? null;
  if (hIn === null) {
    hIn = DEFAULT_CEILING_HEIGHT_IN;
    warnings.push("Height assumed 10'.");
  }

  const openings: SpaceOpening[] = [
    ...ai.doors.map((d) => toOpening("door", d, warnings)),
    ...ai.windows.map((w) => toOpening("window", w, warnings)),
  ];

  let wallTileEnabled = ai.wall_tile;
  let tilingHeightIn = ai.tiling_height ?? null;
  // Bathroom safety net — mirror the SpaceDialog behavior even when the AI
  // forgot the wall_tile flag.
  if (ai.type === "bathroom" && !wallTileEnabled) {
    wallTileEnabled = true;
  }
  if (wallTileEnabled && tilingHeightIn === null) {
    tilingHeightIn = WALL_TILE_DEFAULT_HEIGHT_IN;
    warnings.push("Wall tile height assumed 7'.");
  }

  const nameKey = ai.name.trim().toLowerCase();
  if (seenNames.has(nameKey)) {
    warnings.push("Duplicate name — a space with this name already exists.");
  }
  seenNames.add(nameKey);

  const doorCount = ai.doors.reduce((s, d) => s + d.count, 0);
  if (ai.type === "corridor" && doorCount <= 1) {
    warnings.push(
      "Corridors usually have several door openings — check the door count or skirting overstates."
    );
  } else if (doorCount === 0 && ai.type !== "balcony") {
    warnings.push("No doors — skirting uses the full perimeter.");
  }

  return {
    key: rid(),
    include: true,
    name: ai.name.trim(),
    type: ai.type,
    sectionId: matchedIds[0] ?? null,
    mirroredSectionIds: matchedIds.slice(1),
    floorRaw: floorInputs.map((f) => f.trim()).filter(Boolean).join(", ") || null,
    xIn: ai.x,
    yIn: ai.y,
    hIn,
    openings,
    wallTileEnabled,
    tilingHeightIn,
    graniteLines: ai.granite.map((g) => ({
      id: rid(),
      label: g.label || "Granite",
      length_in: g.length,
      width_in: g.width,
      count: g.count,
    })),
    notes: ai.notes?.trim() || null,
    warnings,
  };
}

function toOpening(
  kind: "door" | "window",
  o: { width: number; height?: number | null; count: number },
  warnings: string[]
): SpaceOpening {
  if (o.width > OPENING_WIDTH_SUSPICIOUS_IN) {
    warnings.push(
      `A ${kind} is ${Math.round(o.width / 12)}' wide — check (was that inches?).`
    );
  }
  return {
    id: rid(),
    kind,
    width_in: o.width,
    height_in:
      o.height ??
      (kind === "door" ? DOOR_DEFAULT_HEIGHT_IN : WINDOW_DEFAULT_HEIGHT_IN),
    count: o.count,
  };
}

// ==================== commit mapping ====================

/** Mirrors SpaceDialog's create payload exactly (X→length, Y→width). */
export function rowToSpaceInsert(
  row: ImportRow,
  siteId: string,
  sortOrder: number
): SpaceInsert {
  return {
    site_id: siteId,
    section_id: row.sectionId,
    mirrored_section_ids: row.mirroredSectionIds.filter(
      (id) => id !== row.sectionId
    ),
    name: row.name,
    space_type: row.type,
    drawing_length_in: row.xIn,
    drawing_width_in: row.yIn,
    drawing_height_in: row.hIn,
    verified_length_in: null,
    verified_width_in: null,
    verified_height_in: null,
    verified_by: null,
    verified_at: null,
    openings: row.openings.filter((o) => o.width_in > 0),
    wall_tile_enabled: row.wallTileEnabled,
    tiling_height_in: row.wallTileEnabled ? row.tilingHeightIn : null,
    granite_lines: row.graniteLines.filter(
      (l) => l.length_in > 0 && l.width_in > 0
    ),
    overrides: {},
    photos: [],
    tile_option_id: null,
    tile_layout: {},
    notes: row.notes,
    sort_order: sortOrder,
  };
}

/** Throwaway Space for live preview quantities (computeQuantities). */
export function draftSpaceFromRow(row: ImportRow, siteId: string): Space {
  return {
    id: row.key,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...rowToSpaceInsert(row, siteId, 0),
  };
}
