"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const uuid = z.string().uuid();

const DRAFT_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "Please sign in to draft a competitor.",
  DRAFT_NOT_ENABLED: "Drafting isn't available for this competition.",
  DRAFT_NOT_OPEN: "The draft isn't open yet.",
  DRAFT_CLOSED: "The draft has closed.",
  NOT_A_MEMBER: "Join this community to draft a competitor.",
  INVALID_COMPETITOR: "That competitor isn't available to draft.",
  ALREADY_HAS_ASSIGNMENT: "You've already drafted a competitor for this competition.",
  COMPETITOR_UNAVAILABLE: "That competitor has already been drafted.",
};

function friendly(message: string, map: Record<string, string>): string {
  const code = Object.keys(map).find((c) => message.includes(c));
  return code ? map[code]! : "Something went wrong. Please try again.";
}

export type DraftResult =
  | { ok: true; status: string; assignmentId: string; paymentRequired: boolean }
  | { ok: false; error: string };

/**
 * Draft a competitor. FREE → confirmed immediately. PAID → creates a
 * `pending_payment` reservation; payment is completed through the single
 * BillingProvider pipeline (billing checkout → verified webhook confirms it),
 * the same architecture as every other paid feature.
 */
export async function draftCompetitorAction(input: {
  competitionId: string;
  competitorId: string;
}): Promise<DraftResult> {
  const parsed = z.object({ competitionId: uuid, competitorId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createServerSupabase();
  const idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  const { data, error } = await supabase.rpc("draft_competitor", {
    p_competition_id: parsed.data.competitionId,
    p_competitor_id: parsed.data.competitorId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, error: friendly(error.message, DRAFT_ERRORS) };

  const result = data as { assignment_id: string; status: string; payment_required?: boolean };
  return {
    ok: true,
    status: result.status,
    assignmentId: result.assignment_id,
    paymentRequired: Boolean(result.payment_required),
  };
}

export async function cancelDraftAction(input: {
  assignmentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = uuid.safeParse(input.assignmentId);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_draft_assignment", { p_assignment_id: parsed.data, p_reason: "user_canceled" });
  if (error) return { ok: false, error: "Couldn't cancel." };
  return { ok: true };
}
