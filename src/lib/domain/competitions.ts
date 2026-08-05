"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateBracket, bracketToStructure } from "@/lib/domain/bracket";
import { MIN_BRACKET_COMPETITORS, MAX_BRACKET_COMPETITORS } from "@/lib/constants";

const createBracketSchema = z.object({
  competitionId: z.string().uuid(),
  // The creator selects the competitors; their count (2–32) is the bracket size.
  competitorIds: z
    .array(z.string().uuid())
    .min(MIN_BRACKET_COMPETITORS, `Select at least ${MIN_BRACKET_COMPETITORS} competitors`)
    .max(MAX_BRACKET_COMPETITORS, `A knockout supports at most ${MAX_BRACKET_COMPETITORS} competitors`)
    .refine((ids) => new Set(ids).size === ids.length, "Competitors must be unique"),
});

export type CreateBracketInput = z.infer<typeof createBracketSchema>;
export type CreateBracketResult = { ok: true } | { ok: false; error: string };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: "You don't have permission to build this bracket.",
  NOT_A_BRACKET: "This competition isn't a bracket.",
  BRACKET_ALREADY_EXISTS: "This bracket has already been generated.",
  BRACKET_TOO_LARGE: `A knockout supports at most ${MAX_BRACKET_COMPETITORS} competitors.`,
  COMPETITION_NOT_FOUND: "This competition no longer exists.",
};

function friendly(message: string): string {
  const code = Object.keys(ERROR_MESSAGES).find((c) => message.includes(c));
  return code ? ERROR_MESSAGES[code]! : "Couldn't generate the bracket. Please try again.";
}

/**
 * Generate and persist a single-elimination bracket for a competition from the
 * creator's selected competitors (seed-ordered). Byes fill out the next power of
 * two. Authorization is enforced inside `create_bracket` (owner/super-admin).
 */
export async function createBracket(input: CreateBracketInput): Promise<CreateBracketResult> {
  const parsed = createBracketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let structure;
  try {
    structure = bracketToStructure(generateBracket(parsed.data.competitorIds));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid bracket" };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_bracket", {
    p_competition_id: parsed.data.competitionId,
    p_structure: structure,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}
