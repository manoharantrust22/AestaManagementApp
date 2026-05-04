import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalaryWaterfallList } from "./SalaryWaterfallList";
import type { WaterfallWeek } from "@/hooks/queries/useSalaryWaterfall";

const settledWeek: WaterfallWeek = {
  weekStart: "2026-04-05", weekEnd: "2026-04-11",
  daysWorked: 7, laborerCount: 4,
  wagesDue: 52000, paid: 52000, status: "settled",
  filledBy: [
    { ref: "SET-260408-001", amount: 40000, grossAmount: 40000, settledAt: "2026-04-08" },
    { ref: "SET-260411-001", amount: 12000, grossAmount: 12000, settledAt: "2026-04-11" },
  ],
  period: "current",
};

const underpaidWeek: WaterfallWeek = {
  weekStart: "2026-04-19", weekEnd: "2026-04-25",
  daysWorked: 6, laborerCount: 4,
  wagesDue: 52400, paid: 38200, status: "underpaid",
  filledBy: [
    { ref: "SET-260423-001", amount: 38200, grossAmount: 38200, settledAt: "2026-04-23" },
  ],
  period: "current",
};

const pendingWeek: WaterfallWeek = {
  weekStart: "2026-04-26", weekEnd: "2026-05-02",
  daysWorked: 0, laborerCount: 0,
  wagesDue: 0, paid: 0, status: "pending",
  filledBy: [],
  period: "current",
};

describe("SalaryWaterfallList", () => {
  it("renders one row per week with the right status chip", () => {
    render(
      <SalaryWaterfallList
        weeks={[settledWeek, underpaidWeek, pendingWeek]}
        futureCredit={0}
        isLoading={false}
        onRowClick={vi.fn()}
        onSettleClick={vi.fn()}
      />
    );
    expect(screen.getByText("✓ Settled")).toBeInTheDocument();
    expect(screen.getByText(/Underpaid/)).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders 'Filled by SET-… ₹40,000 + SET-… ₹12,000' line for settled week", () => {
    render(
      <SalaryWaterfallList weeks={[settledWeek]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.getByText(/Filled by/)).toBeInTheDocument();
    expect(screen.getByText("SET-260408-001")).toBeInTheDocument();
    expect(screen.getByText("SET-260411-001")).toBeInTheDocument();
  });

  it("shows '+ Add settlement to fill' CTA on underpaid weeks; click calls onSettleClick", () => {
    const onSettle = vi.fn();
    render(
      <SalaryWaterfallList weeks={[underpaidWeek]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={onSettle} />
    );
    const cta = screen.getByText(/Add settlement to fill/);
    fireEvent.click(cta);
    expect(onSettle).toHaveBeenCalledWith(underpaidWeek);
  });

  it("CTA click does not also fire row click (stopPropagation)", () => {
    const onRow = vi.fn();
    const onSettle = vi.fn();
    render(
      <SalaryWaterfallList weeks={[underpaidWeek]} futureCredit={0} isLoading={false}
        onRowClick={onRow} onSettleClick={onSettle} />
    );
    fireEvent.click(screen.getByText(/Add settlement to fill/));
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("renders synthetic 'Future credit' row when futureCredit > 0", () => {
    render(
      <SalaryWaterfallList weeks={[settledWeek]} futureCredit={4000} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.getByText(/Future credit/i)).toBeInTheDocument();
    expect(screen.getByText("₹4,000")).toBeInTheDocument();
  });

  it("does NOT render 'Future credit' row when futureCredit === 0", () => {
    render(
      <SalaryWaterfallList weeks={[settledWeek]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.queryByText(/Future credit/i)).not.toBeInTheDocument();
  });

  it("renders empty state when no weeks", () => {
    render(
      <SalaryWaterfallList weeks={[]} futureCredit={0} isLoading={false}
        onRowClick={vi.fn()} onSettleClick={vi.fn()} />
    );
    expect(screen.getByText(/No contract laborer attendance/i)).toBeInTheDocument();
  });
});
