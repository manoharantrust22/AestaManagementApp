import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordPriceDialog } from "../RecordPriceDialog";
import type { Material } from "@/types/material.types";

// Stub hooks
vi.mock("@/hooks/queries/useVendors", () => ({
  useVendors: () => ({ data: [{ id: "v1", name: "ARM Cement & Steel" }] }),
}));
vi.mock("@/hooks/queries/useVendorInventory", () => ({
  useRecordPriceEntry: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

const BASE_MATERIAL: Material = {
  id: "m1",
  name: "PPC Cement",
  code: null,
  local_name: null,
  category_id: null,
  parent_id: null,
  description: null,
  unit: "bag",
  secondary_unit: null,
  conversion_factor: null,
  hsn_code: null,
  gst_rate: null,
  specifications: null,
  weight_per_unit: null,
  weight_unit: null,
  length_per_piece: null,
  length_unit: null,
  rods_per_bundle: null,
  min_order_qty: null,
  reorder_level: null,
  image_url: null,
  sold_in_packs: false,
  is_active: true,
  created_at: "",
  updated_at: "",
  created_by: null,
};

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>
    {ui}
  </QueryClientProvider>
);

describe("RecordPriceDialog", () => {
  it("renders when open", () => {
    render(
      wrap(
        <RecordPriceDialog
          open={true}
          onClose={vi.fn()}
          material={BASE_MATERIAL}
          variants={[]}
          brands={[]}
        />
      )
    );
    expect(screen.getByText(/record price/i)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /price/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      wrap(
        <RecordPriceDialog
          open={false}
          onClose={vi.fn()}
          material={BASE_MATERIAL}
          variants={[]}
          brands={[]}
        />
      )
    );
    expect(screen.queryByText(/record price/i)).not.toBeInTheDocument();
  });

  it("shows variant selector only when variants provided", () => {
    const variants: Material[] = [
      { ...BASE_MATERIAL, id: "v1", name: "43", parent_id: "m1" },
    ];
    render(
      wrap(
        <RecordPriceDialog
          open={true}
          onClose={vi.fn()}
          material={BASE_MATERIAL}
          variants={variants}
          brands={[]}
        />
      )
    );
    expect(screen.getByLabelText(/grade.*variant/i)).toBeInTheDocument();
  });

  it("submit button disabled when price is empty", () => {
    render(
      wrap(
        <RecordPriceDialog
          open={true}
          onClose={vi.fn()}
          material={BASE_MATERIAL}
          variants={[]}
          brands={[]}
        />
      )
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
});
