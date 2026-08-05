import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CreateChooserPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  if (!(await getMyCreator(ctx.tenant.id))) redirect(`/t/${ctx.tenant.slug}/creator`);

  const base = `/t/${ctx.tenant.slug}/creator/new`;
  const options = [
    { href: `${base}/standalone`, title: "Standalone race", desc: "A single event with a prediction market." },
    { href: `${base}/season`, title: "Season", desc: "A series of events with cumulative standings." },
    { href: `${base}/tournament`, title: "Tournament", desc: "Staged rounds toward a final." },
    { href: `${base}/bracket`, title: "Knockout bracket", desc: "Single-elimination, 2–32 competitors." },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">What are you creating?</h1>
      </header>
      <ul className="flex flex-col gap-3">
        {options.map((o) => (
          <li key={o.href}>
            <Link href={o.href} className="block">
              <Card className="transition-colors hover:bg-muted">
                <CardHeader>
                  <CardTitle className="text-base">{o.title}</CardTitle>
                  <CardDescription>{o.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
