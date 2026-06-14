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
  it("exhausted + pending inter-site → amber INTER-SITE node (not green DONE)", () => {
    const t = thread({
      stage: "exhausted",
      inter_site_applicable: true,
      inter_site_pending: true,
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("INTER-SITE");
    expect(node.state).toBe("current");
    expect(model.accent).toBe(hubTokens.warn);
    // The chip echoes the action on the (label-less) mobile bar.
    expect(model.interSite).toBe("active");
  });

  it("exhausted + inter-site settled → green DONE + settled chip", () => {
    const t = thread({
      stage: "exhausted",
      inter_site_applicable: true,
      inter_site_pending: false,
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

  it("still in-use + pending inter-site → blue IN USE pulse + dormant chip", () => {
    const t = thread({
      stage: "in-use",
      inter_site_applicable: true,
      inter_site_pending: true,
    });
    const model = buildMaterialPipeline(t);
    const node = model.steps.find((s) => s.key === "in-use")!;
    expect(node.label).toBe("IN USE");
    expect(node.state).toBe("current");
    expect(model.accent).toBe(hubTokens.primary);
    expect(model.interSite).toBe("dormant");
  });
});
