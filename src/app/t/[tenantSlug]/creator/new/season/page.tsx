import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { CompetitionForm } from "@/components/creator/forms";

export const dynamic = "force-dynamic";

export default async function NewSeasonPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator/new`} className="text-sm text-muted-foreground hover:underline">← Create</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New season</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create the season, then add events to it.</p>
      </header>
      <CompetitionForm creatorId={creator.id} tenantSlug={ctx.tenant.slug} type="SEASON" />
    </div>
  );
}
