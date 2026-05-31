-- Payer Sources Registry — Slice 2 (write policies)
-- Spec: docs/superpowers/specs/2026-05-30-per-site-payment-sources-design.md
--
-- Slice 1 (20260506140000) created payer_sources with SELECT-only RLS and
-- noted: "Slice 2 adds INSERT/UPDATE/DELETE policies (still permissive)
-- when the settings page lands." The per-site Payment Sources editor is
-- that settings page. These policies are permissive (USING/ WITH CHECK
-- true), mirroring the existing SELECT policies and settlement_groups —
-- authorization is enforced at the app/proxy layer (admin/office gate in
-- SitePaymentSourcesManager), not in DB policies.
--
-- Additive only; no schema or data changes.

-- INSERT
CREATE POLICY "allow_anon_insert_payer_sources"
  ON payer_sources FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "allow_authenticated_insert_payer_sources"
  ON payer_sources FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE
CREATE POLICY "allow_anon_update_payer_sources"
  ON payer_sources FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_update_payer_sources"
  ON payer_sources FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- DELETE
CREATE POLICY "allow_anon_delete_payer_sources"
  ON payer_sources FOR DELETE TO anon USING (true);

CREATE POLICY "allow_authenticated_delete_payer_sources"
  ON payer_sources FOR DELETE TO authenticated USING (true);
