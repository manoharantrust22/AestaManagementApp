-- Allow site engineers to INSERT new vendors.
-- They cannot update or delete existing vendors (admin/office only via allow_all_vendors).
CREATE POLICY "site_engineer_insert_vendors"
  ON public.vendors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid()
        AND users.role = 'site_engineer'::public.user_role
    )
  );
