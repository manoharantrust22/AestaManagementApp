"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ImportBatch } from "@/types/mass-upload.types";

export const IMPORT_BATCHES_KEY = ["import-batches"] as const;

/**
 * All bulk-import batches the current user can see (RLS scopes to accessible
 * sites), newest first. Used by the Import History page to revoke/restore/purge.
 */
export function useImportBatches() {
  const supabase = createClient();
  return useQuery<ImportBatch[]>({
    queryKey: IMPORT_BATCHES_KEY,
    queryFn: async () => {
      // import_batches is a new table not yet in the generated Database types.
      const { data, error } = await (supabase as any)
        .from("import_batches")
        .select(
          "id, site_id, target_table, status, file_name, original_csv_path, file_hash, total_count, inserted_count, summary, notes, created_by_name, created_at, reverted_at, revert_reason, sites(name)"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as Array<
        Record<string, unknown> & { sites?: { name?: string | null } | null }
      >;
      return rows.map(({ sites, ...rest }) => ({
        ...(rest as unknown as ImportBatch),
        site_name: sites?.name ?? null,
      }));
    },
  });
}
