-- Distinct set of dates that have ANY daily_attendance for a site.
--
-- Powers the /site/attendance list's "is this a real attendance day?" gate.
-- The attendance list loads one week at a time (infinite scroll, newest first),
-- so the client-side set of "loaded" dates is incomplete for older weeks that
-- haven't been fetched yet. Contract-presence rows (task_work_day_logs /
-- subcontract_headcount), by contrast, load for the whole history at once — so
-- an already-attended older day would incorrectly render as a "~₹ est" contract
-- row until its attendance week scrolls into view (and, because those est rows
-- flood the bottom of the list, the scroll sentinel is buried and the real week
-- may never load at all).
--
-- This returns just the DISTINCT dates (tiny payload, one row per day) so the
-- page can gate the est / unfilled / holiday-only logic on what actually exists
-- in the DB rather than on what happens to be loaded. Read-only.
--
-- SECURITY INVOKER: the DISTINCT scan runs under the caller's RLS on
-- daily_attendance, so it returns exactly the dates the user is allowed to see —
-- same visibility as the attendance list itself.

CREATE OR REPLACE FUNCTION public.get_site_attendance_dates(
  p_site_id uuid,
  p_from    date DEFAULT NULL,
  p_to      date DEFAULT NULL
)
RETURNS TABLE (attendance_date date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT da.date
  FROM public.daily_attendance da
  WHERE da.site_id = p_site_id
    AND (p_from IS NULL OR da.date >= p_from)
    AND (p_to   IS NULL OR da.date <= p_to)
  ORDER BY da.date;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_attendance_dates(uuid, date, date) TO authenticated;
