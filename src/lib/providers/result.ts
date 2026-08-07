/**
 * Result providers (Phase 8B.3).
 *
 * Result ingestion is generalized behind a ResultProvider: it turns a raw,
 * source-specific submission into the engine's canonical result (winning market
 * options, with an optional competitor) via validate → normalize, then hands it
 * to the engine to `submit`, and optionally `verify`s provenance. This is
 * ARCHITECTURE ONLY — no external integrations. The single implementation today
 * is `manual` (an admin/creator entering the result); api/webhook/csv providers
 * plug into the same interface later without touching the settlement engine.
 *
 * The engine authority is unchanged: settlement still happens through the
 * existing `settle_event` RPC (which validates the options and enforces
 * permissions). A provider only shapes input into the canonical form.
 */
import { z } from "zod";

export type ResultProviderId = "manual" | "api" | "webhook" | "csv";

/** The engine's canonical result, independent of the ingestion source. */
export type NormalizedResult = {
  winningOptionIds: string[];
  winningCompetitorId: string | null;
  notes: string | null;
  resultUrl: string | null;
};

export type ResultValidation = { ok: true; value: NormalizedResult } | { ok: false; error: string };

/** The engine boundary a provider submits a normalized result to. */
export type ResultOutcome = { ok: true } | { ok: false; error: string };
export interface ResultEngine {
  settle(result: NormalizedResult): Promise<ResultOutcome>;
}

export interface ResultProvider {
  readonly id: ResultProviderId;
  readonly label: string;
  /** Whether a submission from this source needs a separate verify step before it is trusted. */
  readonly requiresVerification: boolean;
  /** Validate + normalize a raw, source-specific submission into the canonical result. */
  validate(raw: unknown): ResultValidation;
  /** Submit a normalized result to the engine. Default: delegate straight to the engine. */
  submit?(engine: ResultEngine, result: NormalizedResult): Promise<ResultOutcome>;
  /** Verify provenance of a submission (future API/webhook providers); manual needs none. */
  verify?(result: NormalizedResult): Promise<boolean>;
}

const uuid = z.string().uuid();

const manualSchema = z
  .object({
    winningOptionIds: z.array(uuid).min(1).optional(),
    winningCompetitorId: uuid.optional(),
    notes: z.string().max(1000).optional(),
    resultUrl: z.string().url().optional().or(z.literal("")),
  })
  .refine((r) => (r.winningOptionIds?.length ?? 0) > 0 || r.winningCompetitorId, {
    message: "Select the result.",
  });

/**
 * Manual entry (admin/creator). The submitter IS the authority, so there is no
 * separate provenance check — permission is still enforced downstream by
 * `settle_event`. validate() is the exact shaping the result action performs.
 */
export const manualResultProvider: ResultProvider = {
  id: "manual",
  label: "Manual entry",
  requiresVerification: false,
  validate(raw) {
    const parsed = manualSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    return {
      ok: true,
      value: {
        winningOptionIds: parsed.data.winningOptionIds ?? [],
        winningCompetitorId: parsed.data.winningCompetitorId ?? null,
        notes: parsed.data.notes?.trim() || null,
        resultUrl: (parsed.data.resultUrl ?? "").trim() || null,
      },
    };
  },
};

const RESULT_PROVIDERS: Record<string, ResultProvider> = {
  manual: manualResultProvider,
};

/**
 * Resolve a configured result provider. Only `manual` is implemented; api/webhook/
 * csv are recognized ids that a tenant cannot select until an implementation is
 * registered (throws a clear error rather than silently doing nothing).
 */
export function resolveResultProvider(id: ResultProviderId | string | null | undefined): ResultProvider {
  const provider = RESULT_PROVIDERS[id ?? "manual"];
  if (!provider) throw new Error(`RESULT_PROVIDER_NOT_CONFIGURED: ${id}`);
  return provider;
}
