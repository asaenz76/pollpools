# Read-path performance (Phase 8-C)

Scope: hot-read performance, pagination, and default-question localization. No
commercial, settlement, billing, Community-Health, or growth-automation change.

## Event page — batched reads (F-17)

`getEventBySlug` previously issued 3 queries **per market** (options, a
`market_sentiment` RPC, the user's prediction) — `3 + 3N` for an N-market event.
It now issues a constant number of queries by batching across the whole event:

- one `market_options` query (`market_id IN (…)`),
- one `markets_sentiment(uuid[])` RPC (identical counting to `market_sentiment`,
  per-market total via a partitioned window),
- one `predictions` query for the signed-in user.

Rows are grouped by `market_id` in memory. No maintained counters were introduced
— the batched set-based query already bounds the read, and reconciliation stays
the source of truth (no new aggregate to rebuild).

## Feed — keyset pagination (F-18)

The feed reads by keyset, not `LIMIT`/`OFFSET`:

- order: `(created_at DESC, id DESC)` — a deterministic total order even across
  equal timestamps;
- cursor: a `(created_at, id)` row-value comparison, so pages never skip or
  duplicate rows as new activity arrives;
- `getFeed` returns `{ items, nextCursor }`; `loadMoreFeedAction` + the `FeedList`
  client component append pages by cursor. Tenant isolation is preserved.

Index `idx_feed_tenant_keyset (tenant_id, created_at DESC, id DESC)` matches the
query's exact order + cursor (confirmed via EXPLAIN — Index Only Scan).

## Indexes (F-20)

The hot prediction/sentiment/feed reads are index-served: `idx_predictions_market_status`,
`idx_predictions_option`, unique `(market_id, user_id)`, `idx_market_options_market`,
and `idx_feed_tenant_keyset`. `hot_path_indexes_ok()` + a test guard against a
critical index being dropped. No speculative indexes.

## Default market question (F-21)

The default question is derived from the tenant's vocabulary + `default_locale`
(`defaultMarketQuestion`, translation-ready), never a hard-coded English literal.
See [tenant vocabulary](../src/lib/vocabulary/index.ts).
