import { describe, expect, it } from "vitest";

import { computeQuantities } from "./measurements";
import {
  buildSpacesImportPrompt,
  draftSpaceFromRow,
  parseSpacesImport,
  rowToSpaceInsert,
} from "./importSpaces";

const SECTIONS = [
  { id: "gf", name: "Ground Floor", sequence_order: 4 },
  { id: "ff", name: "First Floor", sequence_order: 5 },
  { id: "sf", name: "Second Floor", sequence_order: 6 },
];

const wrap = (json: string) => "```json\n" + json + "\n```";

describe("buildSpacesImportPrompt", () => {
  it("embeds floor names verbatim and the core conventions", () => {
    const prompt = buildSpacesImportPrompt({
      floorNames: ["Ground Floor", "First Floor"],
    });
    expect(prompt).toContain("- Ground Floor");
    expect(prompt).toContain("- First Floor");
    expect(prompt).toContain("HORIZONTAL dimension");
    expect(prompt).toContain("horizontal (X)");
    expect(prompt).toContain(`"10'"`);
    expect(prompt).toContain("3' x 7' door");
    expect(prompt).toContain(`"tiling_height": "7'"`);
    expect(prompt).toContain("```json");
  });

  it("handles an empty floor list", () => {
    const prompt = buildSpacesImportPrompt({ floorNames: [] });
    expect(prompt).toContain("no floors defined");
  });
});

describe("parseSpacesImport — happy path", () => {
  const kitchen = {
    name: "Kitchen",
    type: "kitchen",
    floors: ["Ground Floor"],
    x: "9'",
    y: "9'",
    height: "10'",
    doors: [{ width: "3'", height: "7'", count: 1 }],
    windows: [{ width: "3'", height: "4'", count: 1 }],
    granite: [{ label: "Kitchen counter", length: "8'", width: "2'", count: 1 }],
  };

  it("parses a fenced full object and computes quantities", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [kitchen] })),
      SECTIONS
    );
    expect(result.error).toBeNull();
    expect(result.source).toBe("fenced");
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.name).toBe("Kitchen");
    expect(row.type).toBe("kitchen");
    expect(row.sectionId).toBe("gf");
    expect(row.xIn).toBe(108);
    expect(row.yIn).toBe(108);
    expect(row.hIn).toBe(120);
    expect(row.openings).toHaveLength(2);
    expect(row.graniteLines).toHaveLength(1);

    const q = computeQuantities(draftSpaceFromRow(row, "site1"), "drawing");
    expect(q.floorTileSqft).toBe(81); // 9 × 9
    expect(q.skirtingRft).toBe(33); // 36' perimeter − 3' door
    expect(q.graniteSqft).toBe(16); // 8 × 2
  });

  it("tolerates a bare top-level array and a raw (unfenced) paste", () => {
    const result = parseSpacesImport(JSON.stringify([kitchen]), SECTIONS);
    expect(result.rows).toHaveLength(1);
    expect(result.source).toBe("raw");
  });

  it("tolerates prose around the JSON (loose extraction)", () => {
    const result = parseSpacesImport(
      `Here is your data: ${JSON.stringify({ spaces: [kitchen] })} hope this helps!`,
      SECTIONS
    );
    expect(result.rows).toHaveLength(1);
    expect(result.source).toBe("loose");
  });

  it("parses Unicode prime dimensions", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [{ ...kitchen, x: "9′4″", y: "11′" }] })),
      SECTIONS
    );
    expect(result.rows[0].xIn).toBe(112);
    expect(result.rows[0].yIn).toBe(132);
  });
});

