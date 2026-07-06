import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAttendanceCommissionMap } from "@/lib/workforce/attendanceCommission";

/**
 * Map<daily_attendance.id, commission ₹> for a site — the commission overlay used by
 * the /site/attendance weekly strip so company-laborer days on a commission-ENABLED
 * contract are counted at NET (and their otherwise-excluded task-work / non-Civil days
 * are pulled back into the company week), mirroring get_salary_waterfall + the settle
 * RPC. Empty map = nothing enabled = byte-for-byte the old behaviour.
 */
export function useAttendanceCommissionMap(siteId: string | undefined) {
  const supabase = createClient();
  return useQuery<Map<string, number>>({
    queryKey: ["attendance-commission-map", siteId],
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: () => fetchAttendanceCommissionMap(supabase, siteId!),
  });
}
