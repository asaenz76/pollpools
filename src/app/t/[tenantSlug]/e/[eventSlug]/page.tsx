import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getEventBySlug } from "@/features/events/get-event";
import { PredictionMarket } from "@/components/domain/prediction-market";
import { getEventSocial } from "@/features/social/get-event-social";
import { ShareButton } from "@/components/domain/share-button";
import { LikeButton } from "@/components/domain/like-button";
import { CommentSection } from "@/components/domain/comment-section";
import { resolveEventMedia, watchLabel } from "@/lib/domain/media";
import { SMALL_PARTICIPATION_THRESHOLD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();

  const event = await getEventBySlug(ctx.tenant.id, eventSlug);
  if (!event) notFound();

  const user = await getSessionUser();
  const signInHref = `/t/${ctx.tenant.slug}/sign-in`;

  // Optional event media (Phase 7.6): render an inline embed only for explicitly
  // supported providers when the tenant allows it; otherwise a safe external link.
  const mediaCfg = ctx.settings.media;
  const primaryMedia = mediaCfg.enabled
    ? event.media.find((m) => m.isPrimary) ?? event.media[0] ?? null
    : null;
  const resolvedMedia = primaryMedia ? resolveEventMedia(primaryMedia.url, primaryMedia.provider) : null;
  const providerAllowed =
    resolvedMedia !== null &&
    (mediaCfg.allowedProviders.length === 0 || mediaCfg.allowedProviders.includes(resolvedMedia.provider));
  const canEmbedMedia = Boolean(resolvedMedia?.canEmbed && mediaCfg.inlineEmbedsEnabled && providerAllowed && resolvedMedia.embedUrl);
  const mediaWatchLabel = primaryMedia && resolvedMedia
    ? primaryMedia.label?.trim() || watchLabel(resolvedMedia.provider, primaryMedia.mediaType)
    : null;

  const likesEnabled = ctx.features.isEnabled("likes_enabled");
  const commentsEnabled = ctx.features.isEnabled("comments_enabled");
  const sharingEnabled = ctx.features.isEnabled("sharing_enabled");
  const social =
    likesEnabled || commentsEnabled
      ? await getEventSocial(ctx.tenant.id, event.id, user?.id ?? null, { likes: likesEnabled, comments: commentsEnabled })
      : null;

  return (
    <article className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {ctx.tenant.displayName}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
        {event.creator ? (
          <p className="mt-1 text-sm text-muted-foreground">by {event.creator.displayName}</p>
        ) : null}
        {event.description ? <p className="mt-3 text-sm text-muted-foreground">{event.description}</p> : null}
      </header>

      {canEmbedMedia && resolvedMedia?.embedUrl ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border">
          <iframe
            className="h-full w-full"
            src={resolvedMedia.embedUrl}
            title={event.title}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : resolvedMedia && mediaWatchLabel && mediaCfg.externalLinksEnabled ? (
        <a
          href={resolvedMedia.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex w-fit items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-primary hover:bg-accent"
        >
          {mediaWatchLabel} →
        </a>
      ) : null}

      {event.markets.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No prediction markets on this event yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {event.markets.map((m) => (
            <PredictionMarket
              key={m.id}
              marketId={m.id}
              question={m.question}
              marketStatus={m.status}
              effectiveLocksAt={m.locksAt ?? event.locksAt}
              options={m.options.map((o) => ({ id: o.id, label: o.label, color: o.color }))}
              sentiment={m.sentiment}
              userOptionId={m.userOptionId}
              signedIn={Boolean(user)}
              smallParticipationDisplay={ctx.settings.smallParticipationDisplay}
              smallThreshold={SMALL_PARTICIPATION_THRESHOLD}
              signInHref={signInHref}
              settled={m.settled}
              winningOptionId={m.winningOptionId}
              userOutcome={m.userOutcome}
            />
          ))}
        </div>
      )}

      {(likesEnabled || sharingEnabled) && (
        <div className="flex items-center gap-1 border-t border-border pt-3">
          {likesEnabled && social ? (
            <LikeButton
              tenantId={ctx.tenant.id}
              subjectType="event"
              subjectId={event.id}
              initialLiked={social.liked}
              initialCount={social.likeCount}
              signedIn={Boolean(user)}
              signInHref={signInHref}
            />
          ) : null}
          {sharingEnabled ? <ShareButton title={event.title} /> : null}
        </div>
      )}

      {commentsEnabled && social ? (
        <CommentSection
          tenantId={ctx.tenant.id}
          subjectType="event"
          subjectId={event.id}
          comments={social.comments}
          signedIn={Boolean(user)}
          signInHref={signInHref}
        />
      ) : null}
    </article>
  );
}