describe("parseSpacesImport — tolerance & normalization", () => {
  const minimal = { name: "Room", x: "10'", y: "10'" };

  it("defaults type to other and lowercases known labels", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            { ...minimal, name: "Hall", type: "Hall" },
            { ...minimal, name: "Bed", type: "BEDROOM" },
            { ...minimal, name: "NoType" },
          ],
        })
      ),
      SECTIONS
    );
    expect(result.rows.map((r) => r.type)).toEqual([
      "other",
      "bedroom",
      "other",
    ]);
  });

  it("defaults missing height to 10' with a warning", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [minimal] })),
      SECTIONS
    );
    expect(result.rows[0].hIn).toBe(120);
    expect(result.rows[0].warnings).toContain("Height assumed 10'.");
  });

  it("bathroom safety net: wall tile enabled at 7' even when the AI forgot", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [{ ...minimal, type: "bathroom" }] })),
      SECTIONS
    );
    const row = result.rows[0];
    expect(row.wallTileEnabled).toBe(true);
    expect(row.tilingHeightIn).toBe(84);
    expect(row.warnings.join(" ")).toContain("Wall tile height assumed");
  });

  it("wall_tile true without height gets 7' + warning", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [{ ...minimal, wall_tile: true }] })),
      SECTIONS
    );
    expect(result.rows[0].tilingHeightIn).toBe(84);
  });

  it("matches floors case-insensitively; multi-floor becomes primary + mirrors", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            { ...minimal, name: "Unit A", floors: ["first floor", "Second Floor"] },
          ],
        })
      ),
      SECTIONS
    );
    const row = result.rows[0];
    expect(row.sectionId).toBe("ff");
    expect(row.mirroredSectionIds).toEqual(["sf"]);
  });

  it("tolerates a single `floor` string field", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [{ ...minimal, floor: "Ground" }] })),
      SECTIONS
    );
    expect(result.rows[0].sectionId).toBe("gf");
  });

  it("unmatched floor → null section + warning", () => {
    const result = parseSpacesImport(
      wrap(JSON.stringify({ spaces: [{ ...minimal, floors: ["GF"] }] })),
      SECTIONS
    );
    const row = result.rows[0];
    expect(row.sectionId).toBeNull();
    expect(row.floorRaw).toBe("GF");
    expect(row.warnings.join(" ")).toContain(`Floor "GF" not recognised`);
  });

  it("defaults door/window heights and counts", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            {
              ...minimal,
              doors: [{ width: "3'" }],
              windows: [{ width: "4'", count: 2 }],
            },
          ],
        })
      ),
      SECTIONS
    );
    const [door, win] = result.rows[0].openings;
    expect(door.kind).toBe("door");
    expect(door.height_in).toBe(84);
    expect(door.count).toBe(1);
    expect(win.kind).toBe("window");
    expect(win.height_in).toBe(48);
    expect(win.count).toBe(2);
  });

  it("warns on implausibly wide openings", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [{ ...minimal, doors: [{ width: "36'", height: "7'" }] }],
        })
      ),
      SECTIONS
    );
    expect(result.rows[0].warnings.join(" ")).toContain("36' wide");
  });

  it("warns on duplicate names — within the batch and vs existing spaces", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            { ...minimal, name: "Bed 1" },
            { ...minimal, name: "bed 1" },
            { ...minimal, name: "Kitchen" },
          ],
        })
      ),
      SECTIONS,
      ["Kitchen"]
    );
    expect(result.rows[0].warnings.join(" ")).not.toContain("Duplicate");
    expect(result.rows[1].warnings.join(" ")).toContain("Duplicate name");
    expect(result.rows[2].warnings.join(" ")).toContain("Duplicate name");
  });

  it("warns when a corridor has ≤1 door and when a room has none", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            { ...minimal, name: "Corridor", type: "corridor" },
            { ...minimal, name: "Store" },
            { ...minimal, name: "Balcony", type: "balcony" },
          ],
        })
      ),
      SECTIONS
    );
    expect(result.rows[0].warnings.join(" ")).toContain("Corridors usually");
    expect(result.rows[1].warnings.join(" ")).toContain("skirting uses the full perimeter");
    expect(
      result.rows[2].warnings.some((w) => w.includes("skirting uses"))
    ).toBe(false);
  });
});

describe("parseSpacesImport — failure isolation", () => {
  it("a bad dimension isolates that row; others survive", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            { name: "Good", x: "10'", y: "10'" },
            { name: "Bad", x: "9'14\"", y: "10'" },
          ],
        })
      ),
      SECTIONS
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Good");
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].name).toBe("Bad");
    expect(result.rowErrors[0].issues.join(" ")).toContain(`"9'14\""`);
  });

  it("prose with no JSON is a friendly fatal error", () => {
    const result = parseSpacesImport("Sorry, I cannot read this plan.", SECTIONS);
    expect(result.rows).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });

  it("JSON without a spaces list is a fatal error", () => {
    const result = parseSpacesImport(wrap(`{"rooms": []}`), SECTIONS);
    expect(result.error).toContain("spaces");
  });
});

