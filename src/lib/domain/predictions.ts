"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const submitSchema = z.object({
  marketId: z.string().uuid(),
  optionId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
});

export type SubmitPredictionInput = z.infer<typeof submitSchema>;
export type SubmitPredictionResult =
  | { ok: true; optionId: string }
  | { ok: false; error: string };

/** Human-readable messages for the error codes raised by submit_prediction. */
const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Please sign in to make a prediction.",
  IDEMPOTENCY_KEY_REQUIRED: "Something went wrong. Please try again.",
  MARKET_NOT_FOUND: "This market no longer exists.",
  ACCOUNT_NOT_ACTIVE: "Your account can't make predictions right now.",
  NOT_A_MEMBER: "Join this community to make a prediction.",
  MARKET_NOT_OPEN: "This market isn't open for predictions.",
  MARKET_LOCKED: "Predictions are locked for this market.",
  INVALID_OPTION: "That choice isn't available.",
  PREDICTION_LOCKED: "Your prediction is locked and can't be changed.",
  EDITING_DISABLED: "Predictions can't be changed once submitted here.",
};

function friendly(message: string): string {
  const code = Object.keys(ERROR_MESSAGES).find((c) => message.includes(c));
  return code ? ERROR_MESSAGES[code]! : "Couldn't submit your prediction. Please try again.";
}

/**
 * Submit (or change, pre-lock) the current user's prediction. All rules —
 * locking by server time, one-per-market, editing, idempotency — are enforced
 * inside the `submit_prediction` database function. This action is a thin,
 * validated, session-bound wrapper; it never writes the prediction directly.
 */
export async function submitPrediction(input: SubmitPredictionInput): Promise<SubmitPredictionResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("submit_prediction", {
    p_market_id: parsed.data.marketId,
    p_option_id: parsed.data.optionId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_source: "web",
  });

  if (error) return { ok: false, error: friendly(error.message) };

  const optionId = (data as { option_id?: string } | null)?.option_id ?? parsed.data.optionId;
  return { ok: true, optionId };
}
