import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { OnboardingForm } from "@/components/creator/forms";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  if (await getMyCreator(ctx.tenant.id)) redirect(`/t/${ctx.tenant.slug}/creator`);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Become a creator</CardTitle>
          <CardDescription>Set up your creator profile on {ctx.tenant.displayName}.</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm tenantSlug={ctx.tenant.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
