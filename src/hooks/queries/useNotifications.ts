"use client";

/**
 * Notifications v2 — React Query hooks for the rebuilt in-app notification
 * feed (material lifecycle, more flows to come).
 *
 * Rows are created ONLY by SECURITY DEFINER database triggers (see the
 * notifications_v2_* migrations); the client reads its own rows and flips
 * read-state. `needs_action` rows are the "Needs your action" section the bell
 * pins on top — the DB clears the flag itself (notif_v2_resolve) when the
 * lifecycle advances past the step, so the client never has to guess whether
 * an actionable is stale.
 *
 * Realtime: `useNotificationsRealtime` opens a small per-user channel
 * (`notifications:<userId>`) and invalidates the query on INSERT/UPDATE —
 * deliberately NOT routed through the site-scoped leader-tab manager in
 * `src/lib/supabase/realtime.ts`, whose config model is per-site, not
 * per-user. Volume here is tiny (a handful of rows per day).
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { useAuth } from "@/contexts/AuthContext";

export interface AppNotification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  notification_type: string;
  related_table: string | null;
  related_id: string | null;
  action_url: string | null;
  site_id: string | null;
  needs_action: boolean;
  is_read: boolean;
  read_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;

  return useQuery({
    queryKey: queryKeys.notifications.byUser(userId ?? "anonymous"),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .order("needs_action", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const userId = userProfile?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      if (!userId) return;
      const key = queryKeys.notifications.byUser(userId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<AppNotification[]>(key, (old) =>
        (old ?? []).map((n) =>
          n.id === id
            ? { ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() }
            : n
        )
      );
    },
    onSettled: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.byUser(userId),
        });
      }
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const userId = userProfile?.id;

  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const supabase = createClient();
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onMutate: async () => {
      if (!userId) return;
      const key = queryKeys.notifications.byUser(userId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<AppNotification[]>(key, (old) =>
        (old ?? []).map((n) => ({
          ...n,
          is_read: true,
          read_at: n.read_at ?? new Date().toISOString(),
        }))
      );
    },
    onSettled: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.byUser(userId),
        });
      }
    },
  });
}

/**
 * Per-user realtime bridge: refetch the feed whenever a notification row for
 * this user is inserted or updated (updates matter too — notif_v2_resolve
 * clears needs_action server-side).
 */
export function useNotificationsRealtime() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const userId = userProfile?.id;

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.byUser(userId),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
