import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { ProfileForm } from "@/components/creator/forms";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Edit creator profile</h1>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent>
          <ProfileForm creatorId={creator.id} initial={{ displayName: creator.displayName, description: creator.description ?? "" }} />
        </CardContent>
      </Card>
    </div>
  );
}
