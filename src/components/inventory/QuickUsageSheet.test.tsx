import { describe, it, expect } from "vitest";
import { getDateRangeFromPreset } from "./QuickUsageSheet";

describe("getDateRangeFromPreset", () => {
  const anchor = new Date("2026-05-12"); // Tuesday

  it("today → startDate=today, endDate=null", () => {
    const r = getDateRangeFromPreset("today", anchor);
    expect(r.startDate).toBe("2026-05-12");
    expect(r.endDate).toBeNull();
  });

  it("yesterday → startDate=yesterday, endDate=null", () => {
    const r = getDateRangeFromPreset("yesterday", anchor);
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBeNull();
  });

  it("this_week → Sunday as startDate, anchor as endDate", () => {
    // May 12 is Tuesday; Sunday of this week = May 10
    const r = getDateRangeFromPreset("this_week", anchor);
    expect(r.startDate).toBe("2026-05-10");
    expect(r.endDate).toBe("2026-05-12");
  });

  it("last_week → previous Sun–Sat", () => {
    const r = getDateRangeFromPreset("last_week", anchor);
    expect(r.startDate).toBe("2026-05-03"); // prev Sunday
    expect(r.endDate).toBe("2026-05-09");   // prev Saturday
  });

  it("this_month → first of month to anchor", () => {
    const r = getDateRangeFromPreset("this_month", anchor);
    expect(r.startDate).toBe("2026-05-01");
    expect(r.endDate).toBe("2026-05-12");
  });
});
