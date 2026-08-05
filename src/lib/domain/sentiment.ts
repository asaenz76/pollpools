/**
 * Community sentiment (spec §12).
 *
 * Percentages are COMMUNITY SENTIMENT, never probability/odds. They are computed
 * from valid predictions only and rounded with the **largest-remainder
 * (Hamilton) method** so the displayed integers total exactly 100 — using a
 * deterministic tie-break so the same input always yields the same output.
 */

export type SentimentInput = {
  optionId: string;
  label: string;
  votes: number;
};

export type SentimentResult = SentimentInput & {
  /** Integer percentage 0..100; across all options these sum to exactly 100. */
  percentage: number;
};

export type Sentiment = {
  total: number;
  hasPredictions: boolean;
  results: SentimentResult[];
};

/**
 * Compute sentiment percentages that total exactly 100 (when there are votes).
 * Options are returned in the same order they were provided.
 */
export function computeSentiment(options: readonly SentimentInput[]): Sentiment {
  const total = options.reduce((sum, o) => sum + Math.max(0, o.votes), 0);

  if (total <= 0) {
    return {
      total: 0,
      hasPredictions: false,
      results: options.map((o) => ({ ...o, percentage: 0 })),
    };
  }

  // Floor each share, then hand out the leftover points to the largest
  // fractional remainders. Ties: higher remainder → more votes → earlier index.
  const exact = options.map((o, index) => {
    const share = (Math.max(0, o.votes) / total) * 100;
    const floor = Math.floor(share);
    return { index, floor, remainder: share - floor };
  });

  const distributed = exact.reduce((sum, e) => sum + e.floor, 0);
  let leftover = 100 - distributed;

  const order = [...exact].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    const votesA = options[a.index]?.votes ?? 0;
    const votesB = options[b.index]?.votes ?? 0;
    if (votesB !== votesA) return votesB - votesA;
    return a.index - b.index;
  });

  const percentages = new Array<number>(options.length);
  for (const e of exact) percentages[e.index] = e.floor;
  for (const e of order) {
    if (leftover <= 0) break;
    percentages[e.index] = (percentages[e.index] ?? 0) + 1;
    leftover -= 1;
  }

  return {
    total,
    hasPredictions: true,
    results: options.map((o, i) => ({ ...o, percentage: percentages[i] ?? 0 })),
  };
}

/**
 * Sentiment label for a single option (spec §12 copy). When participation is
 * small and the tenant enables it, shows "Picked by X of Y" instead of a %.
 */
export function sentimentLabel(
  option: SentimentResult,
  total: number,
  opts: { smallParticipationDisplay?: boolean; smallThreshold?: number } = {},
): string {
  const { smallParticipationDisplay = false, smallThreshold = 10 } = opts;
  if (total <= 0) return "No community sentiment yet.";
  if (smallParticipationDisplay && total < smallThreshold) {
    return `Picked by ${option.votes} of ${total}`;
  }
  return `Picked by ${option.percentage}%`;
}

/** The option(s) with the most votes — the "community favorite". */
export function communityFavorite(results: readonly SentimentResult[]): SentimentResult | null {
  let best: SentimentResult | null = null;
  for (const r of results) {
    if (r.votes > 0 && (!best || r.votes > best.votes)) best = r;
  }
  return best;
}
