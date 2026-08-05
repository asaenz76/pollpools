import { getTenantContext } from "@/lib/tenant/context";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Join {ctx.tenant.displayName} — free to play, always.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="sign-up" slug={ctx.tenant.slug} />
      </CardContent>
    </Card>
  );
}
