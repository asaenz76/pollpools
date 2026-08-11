import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { getPlatformStatus } from "@/lib/growth/dashboard";
import { resolveTenantBrand } from "@/lib/theme/tenant-theme";
import { TenantManageNav } from "@/components/creator/manage-nav";
import type { FeatureFlag } from "@/lib/tenant/feature-flags";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { positive: "text-positive", warning: "text-streak", negative: "text-negative", muted: "text-muted-foreground" };

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={"font-medium " + (tone ? TONE[tone] : "")}>{value}</span>
    </div>
  );
}

export default async function CommunitySettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);
  const base = `/t/${ctx.tenant.slug}/creator`;

  const platformStatus = await getPlatformStatus(ctx.tenant.id);
  const brand = resolveTenantBrand(ctx.tenant.theme);
  const hasLogo = Boolean(brand.logoLight || brand.logoDark);
  const domain = platformStatus.find((s) => s.key === "custom_domain");
  const ssl = platformStatus.find((s) => s.key === "ssl");

  const FEATURES: { flag: FeatureFlag; label: string }[] = [
    { flag: "predictions_enabled", label: "Predictions" },
    { flag: "creator_support_enabled", label: "Creator Support" },
    { flag: "youtube_embeds_enabled", label: "Media / livestream embeds" },
    { flag: "public_profiles_enabled", label: "Public profiles" },
    { flag: "creator_following_enabled", label: "Following" },
    { flag: "comments_enabled", label: "Comments" },
    { flag: "achievements_enabled", label: "Achievements" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Community settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your community&apos;s branding, features, and domain.</p>
        </div>
        <Link href={base} className="text-sm text-muted-foreground hover:underline">← Dashboard</Link>
      </header>

      <TenantManageNav slug={ctx.tenant.slug} current={`${base}/settings`} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Community</h2>
        <Row label="Name" value={ctx.tenant.displayName} />
        <Row label="Handle" value={`/t/${ctx.tenant.slug}`} />
        <Row label="Default language" value={(ctx.tenant.defaultLocale ?? "en").toUpperCase()} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Branding</h2>
        <Row label="Logo" value={hasLogo ? "Set" : "Not set"} tone={hasLogo ? "positive" : "warning"} />
        <p className="text-xs text-muted-foreground">Profile name &amp; description are editable on <Link href={`${base}/profile`} className="text-primary hover:underline">your profile</Link>.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Features</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const on = ctx.features.isEnabled(f.flag);
            return <Row key={f.flag} label={f.label} value={on ? "On" : "Off"} tone={on ? "positive" : "muted"} />;
          })}
        </div>
        <p className="text-xs text-muted-foreground">Media is always optional — events never require video. Feature availability is set for your community; ask a platform admin to change it.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Domain</h2>
        <Row label="Custom domain" value={domain?.value ?? "Not configured"} tone={domain?.tone} />
        <Row label="SSL" value={ssl?.value ?? "Not applicable"} tone={ssl?.tone} />
        <p className="text-xs text-muted-foreground">Custom domains are set up with a platform admin (DNS verification + SSL).</p>
      </section>
    </div>
  );
}
