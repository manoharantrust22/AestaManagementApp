import dayjs from "dayjs";

export type DateRangePreset = "all" | "today" | "week" | "month";

export interface DateRange {
  date_from: string | null;
  date_to: string | null;
}

export function dateRangePreset(preset: DateRangePreset): DateRange {
  if (preset === "today") {
    const today = dayjs().format("YYYY-MM-DD");
    return { date_from: today, date_to: today };
  }
  if (preset === "week") {
    return {
      date_from: dayjs().startOf("week").format("YYYY-MM-DD"),
      date_to: dayjs().endOf("week").format("YYYY-MM-DD"),
    };
  }
  if (preset === "month") {
    return {
      date_from: dayjs().startOf("month").format("YYYY-MM-DD"),
      date_to: dayjs().endOf("month").format("YYYY-MM-DD"),
    };
  }
  return { date_from: null, date_to: null };
}

export function presetLabel(preset: DateRangePreset): string {
  return preset === "all"
    ? "All time"
    : preset === "today"
    ? "Today"
    : preset === "week"
    ? "This week"
    : "This month";
}
