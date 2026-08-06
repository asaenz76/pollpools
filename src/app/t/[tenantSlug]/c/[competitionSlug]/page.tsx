import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCompetitionBySlug } from "@/features/competitions/get-competition";
import { getDraftSection } from "@/features/draft/get-draft";
import { BracketView } from "@/components/domain/bracket-view";
import { DraftSection } from "@/components/domain/draft-section";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  STANDALONE_EVENT: "Event",
  SEASON: "Season",
  TOURNAMENT: "Tournament",
  BRACKET: "Bracket",
};

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ competitionSlug: string }>;
}) {
  const { competitionSlug } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();

  const competition = await getCompetitionBySlug(ctx.tenant.id, competitionSlug);
  if (!competition) notFound();

  const user = await getSessionUser();
  const draft = await getDraftSection(ctx.tenant.id, competition.id, user?.id ?? null);

  return (
    <article className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {ctx.tenant.displayName}
      </Link>

      <header>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {TYPE_LABEL[competition.type] ?? competition.type}
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{competition.title}</h1>
        {competition.creator ? (
          <p className="mt-1 text-sm text-muted-foreground">by {competition.creator}</p>
        ) : null}
        {competition.description ? (
          <p className="mt-3 text-sm text-muted-foreground">{competition.description}</p>
        ) : null}
      </header>

      {draft ? (
        <DraftSection
          data={draft}
          competitionId={competition.id}
          tenantSlug={ctx.tenant.slug}
          signedIn={Boolean(user)}
          signInHref={`/t/${ctx.tenant.slug}/sign-in`}
        />
      ) : null}

      {competition.bracket ? (
        <BracketView
          tenantSlug={ctx.tenant.slug}
          rounds={competition.bracket.rounds}
          matches={competition.bracket.matches}
        />
      ) : (
        <section aria-labelledby="events-heading">
          <h2 id="events-heading" className="mb-3 text-sm font-medium text-muted-foreground">
            Events
          </h2>
          {competition.events.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No events yet</CardTitle>
                <CardDescription>Events in this {TYPE_LABEL[competition.type]?.toLowerCase()} will appear here.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {competition.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/t/${ctx.tenant.slug}/e/${e.slug}`} className="block">
                    <Card className="transition-colors hover:bg-muted">
                      <CardHeader>
                        <CardTitle className="text-base">{e.title}</CardTitle>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
}
