import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

export type ProfileView = {
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  isPublic: boolean;
  isSelf: boolean;
  stats: {
    totalPredictions: number;
    correct: number;
    accuracy: number;
    currentStreak: number;
    bestStreak: number;
    totalPoints: number;
  } | null;
  achievements: { name: string; description: string | null }[];
  history: { eventTitle: string; eventSlug: string; optionLabel: string; outcome: string; submittedAt: string }[];
};

export async function getProfileByHandle(
  tenantId: string,
  handle: string,
  viewerUserId: string | null,
): Promise<ProfileView | null> {
  const supabase = await createServerSupabase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, is_public")
    .eq("tenant_id", tenantId)
    .eq("handle", handle)
    .maybeSingle();
  if (!profile) return null;

  const isSelf = viewerUserId === profile.user_id;

  const [{ data: stats }, { data: achievements }, { data: history }] = await Promise.all([
    supabase
      .from("user_statistics")
      .select("total_predictions, correct_predictions, current_streak, best_streak, total_points")
      .eq("tenant_id", tenantId)
      .eq("user_id", profile.user_id)
      .maybeSingle(),
    supabase
      .from("user_achievements")
      .select("achievements(name, description)")
      .eq("tenant_id", tenantId)
      .eq("user_id", profile.user_id)
      .is("revoked_at", null),
    supabase.rpc("public_user_history", { p_tenant: tenantId, p_user: profile.user_id }),
  ]);

  const graded = stats ? stats.correct_predictions + (stats.total_predictions - stats.correct_predictions) : 0;

  return {
    userId: profile.user_id,
    handle: profile.handle,
    displayName: profile.display_name,
    bio: profile.bio,
    isPublic: profile.is_public,
    isSelf,
    stats: stats
      ? {
          totalPredictions: stats.total_predictions,
          correct: stats.correct_predictions,
          accuracy: graded > 0 ? stats.correct_predictions / stats.total_predictions : 0,
          currentStreak: stats.current_streak,
          bestStreak: stats.best_streak,
          totalPoints: stats.total_points,
        }
      : null,
    achievements: (achievements ?? []).flatMap((a) => {
      const def = Array.isArray(a.achievements) ? a.achievements[0] : a.achievements;
      return def ? [{ name: def.name, description: def.description }] : [];
    }),
    history: (history ?? []).map((h) => ({
      eventTitle: h.event_title,
      eventSlug: h.event_slug,
      optionLabel: h.option_label,
      outcome: h.outcome,
      submittedAt: h.submitted_at,
    })),
  };
}
