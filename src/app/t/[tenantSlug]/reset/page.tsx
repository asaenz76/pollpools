import { getTenantContext } from "@/lib/tenant/context";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>We&apos;ll email you a link to set a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="reset" slug={ctx.tenant.slug} />
      </CardContent>
    </Card>
  );
}
