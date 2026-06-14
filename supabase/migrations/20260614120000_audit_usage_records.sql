-- Audit trail for usage records (batch_usage_records + daily_material_usage).
--
-- WHY: on 2026-06-13 the Reconcile-usage "delete-&-refill" RPC hard-deleted a
-- range of hand-entered batch_usage_records and there was NO audit trigger on
-- the table, so the originals were unrecoverable (audit_log had nothing). Usage
-- records carry real money (inter-site debt + self-use cost) and are mutated by
-- several delete/refill paths (reconcile, reverse_delivery, manual edit/delete),
-- so every INSERT/UPDATE/DELETE must be journaled.
--
-- Generic AFTER row trigger -> create_audit_log() (the existing helper). It is
-- wrapped so an audit failure can NEVER block or roll back the underlying write
-- (auditing must be best-effort, not a new failure mode for a financial path).
-- changed_by = auth.uid(): preserved even through SECURITY DEFINER RPCs because
-- it reads the request JWT, not the function owner (null for service-role/admin).

CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM create_audit_log(TG_TABLE_NAME::varchar, NEW.id, 'create'::audit_action,
                               NULL, to_jsonb(NEW), auth.uid(), NULL);
    ELSIF TG_OP = 'UPDATE' THEN
      PERFORM create_audit_log(TG_TABLE_NAME::varchar, NEW.id, 'update'::audit_action,
                               to_jsonb(OLD), to_jsonb(NEW), auth.uid(), NULL);
    ELSE -- DELETE
      PERFORM create_audit_log(TG_TABLE_NAME::varchar, OLD.id, 'delete'::audit_action,
                               to_jsonb(OLD), NULL, auth.uid(), NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort: never let auditing abort the real write.
    NULL;
  END;
  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_batch_usage_records ON public.batch_usage_records;
CREATE TRIGGER trg_audit_batch_usage_records
AFTER INSERT OR UPDATE OR DELETE ON public.batch_usage_records
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_audit_daily_material_usage ON public.daily_material_usage;
CREATE TRIGGER trg_audit_daily_material_usage
AFTER INSERT OR UPDATE OR DELETE ON public.daily_material_usage
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

COMMENT ON FUNCTION public.audit_row_changes() IS
'Generic best-effort audit trigger -> create_audit_log(). Attached to usage
tables so delete/refill paths (reconcile, reverse_delivery, manual) are always
recoverable from audit_log.old_data. Audit failures are swallowed, never block
the underlying write.';
