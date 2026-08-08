import type { ReactNode } from "react";
import type { TemplateConfig } from "@/lib/templates/schema";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0 sm:flex-row sm:gap-3">
      <dt className="w-40 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-full border border-border px-2 py-0.5 text-xs capitalize">{i}</span>
      ))}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">{empty}</span>
  );
}

/** Structured, human-readable preview of a template configuration (no raw JSON). */
export function TemplatePreview({ config, engineVersion }: { config: TemplateConfig; engineVersion: string }) {
  const enabledFeatures = Object.entries(config.featureFlags ?? {})
    .filter(([, on]) => on)
    .map(([f]) => f.replace(/_enabled$/, "").replace(/_/g, " "));
  const vocab = Object.entries(config.vocabulary ?? {}).map(([k, v]) => `${k} → ${v.singular ?? "?"}`);
  const markets = (config.marketTemplates ?? []).map((m) => m.type);
  const notif = config.providers?.notification ?? ["in_app"];

  return (
    <dl className="rounded-lg border border-border bg-card p-4">
      <Row label="Engine version">{engineVersion}</Row>
      <Row label="Locale / timezone">{config.locale ?? "en"} · {config.timezone ?? "UTC"}</Row>
      <Row label="Vocabulary"><Chips items={vocab} empty="Platform defaults" /></Row>
      <Row label="Enabled features"><Chips items={enabledFeatures} empty="—" /></Row>
      <Row label="Competition types"><Chips items={config.enabledCompetitionTypes ?? []} empty="All" /></Row>
      <Row label="Market types"><Chips items={markets} empty="Single choice winner" /></Row>
      <Row label="Competitor Draft">{config.competitionDefaults?.draftEnabled ? "Enabled" : "Disabled"}</Row>
      <Row label="Providers">result: {config.providers?.result ?? "manual"} · event: {config.providers?.event ?? "manual"} · notify: {notif.join(", ")}</Row>
      <Row label="Media">{config.settings?.media?.enabled === false ? "Off" : `On${config.settings?.media?.optional === false ? " (required)" : " (optional)"}`}</Row>
      <Row label="Revenue features"><Chips items={[config.revenue?.creatorSupport ? "creator support" : "", config.revenue?.competitorDraft ? "competitor draft" : ""].filter(Boolean)} empty="None" /></Row>
      <Row label="Branding">
        {config.theme?.brandPrimary ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full border border-border" style={{ backgroundColor: config.theme.brandPrimary }} />
            {config.theme.brandPrimary}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Platform default</span>
        )}
      </Row>
    </dl>
  );
}
