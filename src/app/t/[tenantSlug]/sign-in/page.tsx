import { getTenantContext } from "@/lib/tenant/context";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  const { next } = await searchParams;
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back to {ctx.tenant.displayName}.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="sign-in" slug={ctx.tenant.slug} next={next} />
      </CardContent>
    </Card>
  );
}
