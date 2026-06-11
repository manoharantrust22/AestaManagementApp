import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// One mutable rows array the mocked useUsageLog serves to every render.
let mockRows: any[] = [];

vi.mock("@/hooks/queries/useUsageLog", () => ({
  useUsageLog: () => ({
    rows: mockRows,
    isLoading: false,
    totalUsed: mockRows.reduce((s, r) => s + r.quantity, 0),
    isBatchExact: true,
  }),
}));

const mutationStub = () => ({ mutateAsync: vi.fn(), isPending: false });
vi.mock("@/hooks/queries/useBatchUsage", () => ({
  useUpdateBatchUsage: () => mutationStub(),
  useDeleteBatchUsage: () => mutationStub(),
}));
vi.mock("@/hooks/queries/useMaterialUsage", () => ({
  useUpdateMaterialUsage: () => mutationStub(),
  useDeleteMaterialUsage: () => mutationStub(),
}));

// Edit dialogs pull in heavy query providers — irrelevant to the gate under test.
vi.mock("@/components/materials/BatchUsageEditDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/materials/PoolUsageEditDialog", () => ({
  default: () => null,
}));

import { render, screen } from "@testing-library/react";
import UsageLogList from "./UsageLogList";
import type { UsageLogItem } from "@/hooks/queries/useUsageLog";

const item: UsageLogItem = {
  material_id: "mat-1",
  brand_id: null,
  material_name: "PPC Cement (50kg bag)",
  material_unit: "bag",
  batch_code: "MAT-260217-1555",
  kind: "group",
};

function batchRow(overrides: Partial<any> = {}) {
  return {
    id: "usage-1",
    source: "batch",
    usage_date: "2026-02-25",
    quantity: 0.5,
    unit: "bag",
    work_description: "Ground floor brick work",
    recorded_by_name: "Ajith Kumar",
    usage_site_id: "site-A",
    usage_site_name: "Srinivasan House & Shop",
    settlement_status: "pending",
    unit_cost: 280,
    total_cost: 140,
    batch_ref_code: "MAT-260217-1555",
    material_id: "mat-1",
    brand_id: "brand-1",
    material_name: "PPC Cement (50kg bag)",
    brand_name: "Chettinad",
    ...overrides,
  };
}

describe("UsageLogList per-site edit gate", () => {
  beforeEach(() => {
    mockRows = [batchRow()];
  });

  it("allows edit/delete when the row was used at the viewer's site, even if the thread belongs to another site", () => {
    // Bug repro: group thread owned by the requesting site (site-B) viewed from
    // the site that actually used the material (site-A). Was locked everywhere.
    render(
      <UsageLogList item={item} siteId="site-B" currentSiteId="site-A" canEdit />
    );
    expect(screen.getByLabelText("Edit usage")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete usage")).toBeInTheDocument();
  });

  it("locks the row at other sites and names the site that recorded it", () => {
    render(
      <UsageLogList item={item} siteId="site-B" currentSiteId="site-B" canEdit />
    );
    expect(screen.queryByLabelText("Edit usage")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Recorded at Srinivasan House & Shop — edit it from that site."
      )
    ).toBeInTheDocument();
  });

  it("falls back to siteId when currentSiteId is absent (UsageHistoryDialog path)", () => {
    render(<UsageLogList item={item} siteId="site-A" canEdit />);
    expect(screen.getByLabelText("Edit usage")).toBeInTheDocument();
  });

  it("keeps settled rows locked with the settlement message regardless of site", () => {
    mockRows = [batchRow({ settlement_status: "settled" })];
    render(
      <UsageLogList item={item} siteId="site-B" currentSiteId="site-A" canEdit />
    );
    expect(screen.queryByLabelText("Edit usage")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Settled — reverse the settlement (Settlement block) before editing."
      )
    ).toBeInTheDocument();
  });
});
