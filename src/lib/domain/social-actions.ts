"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { FEATURE_FLAG_DEFAULTS, type FeatureFlag } from "@/lib/tenant/feature-flags";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Ok<T = object> = { ok: true } & T;
type Err = { ok: false; error: string };

const uuid = z.string().uuid();

/** Resolve a tenant feature flag server-side (with documented default). */
async function tenantFlag(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  flag: FeatureFlag,
): Promise<boolean> {
  const { data } = await supabase
    .from("tenant_feature_flags")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("flag", flag)
    .maybeSingle();
  return data ? data.enabled : FEATURE_FLAG_DEFAULTS[flag];
}

/** Follow a creator. Tenant is derived from the creator (not client-supplied). */
export async function followCreatorAction(creatorId: string): Promise<Ok | Err> {
  if (!uuid.safeParse(creatorId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const { data: creator } = await supabase.from("creators").select("tenant_id").eq("id", creatorId).maybeSingle();
  if (!creator) return { ok: false, error: "Creator not found." };
  const { error } = await supabase
    .from("creator_follows")
    .upsert({ tenant_id: creator.tenant_id, creator_id: creatorId, user_id: user.id }, { onConflict: "creator_id,user_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't follow." };
  return { ok: true };
}

export async function unfollowCreatorAction(creatorId: string): Promise<Ok | Err> {
  if (!uuid.safeParse(creatorId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const { error } = await supabase.from("creator_follows").delete().eq("creator_id", creatorId).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't unfollow." };
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<Ok | Err> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: "Couldn't update." };
  return { ok: true };
}

const likeSchema = z.object({
  subjectType: z.enum(["event", "feed_activity", "comment"]),
  subjectId: uuid,
  tenantId: uuid,
});

/** Toggle a like (behind likes_enabled). Returns the new liked state. */
export async function toggleLikeAction(input: z.infer<typeof likeSchema>): Promise<(Ok & { liked: boolean }) | Err> {
  const parsed = likeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (!(await tenantFlag(supabase, parsed.data.tenantId, "likes_enabled"))) {
    return { ok: false, error: "Likes are not enabled here." };
  }

  const existing = await supabase
    .from("likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("subject_type", parsed.data.subjectType)
    .eq("subject_id", parsed.data.subjectId)
    .maybeSingle();

  if (existing.data) {
    await supabase.from("likes").delete().eq("id", existing.data.id);
    return { ok: true, liked: false };
  }
  const { error } = await supabase.from("likes").insert({
    tenant_id: parsed.data.tenantId,
    user_id: user.id,
    subject_type: parsed.data.subjectType,
    subject_id: parsed.data.subjectId,
  });
  if (error) return { ok: false, error: "Couldn't like." };
  return { ok: true, liked: true };
}

const commentSchema = z.object({
  subjectType: z.enum(["event", "feed_activity"]),
  subjectId: uuid,
  tenantId: uuid,
  body: z.string().trim().min(1).max(2000),
});

/** Add a comment (behind comments_enabled). */
export async function addCommentAction(input: z.infer<typeof commentSchema>): Promise<Ok | Err> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a comment (max 2000 chars)." };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (!(await tenantFlag(supabase, parsed.data.tenantId, "comments_enabled"))) {
    return { ok: false, error: "Comments are not enabled here." };
  }
  const { error } = await supabase.from("comments").insert({
    tenant_id: parsed.data.tenantId,
    user_id: user.id,
    subject_type: parsed.data.subjectType,
    subject_id: parsed.data.subjectId,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: "Couldn't post comment." };
  return { ok: true };
}
