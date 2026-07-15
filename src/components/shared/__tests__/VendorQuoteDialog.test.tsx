import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VendorQuoteDialog } from "../VendorQuoteDialog";
import type { MaterialWithDetails, VendorWithCategories } from "@/types/material.types";

const upsertMutate = vi.fn().mockResolvedValue({});

vi.mock("@/hooks/queries/useVendorInventory", () => ({
  useUpsertVendorInventory: () => ({
    mutateAsync: upsertMutate,
    isPending: false,
  }),
}));
vi.mock("@/hooks/queries/useMaterials", () => ({
  useMaterial: () => ({ refetch: vi.fn() }),
  useCreateMaterial: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/queries/useVendors", () => ({
  useVendor: () => ({ refetch: vi.fn() }),
  useCreateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const VENDOR = {
  id: "v1",
  name: "Vijaya Plywoods Trichy",
  shop_name: null,
  city: "Trichy",
} as unknown as VendorWithCategories;

const baseMaterial = (over: Partial<MaterialWithDetails>): MaterialWithDetails =>
  ({
    id: "m1",
    name: "Plywood",
    code: "PLY-0001",
    unit: "sqft",
    parent_id: null,
    gst_rate: 18,
    is_active: true,
    brands: [],
    variants: [],
    ...over,
  }) as unknown as MaterialWithDetails;

const renderDialog = (material: MaterialWithDetails) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VendorQuoteDialog
        open
        onClose={vi.fn()}
        lockedMaterial={material}
        lockedVendor={VENDOR}
      />
    </QueryClientProvider>
  );
};

const typePrice = (value: string) => {
  // Scoped to the number input: /^Price/ alone also matches the
  // "Price includes GST" switch.
  const price = screen.getByRole("spinbutton", { name: /^Price/i });
  fireEvent.change(price, { target: { value } });
};

describe("VendorQuoteDialog — price scoping", () => {
  beforeEach(() => upsertMutate.mockClear());

  it("refuses to save a brand-priced material without a brand", async () => {
    // The bug from the report: Rs.75/sqft saved against "Plywood" with no brand.
    renderDialog(
      baseMaterial({
        price_varies_by_brand: true,
        price_varies_by_variant: false,
        brands: [
          { id: "b1", brand_name: "Varnam", is_active: true },
        ] as unknown as MaterialWithDetails["brands"],
      })
    );

    typePrice("75");
    fireEvent.click(screen.getByRole("button", { name: /save quote/i }));

    // Matched on the error copy specifically — the Brand field's own helper text
    // also mentions "price varies by brand".
    expect(await screen.findByText(/pick the brand this price is for/i)).toBeTruthy();
    // The important half: it must not write.
    expect(upsertMutate).not.toHaveBeenCalled();
  });

  it("says out loud when a material's price depends on nothing", async () => {
    // The other half of the ask: for sand, brand genuinely doesn't matter — but
    // the form has to SAY so rather than leaving an empty space that reads as
    // "you forgot something". Only a render assertion can prove it's visible.
    renderDialog(
      baseMaterial({
        id: "m2",
        name: "M Sand",
        unit: "cft",
        price_varies_by_brand: false,
        price_varies_by_variant: false,
      })
    );

    expect(
      await screen.findByText(/one price for all brands & sizes/i)
    ).toBeTruthy();
    expect(screen.queryByLabelText(/^Brand/i)).toBeNull();
  });

  it("saves a bare quote for a brand/size-independent material", async () => {
    renderDialog(
      baseMaterial({
        id: "m2",
        name: "M Sand",
        unit: "cft",
        price_varies_by_brand: false,
        price_varies_by_variant: false,
      })
    );

    typePrice("62");
    fireEvent.click(screen.getByRole("button", { name: /save quote/i }));

    await waitFor(() => expect(upsertMutate).toHaveBeenCalledTimes(1));
    expect(upsertMutate.mock.calls[0][0]).toMatchObject({
      material_id: "m2",
      current_price: 62,
    });
  });

  it("flags the missing brand instead of hiding the field when none exist", async () => {
    renderDialog(
      baseMaterial({
        price_varies_by_brand: true,
        price_varies_by_variant: false,
        brands: [],
      })
    );

    expect(await screen.findByText(/has no\s+brands yet/i)).toBeTruthy();
    typePrice("75");
    fireEvent.click(screen.getByRole("button", { name: /save quote/i }));
    expect(upsertMutate).not.toHaveBeenCalled();
  });
});
