-- Defense-in-depth: prevent any code path from hard-deleting attendance rows that are still
-- attached to a LIVE (non-cancelled) salary settlement.
--
-- Root cause this guards: AttendanceDrawer saves attendance by deleting ALL rows for a
-- site+date and re-inserting them as unpaid. When the deleted rows were already settled, the
-- settlement_group + its engineer-wallet debit were orphaned WITHOUT reversing the money, the
-- date re-surfaced as unsettled, and it got settled (and charged) a second time.
--
-- The legitimate reversal path (DeleteDailySettlementDialog) first CANCELS the settlement
-- (is_cancelled=true) and UPDATEs the attendance rows to settlement_group_id=NULL. Both of
-- those make this trigger pass: an UPDATE is not blocked, and after the reset OLD.settlement_
-- group_id is NULL. Only a raw DELETE of a row still linked to a live settlement is blocked.
-- Note: daily_attendance.settlement_group_id / market_laborer_attendance.settlement_group_id
-- have NO FK to settlement_groups, so there is no ON DELETE CASCADE for this trigger to fight.

CREATE OR REPLACE FUNCTION public.block_delete_settled_attendance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.settlement_group_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.settlement_groups sg
       WHERE sg.id = OLD.settlement_group_id
         AND sg.is_cancelled = false
     )
  THEN
    RAISE EXCEPTION
      'Cannot delete attendance row % (date %): it is settled under a live salary settlement (%). Reverse that settlement first, then retry.',
      OLD.id, OLD.date, OLD.settlement_group_id
      USING ERRCODE = 'P0001',
            HINT = 'Open the settlement on the Salary Settlements page and use "Delete settlement" to reverse it (this unlinks the attendance and refunds the wallet) before editing or deleting this attendance.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS block_delete_settled_daily_attendance ON public.daily_attendance;
CREATE TRIGGER block_delete_settled_daily_attendance
  BEFORE DELETE ON public.daily_attendance
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_settled_attendance();

DROP TRIGGER IF EXISTS block_delete_settled_market_attendance ON public.market_laborer_attendance;
CREATE TRIGGER block_delete_settled_market_attendance
  BEFORE DELETE ON public.market_laborer_attendance
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_settled_attendance();
