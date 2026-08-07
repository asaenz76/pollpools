/**
 * Tenant vocabulary (Phase 8B.1).
 *
 * Presentation-only naming. The engine's tables and concepts stay generic
 * (competitor / event / market / prediction / …); each tenant may re-label those
 * concepts for its audience — "Marble"/"Race", "Chef"/"Cook-off", "Club"/"Match"
 * — WITHOUT any schema change, UI fork, or shared-code branch.
 *
 * This is a closed registry of concept keys with English defaults. A tenant
 * override is a partial map `{ key: { singular?, plural? } }` stored in
 * `tenant_settings.vocabulary`; `resolveVocabulary` layers it over the defaults.
 * New keys are added here as their call sites arrive — it is not a generic DSL.
 */

/** Canonical concept keys. These are engine concepts, never tenant-specific. */
export const VOCABULARY_KEYS = [
  "competitor",
  "prediction",
  "event",
  "market",
  "competition",
  "season",
  "tournament",
  "bracket",
  "creator",
  "draft",
  "leaderboard",
  "round",
  "member",
] as const;

export type VocabularyKey = (typeof VOCABULARY_KEYS)[number];

export type VocabTerm = { singular: string; plural: string };
export type Vocabulary = Record<VocabularyKey, VocabTerm>;

/** English platform defaults. A tenant that configures nothing gets exactly these. */
export const DEFAULT_VOCABULARY: Vocabulary = {
  competitor: { singular: "Competitor", plural: "Competitors" },
  prediction: { singular: "Prediction", plural: "Predictions" },
  event: { singular: "Event", plural: "Events" },
  market: { singular: "Market", plural: "Markets" },
  competition: { singular: "Competition", plural: "Competitions" },
  season: { singular: "Season", plural: "Seasons" },
  tournament: { singular: "Tournament", plural: "Tournaments" },
  bracket: { singular: "Bracket", plural: "Brackets" },
  creator: { singular: "Creator", plural: "Creators" },
  draft: { singular: "Draft", plural: "Drafts" },
  leaderboard: { singular: "Leaderboard", plural: "Leaderboards" },
  round: { singular: "Round", plural: "Rounds" },
  member: { singular: "Member", plural: "Members" },
};

const KEY_SET = new Set<string>(VOCABULARY_KEYS);

/** A stored override value: either full term or a partial (singular-only is common). */
type OverrideValue = { singular?: unknown; plural?: unknown };

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 60 ? trimmed : null;
}

/**
 * Merge a tenant's stored overrides over the English defaults. Unknown keys are
 * ignored; empty/oversized labels are ignored. When a singular is given without a
 * plural, the plural is naively derived (append "s") — tenants override `plural`
 * explicitly for irregulars. Total by construction: every key is always present.
 */
export function resolveVocabulary(overrides: unknown): Vocabulary {
  const result = { ...DEFAULT_VOCABULARY } as Vocabulary;
  if (!overrides || typeof overrides !== "object") return result;

  for (const [key, raw] of Object.entries(overrides as Record<string, unknown>)) {
    if (!KEY_SET.has(key) || !raw || typeof raw !== "object") continue;
    const value = raw as OverrideValue;
    const singular = cleanLabel(value.singular);
    const plural = cleanLabel(value.plural);
    if (!singular && !plural) continue;
    const base = DEFAULT_VOCABULARY[key as VocabularyKey];
    const nextSingular = singular ?? base.singular;
    const nextPlural = plural ?? (singular ? `${singular}s` : base.plural);
    result[key as VocabularyKey] = { singular: nextSingular, plural: nextPlural };
  }
  return result;
}

export type TermCase = "title" | "lower" | "sentence";

function applyCase(label: string, mode: TermCase | undefined): string {
  if (mode === "lower") return label.toLowerCase();
  if (mode === "sentence") return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  return label; // "title" / default: as stored
}

/** Resolve a single term. Defaults to the singular, title-cased as stored. */
export function term(
  vocab: Vocabulary,
  key: VocabularyKey,
  opts?: { plural?: boolean; case?: TermCase },
): string {
  const entry = vocab[key] ?? DEFAULT_VOCABULARY[key];
  return applyCase(opts?.plural ? entry.plural : entry.singular, opts?.case);
}

/** Map a generic competition_type to the tenant's label for that shape. */
export function competitionTypeLabel(vocab: Vocabulary, type: string): string {
  switch (type) {
    case "STANDALONE_EVENT":
      return term(vocab, "event");
    case "SEASON":
      return term(vocab, "season");
    case "TOURNAMENT":
      return term(vocab, "tournament");
    case "BRACKET":
      return term(vocab, "bracket");
    default:
      return type;
  }
}
