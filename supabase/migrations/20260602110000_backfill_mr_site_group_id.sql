-- Backfill: stamp material_requests.site_group_id from their group purchase order.
--
-- BUG (Problem A): the Material Hub fetches threads via material_requests filtered
--   site_id = me  OR  site_group_id = mycluster
-- (useMaterialRequests). A request raised as purchase_type='own_site' only becomes
-- "group" at PO creation (the PO carries site_group_id, the MR does not). The Hub
-- labels the thread "Group · cluster" from the PO, but because the MR row's
-- site_group_id is NULL, the thread surfaces ONLY on the site that raised the
-- request — never on the sibling cluster site. So a cluster's members each see a
-- DIFFERENT subset of the shared group threads, and can't see/log against each
-- other's shared batches.
--
-- FIX: stamp the MR with the group its PO already declares. After this, the
-- existing .or(site_id, site_group_id) filter surfaces the thread on every site
-- in the cluster — matching the "Group · cluster" label. The PO-creation path is
-- patched separately (useCreatePurchaseOrder) so new group POs stamp the MR too.
--
-- SAFE + IDEMPOTENT: the `mr.site_group_id IS NULL` guard means a re-run touches
-- zero rows; only stamps the group the PO already owns (no fabricated data).

UPDATE material_requests mr
SET    site_group_id = po.site_group_id,
       updated_at    = now()
FROM   purchase_orders po
WHERE  po.source_request_id = mr.id
  AND  po.site_group_id IS NOT NULL
  AND  mr.site_group_id IS NULL;
