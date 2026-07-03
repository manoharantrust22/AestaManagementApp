import { describe, it, expect } from "vitest";
import {
  canonicalTrade,
  buildTradeOptions,
  humanizeVendorType,
  normalizeDirectory,
  tradeChipsOf,
  sourceCountsOf,
  type RawLaborer,
  type RawVendor,
  type RawTeam,
} from "./directory";
import type { TechnicianRow } from "@/types/directory.types";

function tech(partial: Partial<TechnicianRow> & { id: string; name: string }): TechnicianRow {
  return {
    id: partial.id,
    company_id: "co-1",
    name: partial.name,
    phone: partial.phone ?? null,
    whatsapp_number: partial.whatsapp_number ?? null,
    email: partial.email ?? null,
    trade: partial.trade ?? null,
    specialties: partial.specialties ?? [],
    area: partial.area ?? null,
    worked_with: partial.worked_with ?? false,
    photo_url: partial.photo_url ?? null,
    notes: partial.notes ?? null,
    contact_kind: partial.contact_kind ?? "technician",
    website: partial.website ?? null,
    is_active: partial.is_active ?? true,
    created_at: "2026-06-06T00:00:00Z",
    updated_at: "2026-06-06T00:00:00Z",
    created_by: null,
  };
}

const laborer = (p: Partial<RawLaborer> & { id: string; name: string }): RawLaborer => ({
  id: p.id,
  name: p.name,
  phone: p.phone ?? "9000000000",
  category_name: p.category_name ?? "Mason",
  skillCategoryIds: p.skillCategoryIds ?? [],
  address: p.address ?? null,
  photo_url: p.photo_url ?? null,
});

describe("canonicalTrade", () => {
  it("collapses synonyms to one key", () => {
    expect(canonicalTrade("Electrician")).toBe(canonicalTrade("Electrical"));
    expect(canonicalTrade("Carpenter")).toBe(canonicalTrade("Carpentry"));
    expect(canonicalTrade("CCTV Camera")).toBe(canonicalTrade("cctv"));
  });
  it("is case and whitespace insensitive", () => {
    expect(canonicalTrade("  Pump   Motor ")).toBe(canonicalTrade("pump motor"));
  });
  it("returns empty for blank", () => {
    expect(canonicalTrade(null)).toBe("");
    expect(canonicalTrade("   ")).toBe("");
  });
});

describe("humanizeVendorType / buildTradeOptions", () => {
  it("humanizes vendor types", () => {
    expect(humanizeVendorType("dealer")).toBe("Dealer");
    expect(humanizeVendorType("rental_store")).toBe("Rental store");
    expect(humanizeVendorType(null)).toBeNull();
  });
  it("dedupes options by canonical key, technician trades first", () => {
    const opts = buildTradeOptions(["Electrical", "Tiling", "Welding"]);
    // "Electrical" collapses into the existing "Electrician" → not added twice
    const electricianish = opts.filter(
      (o) => canonicalTrade(o) === canonicalTrade("Electrician")
    );
    expect(electricianish).toHaveLength(1);
    expect(opts[0]).toBe("Electrician"); // TECHNICIAN_TRADES come first
  });
});

