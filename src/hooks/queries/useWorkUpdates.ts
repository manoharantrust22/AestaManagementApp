/**
 * useWorkUpdates
 *
 * Powers the WorkUpdatesTab in the InspectPane. Fetches morning + evening
 * work-update notes and photos for a date range from the
 * `daily_work_summary` table (work_updates JSONB column).
 *
 * - Daily-date entity: pass `dateFrom === dateTo === entity.date`.
 * - Weekly-week entity: pass the week's start/end and we'll flatten all
 *   morning/evening updates across the range, sorted by createdAt.
 *
 * Returns a flat array of update cards. Each card represents either the
 * morning or evening half of a single day's `work_updates` JSONB blob.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface WorkUpdateCard {
  id: string;
  timeOfDay: "Morning" | "Evening";
  createdAt: string; // ISO timestamp from the JSONB blob
  createdByName: string;
  note: string;
  photoUrls: string[];
  date: string; // YYYY-MM-DD (the daily_work_summary date this card came from)
}

export interface UseWorkUpdatesData {
  updates: WorkUpdateCard[];
}

interface DailyWorkSummaryRow {
  date: string;
  work_updates: {
    morning?: {
      description?: string;
      photos?: Array<{ url: string }>;
      timestamp?: string;
    } | null;
    evening?: {
      summary?: string;
      photos?: Array<{ url: string }>;
      timestamp?: string;
    } | null;
  } | null;
  entered_by?: string | null;
  updated_by?: string | null;
}

export function useWorkUpdates(
  siteId: string,
  dateFrom: string,
  dateTo: string
) {
  const supabase = createClient();
  return useQuery<UseWorkUpdatesData>({
    queryKey: ["inspect-work-updates", siteId, dateFrom, dateTo],
    enabled: Boolean(siteId && dateFrom && dateTo),
    staleTime: 30_000,
    queryFn: async (): Promise<UseWorkUpdatesData> => {
      const { data, error } = await (supabase.from("daily_work_summary") as any)
        .select("date, work_updates, entered_by, updated_by")
        .eq("site_id", siteId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });

      if (error) throw error;

      const rows: DailyWorkSummaryRow[] = (data ?? []) as DailyWorkSummaryRow[];
      const updates: WorkUpdateCard[] = [];

      for (const row of rows) {
        const wu = row.work_updates;
        if (!wu) continue;
        const author = row.entered_by ?? row.updated_by ?? "Unknown";

        if (wu.morning && (wu.morning.description || wu.morning.photos?.length)) {
          updates.push({
            id: `${row.date}-morning`,
            timeOfDay: "Morning",
            createdAt: wu.morning.timestamp ?? `${row.date}T07:00:00Z`,
            createdByName: author,
            note: wu.morning.description ?? "",
            photoUrls: (wu.morning.photos ?? [])
              .map((p) => p?.url)
              .filter((u): u is string => Boolean(u)),
            date: row.date,
          });
        }

        if (wu.evening && (wu.evening.summary || wu.evening.photos?.length)) {
          updates.push({
            id: `${row.date}-evening`,
            timeOfDay: "Evening",
            createdAt: wu.evening.timestamp ?? `${row.date}T18:00:00Z`,
            createdByName: author,
            note: wu.evening.summary ?? "",
            photoUrls: (wu.evening.photos ?? [])
              .map((p) => p?.url)
              .filter((u): u is string => Boolean(u)),
            date: row.date,
          });
        }
      }

      // Sort by createdAt ascending so the oldest update appears first.
      updates.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));

      return { updates };
    },
  });
}
