-- Defense-in-depth guard: a site engineer's material PURCHASE settlement must
-- always be paid from the engineer wallet (payment_channel='engineer_wallet'),
-- never recorded as a "direct"/office payment.
--
-- WHY: site engineers settle material vendor purchases from a company-funded
-- wallet, and every such spend must show up on /site/my-wallet
-- (site_engineer_transactions). A UI gap let an engineer's OWN-SITE PO
-- settlement fall through to payment_channel='direct' with no recordSpend(),
-- so the money left the engineer but never appeared in My Wallet and had no
-- audit trail (the "Fly Ash ₹6,900" bug). The UI is fixed to always route
-- engineer settlements through the wallet; this trigger is the authoritative
-- backstop that also covers SECURITY DEFINER paths where RLS is bypassed.
--
-- SCOPE — deliberately narrow so legitimate flows are never blocked:
--   * Only PAID rows (is_paid = true).
--   * Only genuine VENDOR PO settlements: purchase_order_id IS NOT NULL.
--     This excludes internal expenses (self-use, inter-site debtor settlements)
--     which set purchase_type='own_site' + is_paid + 'direct' but carry a NULL
--     purchase_order_id (they set original_batch_code instead) — those are
--     legitimately non-wallet and may be engineer-triggered.
--   * Only when the ACTOR performing the write (auth.uid()) is a site_engineer.
--     Keying on the settler (not created_by) means an OFFICE/admin user settling
--     a PO directly is always allowed, even if an engineer created the row.
--     Service-role / migration writes (auth.uid() IS NULL) are allowed (used by
--     the one-off data repair that backfills the missing wallet spends).

CREATE OR REPLACE FUNCTION public.mpe_enforce_engineer_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  -- Only paid vendor-PO rows carry the engineer-wallet requirement.
  IF NEW.is_paid IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW; -- internal expense (self-use / inter-site), not a vendor purchase
  END IF;

  -- Role of the ACTOR writing this row (reads the request JWT, even inside
  -- SECURITY DEFINER RPCs; NULL for service-role / migrations).
  SELECT role INTO v_role FROM public.users WHERE auth_id = auth.uid();
  IF v_role IS DISTINCT FROM 'site_engineer'::public.user_role THEN
    RETURN NEW; -- office/admin/system writes are unconstrained
  END IF;

  -- An already-paid engineer row may be edited (metadata corrections), but it
  -- must never be downgraded from wallet to a direct payment.
  IF TG_OP = 'UPDATE' AND OLD.is_paid IS TRUE THEN
    IF OLD.payment_channel = 'engineer_wallet'
       AND NEW.payment_channel IS DISTINCT FROM 'engineer_wallet' THEN
      RAISE EXCEPTION
        'Cannot downgrade engineer wallet settlement % to a direct payment',
        COALESCE(NEW.ref_code, NEW.id::text)
        USING ERRCODE = 'WLT02';
    END IF;
    RETURN NEW;
  END IF;

  -- Paid INSERT, or an is_paid false->true transition, by a site engineer:
  -- the payment MUST be wallet-channeled. (engineer_transaction_id is linked in
  -- a follow-up statement, so we require the channel here, not the link.)
  IF NEW.payment_channel IS DISTINCT FROM 'engineer_wallet' THEN
    RAISE EXCEPTION
      'Site-engineer material payments must be settled from the engineer wallet (payment_channel was %). Ref %',
      COALESCE(NEW.payment_channel, 'null'), COALESCE(NEW.ref_code, NEW.id::text)
      USING ERRCODE = 'WLT02';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mpe_enforce_engineer_wallet ON public.material_purchase_expenses;
CREATE TRIGGER trg_mpe_enforce_engineer_wallet
BEFORE INSERT OR UPDATE ON public.material_purchase_expenses
FOR EACH ROW EXECUTE FUNCTION public.mpe_enforce_engineer_wallet();

COMMENT ON FUNCTION public.mpe_enforce_engineer_wallet() IS
'Hard-blocks a site engineer (auth.uid()) from recording a PAID vendor-PO
material expense (purchase_order_id NOT NULL) as a non-wallet payment. Keeps
engineer spend visible in My Wallet. Office/admin direct settlements and
internal (no-PO) expenses are unaffected. ERRCODE WLT02.';
