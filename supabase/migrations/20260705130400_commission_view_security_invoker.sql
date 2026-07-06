-- Mesthri commission — advisor fixes on the new objects.
--
-- 1. v_daily_attendance_commission was created SECURITY DEFINER (owner = postgres),
--    so it bypassed RLS on daily_attendance/laborers — the ledger RPC and the client
--    commission-map read from it, so a user could see another site's salary rows.
--    Recreate it WITH (security_invoker = true) so RLS (can_access_site) applies as
--    the CALLER, matching how the underlying tables are read everywhere else.
-- 2. mesthri_commission_of had a mutable search_path (WARN). It touches no tables
--    (pure LEAST/COALESCE), but pin it to '' to satisfy the linter + best practice.

ALTER VIEW public.v_daily_attendance_commission SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.mesthri_commission_of(
  p_is_crew boolean,
  p_daily_earnings numeric,
  p_rate numeric,
  p_work_days numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_is_crew
      THEN LEAST(COALESCE(p_daily_earnings, 0), COALESCE(p_rate, 0) * COALESCE(p_work_days, 1))
    ELSE 0
  END;
$$;
