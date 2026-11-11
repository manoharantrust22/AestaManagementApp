import { redirect } from "next/navigation";

/**
 * The standalone "Contract details" page is retired. Its flat money table is now
 * the Table view of the Subcontracts workspace (/site/trades), and its full
 * add/edit form is SubcontractFormDialog, opened from there. This redirect keeps
 * old links / bookmarks working:
 *   /site/subcontracts                 → /site/trades?view=table
 *   /site/subcontracts?edit=<id>       → /site/trades?view=table&edit=<id>
 *   /site/subcontracts?contractId=<id> → /site/trades?contract=<id>
 */
export default async function SiteSubcontractsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const edit = first(sp.edit);
  const contractId = first(sp.contractId);

  const params = new URLSearchParams();
  if (contractId) {
    params.set("contract", contractId);
  } else {
    params.set("view", "table");
    if (edit) params.set("edit", edit);
  }
  redirect(`/site/trades?${params.toString()}`);
}
