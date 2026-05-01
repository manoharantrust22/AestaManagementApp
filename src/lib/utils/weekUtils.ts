// Construction-payroll convention: a week runs Sunday → Saturday.
// Sunday belongs to the new week; the previous Saturday closes the old one.
// `.day(0)` / `.day(6)` are locale-independent (numeric day index always
// treats Sunday as 0), unlike `startOf("week")` which can shift with locale.

import dayjs from "dayjs";

type DateInput = dayjs.Dayjs | string | Date | null | undefined;

export const weekStartOf = (d: DateInput): dayjs.Dayjs =>
  dayjs(d ?? undefined).day(0).startOf("day");

export const weekEndOf = (d: DateInput): dayjs.Dayjs =>
  dayjs(d ?? undefined).day(6).endOf("day");

export const weekStartStr = (d: DateInput): string =>
  weekStartOf(d).format("YYYY-MM-DD");

export const weekEndStr = (d: DateInput): string =>
  weekEndOf(d).format("YYYY-MM-DD");
