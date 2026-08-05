import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorWorkspace } from "@/features/creator/get-creator-workspace";
import { EventForm } from "@/components/creator/forms";

export const dynamic = "force-dynamic";

export default async function NewStandalonePage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const ws = await getCreatorWorkspace(ctx.tenant.id);
  if (!ws) redirect(`/t/${ctx.tenant.slug}/creator`);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator/new`} className="text-sm text-muted-foreground hover:underline">← Create</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Standalone race</h1>
        <p className="mt-1 text-sm text-muted-foreground">Publishes an open event with a &quot;which competitor will win?&quot; market.</p>
      </header>
      {ws.competitors.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Add at least 2 <Link href={`/t/${ctx.tenant.slug}/creator/competitors`} className="text-primary hover:underline">competitors</Link> first.
        </p>
      ) : (
        <EventForm creatorId={ws.creator.id} tenantSlug={ctx.tenant.slug} competitors={ws.competitors} />
      )}
    </div>
  );
}
