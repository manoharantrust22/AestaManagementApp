import { describe, it, expect } from "vitest";
import { buildMaterialPipeline } from "./MaterialThreadPipeline";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

/** Minimal standard (non-spot, non-advance) group thread for pipeline tests. */
function thread(overrides: Partial<MaterialThread>): MaterialThread {
  return {
    id: "t1",
    source: "material_request",
    source_row_id: "r1",
    site_id: "s1",
    section: null,
    floor: null,
    priority: "normal",
    material_id: "m1",
    material_name: "PPC Cement",
    material_unit: "bag",
    qty: 50,
    requested_at: "2025-11-21",
    kind: "group",
    advance: false,
    stage: "exhausted",
    ...overrides,
  } as unknown as MaterialThread;
}

const finalNode = (t: MaterialThread) =>
  buildMaterialPipeline(t).steps.find((s) => s.key === "in-use")!;

describe("buildMaterialPipeline — terminal inter-site state", () => {
  it("exhausted + pending_usage → amber INTER-SITE node + 'settle' chip", () => {
    const t = thread({
      stage: "exhausted",
      inter_site_applicable: true,
      inter_site_status: "pending_usage",
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("INTER-SITE");
    expect(node.state).toBe("current");
    expect(model.accent).toBe(hubTokens.warn);
    expect(model.interSite).toBe("settle");
  });

  it("exhausted + raised_unpaid → amber INTER-SITE node (NOT green DONE) + 'awaiting' chip", () => {
    // The core bug: a settlement was Generated (usage rows → in_settlement) but
    // not paid. The card must NOT read as done/settled.
    const t = thread({
      stage: "exhausted",
      inter_site_applicable: true,
      inter_site_status: "raised_unpaid",
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("INTER-SITE");
    expect(node.state).toBe("current");
    expect(node.state).not.toBe("success");
    expect(model.accent).toBe(hubTokens.warn);
    expect(model.interSite).toBe("awaiting");
  });

  it("exhausted + inter-site settled → green DONE + settled chip", () => {
    const t = thread({
      stage: "exhausted",
      inter_site_applicable: true,
      inter_site_status: "settled",
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("DONE");
    expect(node.state).toBe("success");
    expect(model.accent).toBe(hubTokens.primary);
    expect(model.interSite).toBe("settled");
  });

  it("exhausted + no inter-site (own-site 'All clear') → green DONE, no chip", () => {
    const node = finalNode(thread({ stage: "exhausted", kind: "own" }));
    expect(node.label).toBe("DONE");
    expect(node.state).toBe("success");
    expect(buildMaterialPipeline(thread({ stage: "exhausted" })).interSite).toBeNull();
  });

  it("still in-use + pending_usage → blue IN USE pulse + dormant chip", () => {
    const t = thread({
      stage: "in-use",
      inter_site_applicable: true,
      inter_site_status: "pending_usage",
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("IN USE");
    expect(node.state).toBe("current");
    expect(model.accent).toBe(hubTokens.primary);
    expect(model.interSite).toBe("dormant");
  });

  it("legacy boolean fallback (no inter_site_status) → outstanding stays amber", () => {
    const t = thread({
      stage: "exhausted",
      inter_site_applicable: true,
      inter_site_pending: true,
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("INTER-SITE");
    expect(model.interSite).toBe("settle");
  });
});
