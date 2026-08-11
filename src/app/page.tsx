import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

/**
 * Platform apex landing. Lists the active tenants (a public directory) — the
 * clearest demonstration that one codebase + one database powers many brands.
 */
export default async function PlatformHome() {
  const supabase = await createServerSupabase();
  const { data: tenants } = await supabase
    .from("tenants")
    .select("slug, display_name, tagline")
    .eq("status", "active")
    .eq("listed", true) // discovery shows only published communities (PL.4)
    .order("display_name");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Poll Pools</span>
        <ThemeToggle />
      </header>

      <section className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Social prediction, for any community.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Infrastructure for creators, clubs, and brands to run prediction competitions.
          Free to play, community-driven, and built to power any vertical.
        </p>
      </section>

      <section aria-labelledby="tenants-heading">
        <h2 id="tenants-heading" className="mb-3 text-sm font-medium text-muted-foreground">
          Communities on Prediction Engine
        </h2>

        {tenants && tenants.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {tenants.map((t) => (
              <li key={t.slug}>
                <Link href={`/t/${t.slug}`} className="block">
                  <Card className="transition-colors hover:bg-muted">
                    <CardHeader>
                      <CardTitle>{t.display_name}</CardTitle>
                      {t.tagline ? <CardDescription>{t.tagline}</CardDescription> : null}
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No communities yet</CardTitle>
              <CardDescription>
                Seed the reference tenant with{" "}
                <code className="text-foreground">npm run db:reset</code> to see one here.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-6 text-xs text-muted-foreground">
        <span>Poll Pools</span>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/support" className="hover:underline">Support</Link>
      </footer>
    </main>
  );
}
