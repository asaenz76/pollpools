import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import type { NotificationType } from "@/types/enums";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Winning-option label for settlement notifications (e.g. "Draw"), when present. */
  resultLabel: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(limit = 50): Promise<NotificationItem[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, entity_type, entity_id, metadata, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => {
    const meta = (n.metadata ?? {}) as Record<string, unknown>;
    return {
      id: n.id,
      type: n.type as NotificationType,
      title: n.title,
      body: n.body,
      resultLabel: typeof meta.result_label === "string" ? meta.result_label : null,
      entityType: n.entity_type,
      entityId: n.entity_id,
      read: n.read_at != null,
      createdAt: n.created_at,
    };
  });
}

/** Unread count for the header badge. Memoized per request. */
export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return count ?? 0;
});
