-- Allow site engineers to add materials directly to the live catalog.
-- Previously materials_insert only let site engineers insert when is_draft=true,
-- which 403'd the "NEW MATERIAL" dialog (is_draft defaults to false). The rest of
-- the materials table (SELECT/UPDATE/DELETE) is already open to authenticated users,
-- so this brings INSERT in line while still gating to the three known app roles.

DROP POLICY IF EXISTS materials_insert ON materials;

CREATE POLICY materials_insert ON materials FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = ANY (ARRAY['admin'::user_role, 'office'::user_role, 'site_engineer'::user_role])
  );
