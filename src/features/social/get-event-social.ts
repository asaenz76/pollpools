import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { CommentView } from "@/components/domain/comment-section";

export type EventSocial = { likeCount: number; liked: boolean; comments: CommentView[] };

export async function getEventSocial(
  tenantId: string,
  eventId: string,
  userId: string | null,
  opts: { likes: boolean; comments: boolean },
): Promise<EventSocial> {
  const supabase = await createServerSupabase();
  const result: EventSocial = { likeCount: 0, liked: false, comments: [] };

  if (opts.likes) {
    const [{ count }, liked] = await Promise.all([
      supabase.from("likes").select("*", { count: "exact", head: true }).eq("subject_type", "event").eq("subject_id", eventId),
      userId
        ? supabase.from("likes").select("id").eq("subject_type", "event").eq("subject_id", eventId).eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    result.likeCount = count ?? 0;
    result.liked = Boolean(liked.data);
  }

  if (opts.comments) {
    const { data: rows } = await supabase
      .from("comments")
      .select("id, body, created_at, user_id")
      .eq("subject_type", "event")
      .eq("subject_id", eventId)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(50);

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    const nameByUser = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .eq("tenant_id", tenantId)
        .in("user_id", userIds);
      for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name);
    }
    result.comments = (rows ?? []).map((r) => ({
      id: r.id,
      author: nameByUser.get(r.user_id) ?? "Member",
      body: r.body,
      createdAt: r.created_at,
    }));
  }

  return result;
}
