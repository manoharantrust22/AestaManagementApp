import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaterialGridCard } from "./MaterialGridCard";
import * as ImageViewer from "@/components/common/ImageViewerProvider";
import type { MaterialWithDetails } from "@/types/material.types";

function makeMaterial(overrides: Partial<MaterialWithDetails> = {}): MaterialWithDetails {
  return {
    id: "m1",
    name: "Dr. Fixit 301",
    code: "DRF-0001",
    unit: "liter",
    image_url: "https://example.com/can.jpg",
    ...overrides,
  } as MaterialWithDetails;
}

const baseProps = { variantCount: 0, brandCount: 0, vendorCount: 0 };

describe("MaterialGridCard image zoom", () => {
  it("shows a zoom button for a card with a photo; clicking it opens the viewer without selecting the card", () => {
    const openImage = vi.fn();
    vi.spyOn(ImageViewer, "useImageViewer").mockReturnValue({ openImage });
    const onClick = vi.fn();

    render(<MaterialGridCard material={makeMaterial()} onClick={onClick} {...baseProps} />);

    fireEvent.click(screen.getByLabelText(/zoom image/i));

    expect(openImage).toHaveBeenCalledWith({
      src: "https://example.com/can.jpg",
      title: "Dr. Fixit 301",
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows no zoom button when the material has no photo", () => {
    vi.spyOn(ImageViewer, "useImageViewer").mockReturnValue({ openImage: vi.fn() });
    render(
      <MaterialGridCard material={makeMaterial({ image_url: null })} onClick={vi.fn()} {...baseProps} />
    );
    expect(screen.queryByLabelText(/zoom image/i)).toBeNull();
  });
});
