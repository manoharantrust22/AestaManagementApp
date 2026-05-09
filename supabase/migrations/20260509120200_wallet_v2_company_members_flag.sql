-- Engineer Wallet v2 — Migration C: Per-user wallet_enabled flag on company_members
--
-- Replaces the role-based wallet access model with an explicit per-user flag.
-- Today only Ajith Kumar (id 59ab8650-9436-469f-99a0-192af1e08198) is opted in.
-- Adding a future trusted user becomes a one-row UPDATE on company_members.
--
-- The `company_members` table was created via Supabase Studio rather than a
-- migration, so a fresh local DB doesn't have it. This migration is a no-op
-- when the table is missing; production already ran it on the Studio-created
-- table and won't re-execute on file edit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_members'
  ) THEN
    RAISE NOTICE 'company_members not present; skipping wallet_enabled flag migration.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE company_members ADD COLUMN IF NOT EXISTS wallet_enabled boolean NOT NULL DEFAULT false';

  EXECUTE $sql$COMMENT ON COLUMN company_members.wallet_enabled IS 'When true, this member can hold a wallet balance and act as a wallet payer in any settlement dialog.'$sql$;

  -- Backfill: opt Ajith Kumar in.
  EXECUTE $sql$UPDATE company_members SET wallet_enabled = true WHERE user_id = '59ab8650-9436-469f-99a0-192af1e08198'$sql$;

  -- Partial index speeds up the "list wallet-enabled engineers" query that runs on every
  -- settlement dialog open (engineer picker autocomplete).
  EXECUTE $sql$CREATE INDEX IF NOT EXISTS idx_company_members_wallet_enabled ON company_members (company_id) WHERE wallet_enabled = true$sql$;
END $$;
