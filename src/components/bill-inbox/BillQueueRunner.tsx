"use client";

/**
 * Invisible: keeps uploading bills captured on this phone, wherever the user
 * is in the app. Retries on reconnect, when the app comes back to the
 * foreground, and every minute while anything is waiting.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { drainQueue, listQueue, onBillUploaded, setQueueUser } from "@/lib/bill-inbox/queue";
import { purchaseDocumentKeys } from "@/hooks/queries/usePurchaseDocuments";

export default function BillQueueRunner() {
  const { userProfile } = useAuth();
  const qc = useQueryClient();
  const userId = userProfile?.id ?? null;

  useEffect(() => {
    setQueueUser(userId);
    if (!userId) return;

    const kick = () => void drainQueue();
    kick();

    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(async () => {
      if ((await listQueue()).length > 0) kick();
    }, 60_000);
    const off = onBillUploaded(() => qc.invalidateQueries({ queryKey: purchaseDocumentKeys.all }));

    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      off();
    };
  }, [userId, qc]);

  return null;
}
