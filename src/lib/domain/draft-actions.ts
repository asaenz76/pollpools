"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPaymentAdapter, MockPaymentAdapter } from "@/lib/payments/adapter";
import { serverEnv } from "@/lib/env";

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
  | { ok: true; status: string; assignmentId: string; paymentReference: string | null }
  | { ok: false; error: string };

/** Draft a competitor. FREE → confirmed; PAID → reservation needing payment. */
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

  const result = data as { assignment_id: string; status: string; payment?: { reference: string } | null };
  return {
    ok: true,
    status: result.status,
    assignmentId: result.assignment_id,
    paymentReference: result.payment?.reference ?? null,
  };
}

/**
 * Simulate the payment provider's verified webhook for the MOCK adapter. Confirms
 * the current user's own pending payment only, verifies the signature, then calls
 * the service-role `confirm_draft_payment` (idempotent / replay-safe).
 */
export async function completeMockPaymentAction(input: {
  paymentReference: string;
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const ref = z.string().min(6).safeParse(input.paymentReference);
  if (!ref.success) return { ok: false, error: "Invalid payment." };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // The user may only complete their OWN pending payment (RLS enforces the read).
  const { data: payment } = await supabase
    .from("draft_payments")
    .select("id, status")
    .eq("provider_reference", ref.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!payment) return { ok: false, error: "Payment not found." };

  // Verify the (mock) provider signature, then confirm via the service role.
  const secret = serverEnv().SUBSCRIPTION_WEBHOOK_SECRET;
  const adapter = getPaymentAdapter("mock");
  const signature = MockPaymentAdapter.sign(ref.data, secret);
  if (!adapter.verifyWebhook({ provider: "mock", reference: ref.data, status: "paid", signature }, secret)) {
    return { ok: false, error: "Payment verification failed." };
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("confirm_draft_payment", { p_provider_reference: ref.data });
  if (error) return { ok: false, error: "Couldn't confirm payment." };
  return { ok: true, status: (data as { status?: string }).status ?? "confirmed" };
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
