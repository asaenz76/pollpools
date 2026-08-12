import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePlatformDestination } from "@/lib/auth/roles";
import { safeReturnPath } from "@/lib/domain/domains";
import { PlatformSignInForm } from "@/components/auth/platform-sign-in-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

/**
 * Platform sign-in — tenant-independent entry point (mainly for platform admins).
 * Auth is global (Supabase), so no tenant is required. An already-authenticated
 * visitor is sent straight to their destination.
 */
export default async function PlatformSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const requested = safeReturnPath(String(next ?? ""));
    redirect(requested !== "/" ? requested : await resolvePlatformDestination(supabase, data.user.id));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight hover:underline">
          Poll Pools
        </Link>
        <ThemeToggle />
      </header>

      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign in to Poll Pools.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformSignInForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
