import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RentalCostBreakdown from "../RentalCostBreakdown";
import type { RentalCostCalculation } from "@/types/rental.types";

const baseCalc: RentalCostCalculation = {
  startDate: "2025-11-16",
  currentDate: "2025-11-16",
  expectedReturnDate: "2025-11-16",
  actualReturnDate: "2025-11-16",
  daysElapsed: 1,
  itemsCost: [],
  subtotal: 5040,
  discountAmount: 0,
  transportCostOutward: 250,
  transportCostReturn: 0,
  totalTransportCost: 250,
  damagesCost: 0,
  grossTotal: 5290,
  advancesPaid: 0,
  balanceDue: 5290,
  isOverdue: false,
  daysOverdue: 0,
  isCompleted: true,
} as RentalCostCalculation;

describe("RentalCostBreakdown — transport handler bundling", () => {
  it("hides Settle chip on outward row when outwardBy is 'vendor'", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy="vendor"
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.queryByText("Settle")).not.toBeInTheDocument();
  });

  it("hides Settle chip on outward row when outwardBy is null (treated as vendor)", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy={null}
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.queryByText("Settle")).not.toBeInTheDocument();
  });

  it("shows Settle chip on outward row when outwardBy is 'company'", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy="company"
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.getByText("Settle")).toBeInTheDocument();
  });

  it("shows Settle chip on outward row when outwardBy is 'laborer'", () => {
    render(
      <RentalCostBreakdown
        calculation={baseCalc}
        outwardBy="laborer"
        returnBy={null}
        onSettleInbound={vi.fn()}
      />,
    );
    expect(screen.getByText("Settle")).toBeInTheDocument();
  });

  it("hides Settle chip on return row when returnBy is 'vendor'", () => {
    const calcWithReturn: RentalCostCalculation = {
      ...baseCalc,
      transportCostOutward: 0,
      transportCostReturn: 250,
    } as RentalCostCalculation;
    render(
      <RentalCostBreakdown
        calculation={calcWithReturn}
        outwardBy={null}
        returnBy="vendor"
        onSettleOutbound={vi.fn()}
      />,
    );
    expect(screen.queryByText("Settle")).not.toBeInTheDocument();
  });

  it("shows Settle chip on return row when returnBy is 'company'", () => {
    const calcWithReturn: RentalCostCalculation = {
      ...baseCalc,
      transportCostOutward: 0,
      transportCostReturn: 250,
    } as RentalCostCalculation;
    render(
      <RentalCostBreakdown
        calculation={calcWithReturn}
        outwardBy={null}
        returnBy="company"
        onSettleOutbound={vi.fn()}
      />,
    );
    expect(screen.getByText("Settle")).toBeInTheDocument();
  });
});
