import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScopePill from "./ScopePill";
import * as DateRangeModule from "@/contexts/DateRangeContext";

describe("ScopePill", () => {
  it("renders nothing when filter is All Time", () => {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: null,
      endDate: null,
      label: "All Time",
      isAllTime: true,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: null, dateTo: null }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    const { container } = render(<ScopePill />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the label and range when a filter is active", () => {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-17"),
      endDate: new Date("2026-04-24"),
      label: "Last 7 days",
      isAllTime: false,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-17", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    expect(screen.getByText(/Last 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Apr 17 – Apr 24/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear date filter/i })
    ).toBeInTheDocument();
  });

  it("calls setAllTime when the clear button is clicked", () => {
    const setAllTime = vi.fn();
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-17"),
      endDate: new Date("2026-04-24"),
      label: "Last 7 days",
      isAllTime: false,
      setAllTime,
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-17", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    fireEvent.click(
      screen.getByRole("button", { name: /clear date filter/i })
    );
    expect(setAllTime).toHaveBeenCalledTimes(1);
  });

  it("renders only the single date for a same-day range", () => {
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-24"),
      endDate: new Date("2026-04-24"),
      label: "Today",
      isAllTime: false,
      setAllTime: vi.fn(),
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-24", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    // Single-day should not render the "–" separator
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
    expect(screen.getByText(/Today/)).toBeInTheDocument();
  });

  it("calls setAllTime when the status strip (outside the button) is clicked", () => {
    const setAllTime = vi.fn();
    vi.spyOn(DateRangeModule, "useDateRange").mockReturnValue({
      startDate: new Date("2026-04-17"),
      endDate: new Date("2026-04-24"),
      label: "Last 7 days",
      isAllTime: false,
      setAllTime,
      setDateRange: vi.fn(),
      setLastWeek: vi.fn(),
      setLastMonth: vi.fn(),
      setMonth: vi.fn(),
      formatForApi: () => ({ dateFrom: "2026-04-17", dateTo: "2026-04-24" }),
    } as ReturnType<typeof DateRangeModule.useDateRange>);

    render(<ScopePill />);
    fireEvent.click(screen.getByRole("status"));
    expect(setAllTime).toHaveBeenCalledTimes(1);
  });
});