describe("normalizeDirectory dedupe", () => {
  const categoryNameById = { "cat-mason": "Mason", "cat-elec": "Electrician" };

  it("maps a technician with specialties", () => {
    const out = normalizeDirectory({
      technicians: [tech({ id: "t1", name: "Ravi CCTV", trade: "CCTV", specialties: ["Networking"] })],
      laborers: [],
      vendors: [],
      teams: [],
      categoryNameById,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "technician",
      id: "tech:t1",
      sourceRowId: "t1",
      trade: "CCTV",
      secondaryTrades: ["Networking"],
      profileHref: null,
    });
    expect(out[0].rawTechnician?.id).toBe("t1");
  });

  it("flags a laborer who is a team leader via leader_laborer_id (no duplicate mestri)", () => {
    const out = normalizeDirectory({
      technicians: [],
      laborers: [laborer({ id: "L1", name: "Kumar" })],
      vendors: [],
      teams: [
        { id: "team1", name: "Kumar Gang", leader_name: "Kumar", leader_phone: "9111111111", leader_laborer_id: "L1" },
      ],
      categoryNameById,
    });
    const laborerEntry = out.find((e) => e.id === "lab:L1");
    expect(laborerEntry?.alsoMestri).toBe(true);
    expect(laborerEntry?.sourceRowId).toBe("L1");
    expect(out.some((e) => e.source === "mestri")).toBe(false);
  });

  it("flags by legacy name match when there is no leader_laborer_id", () => {
    const out = normalizeDirectory({
      technicians: [],
      laborers: [laborer({ id: "L2", name: "Saro" })],
      vendors: [],
      teams: [
        { id: "team2", name: "Saro Team", leader_name: "saro", leader_phone: "9222222222", leader_laborer_id: null },
      ],
      categoryNameById,
    });
    expect(out.find((e) => e.id === "lab:L2")?.alsoMestri).toBe(true);
    expect(out.some((e) => e.source === "mestri")).toBe(false);
  });

  it("emits a standalone mestri when the leader is not a present laborer", () => {
    const out = normalizeDirectory({
      technicians: [],
      laborers: [],
      vendors: [],
      teams: [
        { id: "team3", name: "Old Gang", leader_name: "Legacy Boss", leader_phone: "9333333333", leader_laborer_id: null },
      ],
      categoryNameById,
    });
    const mestri = out.find((e) => e.source === "mestri");
    expect(mestri).toBeTruthy();
    expect(mestri?.name).toBe("Legacy Boss");
    expect(mestri?.phone).toBe("9333333333");
  });

  it("skips a standalone mestri with no phone (uncontactable)", () => {
    const out = normalizeDirectory({
      technicians: [],
      laborers: [],
      vendors: [],
      teams: [
        { id: "team4", name: "Ghost", leader_name: "No Phone", leader_phone: null, leader_laborer_id: null },
      ],
      categoryNameById,
    });
    expect(out.some((e) => e.source === "mestri")).toBe(false);
  });

  it("maps a vendor, using first specialization as the trade", () => {
    const vendors: RawVendor[] = [
      {
        id: "V1",
        name: "SafeEye CCTV",
        phone: "9444444444",
        whatsapp_number: null,
        email: null,
        contact_person: "Mani",
        vendor_type: "dealer",
        specializations: ["CCTV", "Networking"],
        serving_locations: ["Chennai"],
        shop_photo_url: null,
      },
    ];
    const out = normalizeDirectory({
      technicians: [],
      laborers: [],
      vendors,
      teams: [],
      categoryNameById,
    });
    const v = out.find((e) => e.id === "ven:V1");
    expect(v).toMatchObject({
      source: "vendor",
      sourceRowId: "V1",
      trade: "CCTV",
      area: "Chennai",
      // per-id deep link (the /company/vendors/[id] page) — used by the drawer
      profileHref: "/company/vendors/V1",
    });
    expect(v?.secondaryTrades).toEqual(["Networking"]);
    expect(v?.notes).toContain("Mani");
  });

  it("excludes inactive technicians", () => {
    const out = normalizeDirectory({
      technicians: [tech({ id: "t9", name: "Gone", is_active: false })],
      laborers: [],
      vendors: [],
      teams: [],
      categoryNameById,
    });
    expect(out).toHaveLength(0);
  });

  it("maps a brand contact to the brand source (own id, website, no technician-only fields)", () => {
    const out = normalizeDirectory({
      technicians: [
        tech({
          id: "b1",
          name: "Asian Paints Customer Care",
          contact_kind: "brand",
          trade: "Paint",
          website: "asianpaints.com",
          // technician-only fields set on the row must NOT surface on a brand entry
          specialties: ["ignored"],
          area: "ignored",
          worked_with: true,
        }),
      ],
      laborers: [],
      vendors: [],
      teams: [],
      categoryNameById,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "brand",
      id: "brand:b1",
      sourceRowId: "b1",
      trade: "Paint",
      website: "asianpaints.com",
      secondaryTrades: [],
      area: null,
      workedWith: false,
      profileHref: null,
    });
    // still a technicians-table row → edit/delete hydrate from rawTechnician
    expect(out[0].rawTechnician?.id).toBe("b1");
  });
});

describe("sourceCountsOf + tradeChipsOf", () => {
  const categoryNameById = { "cat-elec": "Electrician" };

  it("counts an alsoMestri laborer under both laborer and mestri", () => {
    const out = normalizeDirectory({
      technicians: [],
      laborers: [laborer({ id: "L1", name: "Kumar" })],
      vendors: [],
      teams: [
        { id: "team1", name: "Kumar Gang", leader_name: "Kumar", leader_phone: "9111111111", leader_laborer_id: "L1" },
      ],
      categoryNameById,
    });
    const counts = sourceCountsOf(out);
    expect(counts.laborer).toBe(1);
    expect(counts.mestri).toBe(1);
  });

  it("groups trade chips by canonical key across sources", () => {
    const out = normalizeDirectory({
      technicians: [tech({ id: "t1", name: "A", trade: "Electrician" })],
      laborers: [laborer({ id: "L1", name: "B", category_name: "Electrical" })],
      vendors: [],
      teams: [],
      categoryNameById,
    });
    const chips = tradeChipsOf(out);
    const elec = chips.find((c) => c.key === canonicalTrade("Electrician"));
    expect(elec?.count).toBe(2); // technician + laborer collapse into one chip
  });

  it("counts brand contacts and keeps their category out of the trade rail", () => {
    const out = normalizeDirectory({
      technicians: [
        tech({ id: "t1", name: "A", trade: "Painter" }),
        tech({ id: "b1", name: "Asian Paints", contact_kind: "brand", trade: "Paint" }),
      ],
      laborers: [],
      vendors: [],
      teams: [],
      categoryNameById,
    });
    const counts = sourceCountsOf(out);
    expect(counts.technician).toBe(1);
    expect(counts.brand).toBe(1);
    // "Paint" (brand product category) must not become a trade chip; "Painter" (technician) stays.
    const chips = tradeChipsOf(out);
    expect(chips.some((c) => c.key === canonicalTrade("Paint"))).toBe(false);
    expect(chips.some((c) => c.key === canonicalTrade("Painter"))).toBe(true);
  });
});
