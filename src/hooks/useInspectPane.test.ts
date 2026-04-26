import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInspectPane } from "./useInspectPane";
import type { InspectEntity } from "@/components/common/InspectPane/types";

const dailyEntity: InspectEntity = {
  kind: "daily-date",
  siteId: "site-1",
  date: "2026-04-21",
  settlementRef: "SS-0421",
};

const weeklyEntity: InspectEntity = {
  kind: "weekly-week",
  siteId: "site-1",
  laborerId: "laborer-1",
  weekStart: "2026-04-14",
  weekEnd: "2026-04-20",
  settlementRef: "WS-W16-01",
};

describe("useInspectPane", () => {
  it("starts closed with no entity", () => {
    const { result } = renderHook(() => useInspectPane());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isPinned).toBe(false);
    expect(result.current.currentEntity).toBeNull();
    expect(result.current.activeTab).toBe("attendance");
  });

  it("open(entity) sets entity and isOpen=true", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.open(dailyEntity));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.currentEntity).toEqual(dailyEntity);
  });

  it("clicking the same entity again closes (when not pinned)", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.open(dailyEntity));
    act(() => result.current.open(dailyEntity));
    expect(result.current.isOpen).toBe(false);
  });

  it("clicking a different entity replaces content (when not pinned)", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.open(dailyEntity));
    act(() => result.current.open(weeklyEntity));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.currentEntity).toEqual(weeklyEntity);
  });

  it("clicking the same entity again does NOT close when pinned", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.open(dailyEntity));
    act(() => result.current.togglePin());
    act(() => result.current.open(dailyEntity));
    expect(result.current.isOpen).toBe(true);
  });

  it("close() forces closed even when pinned", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.open(dailyEntity));
    act(() => result.current.togglePin());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("setActiveTab updates the tab", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.setActiveTab("settlement"));
    expect(result.current.activeTab).toBe("settlement");
  });

  it("opening a new entity resets activeTab to 'attendance'", () => {
    const { result } = renderHook(() => useInspectPane());
    act(() => result.current.open(dailyEntity));
    act(() => result.current.setActiveTab("audit"));
    act(() => result.current.open(weeklyEntity));
    expect(result.current.activeTab).toBe("attendance");
  });
});