describe("rowToSpaceInsert", () => {
  it("produces the exact SpaceDialog create shape", () => {
    const result = parseSpacesImport(
      wrap(
        JSON.stringify({
          spaces: [
            {
              name: "Bed 2",
              type: "bedroom",
              floors: ["Ground Floor", "First Floor"],
              x: "9'4\"",
              y: "11'",
              height: "10'",
              doors: [{ width: "3'", height: "7'", count: 1 }],
            },
          ],
        })
      ),
      SECTIONS
    );
    const insert = rowToSpaceInsert(result.rows[0], "site1", 3);
    expect(insert).toMatchObject({
      site_id: "site1",
      section_id: "gf",
      mirrored_section_ids: ["ff"],
      name: "Bed 2",
      space_type: "bedroom",
      drawing_length_in: 112, // X → length column
      drawing_width_in: 132, // Y → width column
      drawing_height_in: 120,
      verified_length_in: null,
      verified_width_in: null,
      verified_height_in: null,
      verified_by: null,
      verified_at: null,
      wall_tile_enabled: false,
      tiling_height_in: null,
      overrides: {},
      photos: [],
      tile_option_id: null,
      tile_layout: {},
      sort_order: 3,
    });
    expect(insert.openings).toHaveLength(1);
  });
});

describe("Srinivasan plan end-to-end", () => {
  const SAMPLE = {
    spaces: [
      { name: "Kitchen", type: "kitchen", floors: ["Ground Floor"], x: "9'", y: "9'", height: "10'", doors: [{ width: "3'", height: "7'", count: 1 }], windows: [{ width: "3'", height: "4'", count: 1 }], granite: [{ label: "Kitchen counter", length: "8'", width: "2'", count: 1 }] },
      { name: "Bed 2", type: "bedroom", floors: ["Ground Floor"], x: "9'4\"", y: "11'", height: "10'", doors: [{ width: "3'", height: "7'", count: 1 }], windows: [{ width: "4'", height: "4'", count: 1 }] },
      { name: "Bath", type: "bathroom", floors: ["Ground Floor"], x: "4'6\"", y: "7'", height: "10'", doors: [{ width: "2'6\"", height: "7'", count: 1 }], wall_tile: true, tiling_height: "7'" },
      { name: "Bed 1", type: "bedroom", floors: ["Ground Floor"], x: "9'2\"", y: "12'", height: "10'", doors: [{ width: "3'", height: "7'", count: 1 }], windows: [{ width: "4'", height: "4'", count: 1 }] },
      { name: "Living", type: "living", floors: ["Ground Floor"], x: "9'5\"", y: "13'11\"", height: "10'", doors: [{ width: "3'6\"", height: "7'", count: 1 }] },
      { name: "Corridor", type: "corridor", floors: ["Ground Floor"], x: "4'2\"", y: "40'8\"", height: "10'", doors: [{ width: "3'", height: "7'", count: 4 }] },
      { name: "Shop", type: "other", floors: ["Ground Floor"], x: "8'2\"", y: "16'9\"", height: "10'", doors: [{ width: "7'", height: "7'", count: 1 }] },
    ],
  };

  it("parses all 7 rooms with correct per-room quantities", () => {
    const result = parseSpacesImport(wrap(JSON.stringify(SAMPLE)), SECTIONS);
    expect(result.rowErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(7);
    expect(result.rows.every((r) => r.sectionId === "gf")).toBe(true);

    const q = (i: number) =>
      computeQuantities(draftSpaceFromRow(result.rows[i], "site1"), "drawing");

    expect(q(0).floorTileSqft).toBe(81); // Kitchen 9×9
    expect(q(0).graniteSqft).toBe(16);
    expect(q(1).floorTileSqft).toBe(102.67); // Bed 2 9'4"×11'
    expect(q(2).floorTileSqft).toBe(31.5); // Bath 4'6"×7'
    expect(q(2).wallTileSqft).toBe(143.5); // 23' × 7' − 2'6"×7' door
    expect(q(3).floorTileSqft).toBe(110); // Bed 1 9'2"×12'
    expect(q(4).floorTileSqft).toBe(131.05); // Living 9'5"×13'11"
    expect(q(5).floorTileSqft).toBe(169.44); // Corridor 4'2"×40'8"
    expect(q(6).floorTileSqft).toBe(136.79); // Shop 8'2"×16'9"
  });
});
