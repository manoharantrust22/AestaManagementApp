-- Migration: Concreting Teams catalog
-- Purpose: Company-wide catalog of external concreting gangs (labour teams hired
--          for single-day lump-sum concreting jobs). Mirrors the global `vendors`
--          pattern: not company-scoped, soft-deleted via is_active, permissive RLS.

-- 1. Create concreting_teams table
CREATE TABLE IF NOT EXISTS public.concreting_teams (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    contact_person text,
    phone text,
    whatsapp_number text,
    area text,                                    -- where the team typically works
    brings_own_machine boolean DEFAULT false,     -- supplies its own concreting machine
    typical_rate numeric(12,2),                   -- last/typical bargained amount, for rate comparison
    notes text,
    is_active boolean DEFAULT true,               -- soft-delete flag (like vendors.is_active)
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES users(id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_concreting_teams_is_active ON concreting_teams(is_active);
CREATE INDEX IF NOT EXISTS idx_concreting_teams_name ON concreting_teams(name);

-- 3. Enable RLS
ALTER TABLE concreting_teams ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies (permissive, matching the app's existing catalog tables)
DROP POLICY IF EXISTS "concreting_teams_select" ON concreting_teams;
CREATE POLICY "concreting_teams_select" ON concreting_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "concreting_teams_insert" ON concreting_teams;
CREATE POLICY "concreting_teams_insert" ON concreting_teams FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "concreting_teams_update" ON concreting_teams;
CREATE POLICY "concreting_teams_update" ON concreting_teams FOR UPDATE USING (true);

DROP POLICY IF EXISTS "concreting_teams_delete" ON concreting_teams;
CREATE POLICY "concreting_teams_delete" ON concreting_teams FOR DELETE USING (true);

-- 5. Grants
GRANT ALL ON TABLE public.concreting_teams TO authenticated;
GRANT ALL ON TABLE public.concreting_teams TO service_role;

COMMENT ON TABLE public.concreting_teams IS
  'Company-wide catalog of external concreting gangs hired for single-day lump-sum (day_work) concreting jobs. Global (not company-scoped); soft-deleted via is_active.';
