import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InspectPane } from "./InspectPane";
import type { InspectEntity } from "./types";

const dailyEntity: InspectEntity = {
  kind: "daily-date",
  siteId: "site-1",
  date: "2026-04-21",
  settlementRef: "SS-0421",
};

const baseProps = {
  entity: dailyEntity,
  isOpen: true,
  isPinned: false,
  activeTab: "attendance" as const,
  onTabChange: vi.fn(),
  onClose: vi.fn(),
  onTogglePin: vi.fn(),
  onOpenInPage: vi.fn(),
};

describe("InspectPane", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = render(<InspectPane {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when entity is null", () => {
    const { container } = render(<InspectPane {...baseProps} entity={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title for daily entity", () => {
    render(<InspectPane {...baseProps} />);
    // "📅 21 Apr · Mon"
    expect(screen.getByText(/21 Apr/)).toBeInTheDocument();
    expect(screen.getByText(/SS-0421/)).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<InspectPane {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc key calls onClose", () => {
    const onClose = vi.fn();
    render(<InspectPane {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc does NOT call onClose when isOpen=false", () => {
    const onClose = vi.fn();
    render(<InspectPane {...baseProps} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking a tab calls onTabChange", () => {
    const onTabChange = vi.fn();
    render(<InspectPane {...baseProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /settlement/i }));
    expect(onTabChange).toHaveBeenCalledWith("settlement");
  });

  it("pin button calls onTogglePin", () => {
    const onTogglePin = vi.fn();
    render(<InspectPane {...baseProps} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByLabelText(/pin/i));
    expect(onTogglePin).toHaveBeenCalled();
  });

  it("renders weekly-week title shape", () => {
    const weeklyEntity: InspectEntity = {
      kind: "weekly-week",
      siteId: "site-1",
      laborerId: "laborer-1",
      weekStart: "2026-04-14",
      weekEnd: "2026-04-20",
      settlementRef: "WS-W16-01",
    };
    render(<InspectPane {...baseProps} entity={weeklyEntity} />);
    expect(screen.getByText(/Week 14[–-]20 Apr/)).toBeInTheDocument();
    expect(screen.getByText(/WS-W16-01/)).toBeInTheDocument();
  });
});
