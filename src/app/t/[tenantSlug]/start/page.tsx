import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getStarterTemplates } from "@/lib/domain/onboarding-actions";
import { CreatePollPoolWizard } from "@/components/onboarding/create-pollpool-wizard";

export const dynamic = "force-dynamic";

/**
 * "Create Your PollPool" — self-service community creation (RX.4). Available to any
 * signed-in user; the created community is a brand-new tenant that the user owns and
 * operates. Provisioning is atomic (create_pollpool) — a failure leaves no partial
 * tenant.
 */
export default async function StartPollPoolPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in?next=${encodeURIComponent(`/t/${ctx.tenant.slug}/start`)}`);

  const templates = await getStarterTemplates();

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/t/${ctx.tenant.slug}`} className="text-sm text-muted-foreground hover:underline">← Back</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Create your PollPool</h1>
        <p className="mt-1 text-sm text-muted-foreground">Spin up your own prediction community in a few steps.</p>
      </header>
      <CreatePollPoolWizard templates={templates} />
    </div>
  );
}
