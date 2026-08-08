"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTenantFromTemplateAction, type CreateResult } from "@/lib/ops/template-actions";

/**
 * Create a tenant from a published template (allowed creation-time overrides only:
 * identity, locale/timezone, branding color, demo data). Settlement/billing/plan
 * internals are never overridable here.
 */
export function CreateTenantForm({ templateVersionId, hasSeed, defaultLocale, defaultTimezone }: { templateVersionId: string; hasSeed: boolean; defaultLocale: string; defaultTimezone: string }) {
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [locale, setLocale] = useState(defaultLocale);
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [brandPrimary, setBrandPrimary] = useState("");
  const [includeDemo, setIncludeDemo] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CreateResult | null>(null);

  const submit = () =>
    start(async () => {
      try {
        const overrides: Record<string, unknown> = {};
        if (brandPrimary.trim()) overrides.theme = { brandPrimary: brandPrimary.trim() };
        setResult(await createTenantFromTemplateAction({ templateVersionId, displayName, slug, locale, timezone, overrides, includeDemo }));
      } catch {
        setResult({ ok: false, message: "Create failed." });
      }
    });

  if (result?.ok) {
    return (
      <div className="rounded-lg border border-positive/40 bg-card p-4">
        <p className="font-medium text-positive">Tenant created 🎉</p>
        <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
        <div className="mt-3 flex gap-2">
          <Link href={`/t/${result.slug}`} className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">Open tenant</Link>
          {result.tenantId ? <Link href={`/admin/tenants/${result.tenantId}`} className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm">Ops view</Link> : null}
        </div>
      </div>
    );
  }

  const field = "flex flex-col gap-1 text-xs text-muted-foreground";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>Display name<Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Acme Predictions" /></label>
        <label className={field}>Slug<Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="acme" /></label>
        <label className={field}>Locale<Input value={locale} onChange={(e) => setLocale(e.target.value)} /></label>
        <label className={field}>Timezone<Input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
        <label className={field}>Brand color (optional override)<Input value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#0c44ac" /></label>
      </div>
      {hasSeed ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
          Include demo data (sample competitors + an event to try immediately)
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">This template has no demo data — the tenant will be created empty.</p>
      )}
      <div>
        <Button disabled={pending || !displayName.trim() || !slug.trim()} onClick={submit}>{pending ? "Creating…" : "Create tenant"}</Button>
      </div>
      {result && !result.ok ? <p className="text-sm text-negative">{result.message}</p> : null}
    </div>
  );
}
