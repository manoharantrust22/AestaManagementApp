"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

interface RevertResult {
  batch_id: string;
  status: string;
  affected: number;
  idempotent?: boolean;
  site_reconciled?: boolean;
}

/**
 * Revoke / restore / purge a bulk-import batch. Each calls its SECURITY DEFINER
 * RPC (authorization derived from auth.uid()). Because these toggle whether a whole
 * batch of misc_expenses is visible, success invalidates broadly so the
 * Miscellaneous page, All-Site Expenses and subcontract rollups all refresh.
 */
function useBroadInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useRevertImportBatch() {
  const supabase = createClient();
  const invalidate = useBroadInvalidate();
  return useMutation<RevertResult, Error, { batchId: string; reason?: string | null }>({
    mutationFn: async ({ batchId, reason }) => {
      // New RPC not yet in the generated Database types.
      const { data, error } = await (supabase.rpc as any)("revert_import_batch", {
        p_batch_id: batchId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return data as RevertResult;
    },
    onSuccess: invalidate,
  });
}

export function useRestoreImportBatch() {
  const supabase = createClient();
  const invalidate = useBroadInvalidate();
  return useMutation<RevertResult, Error, { batchId: string }>({
    mutationFn: async ({ batchId }) => {
      const { data, error } = await (supabase.rpc as any)("restore_import_batch", {
        p_batch_id: batchId,
      });
      if (error) throw error;
      return data as RevertResult;
    },
    onSuccess: invalidate,
  });
}

export function usePurgeImportBatch() {
  const supabase = createClient();
  const invalidate = useBroadInvalidate();
  return useMutation<RevertResult, Error, { batchId: string }>({
    mutationFn: async ({ batchId }) => {
      const { data, error } = await (supabase.rpc as any)("purge_import_batch", {
        p_batch_id: batchId,
      });
      if (error) throw error;
      return data as RevertResult;
    },
    onSuccess: invalidate,
  });
}
