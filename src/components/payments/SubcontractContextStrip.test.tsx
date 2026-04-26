import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubcontractContextStrip } from "./SubcontractContextStrip";

describe("SubcontractContextStrip", () => {
  it("renders subcontract title, lump-sum, and spend percentage", () => {
    render(
      <SubcontractContextStrip
        subcontractTitle="Footing Horizontal Foundation"
        totalValue={400000}
        spent={277950}
        onOpenFullBurnDown={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Footing Horizontal Foundation/)
    ).toBeInTheDocument();
    expect(screen.getByText("₹4,00,000")).toBeInTheDocument();
    expect(screen.getByText("₹2,77,950")).toBeInTheDocument();
    expect(screen.getByText(/69%/)).toBeInTheDocument();
  });

  it("renders fallback strip when no subcontract is selected", () => {
    render(
      <SubcontractContextStrip
        subcontractTitle={null}
        totalValue={null}
        spent={null}
        onOpenFullBurnDown={vi.fn()}
      />
    );
    expect(
      screen.getByText(/All subcontracts on this site/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Choose a subcontract/i)).toBeInTheDocument();
  });

  it("clicking the link calls onOpenFullBurnDown", () => {
    const onOpen = vi.fn();
    render(
      <SubcontractContextStrip
        subcontractTitle="Test"
        totalValue={100000}
        spent={50000}
        onOpenFullBurnDown={onOpen}
      />
    );
    fireEvent.click(screen.getByText(/Full burn-down/i));
    expect(onOpen).toHaveBeenCalled();
  });
});
