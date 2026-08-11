"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPollPoolAction, type StarterTemplate } from "@/lib/domain/onboarding-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Europe/Madrid", "Asia/Tokyo", "Australia/Sydney"];
const LOCALES = [{ code: "en", label: "English" }, { code: "es", label: "Español" }, { code: "pt", label: "Português" }, { code: "fr", label: "Français" }];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 62);
}

const STEPS = ["Community", "Basics", "Experience", "Review"] as const;

export function CreatePollPoolWizard({ templates }: { templates: StarterTemplate[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [versionId, setVersionId] = useState(templates[0]?.versionId ?? "");
  const [timezone, setTimezone] = useState("UTC");
  const [locale, setLocale] = useState("en");
  const [creatorSupport, setCreatorSupport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const chosen = useMemo(() => templates.find((t) => t.versionId === versionId), [templates, versionId]);

  const step1Valid = name.trim().length >= 2 && effectiveSlug.length >= 2 && description.trim().length >= 2 && Boolean(versionId);
  const canNext = step === 0 ? step1Valid : true;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createPollPoolAction({ versionId, displayName: name.trim(), slug: effectiveSlug, description: description.trim(), locale, timezone, creatorSupport });
      if (!res.ok) { setError(res.error); setStep(0); return; }
      router.push(`/t/${res.slug}/creator`);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Progress */}
      <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("grid size-6 place-items-center rounded-full border text-[11px] font-medium", i <= step ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{i + 1}</span>
            <span className={i === step ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {i < STEPS.length - 1 ? <span className="mx-1 text-muted-foreground">→</span> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Community name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marble Grand Prix" required minLength={2} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Community URL</Label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">/t/</span>
              <Input value={effectiveSlug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }} placeholder="marble-grand-prix" />
            </div>
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Short description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Predict the outcomes of marble races." required minLength={2} maxLength={500} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category / template</Label>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No templates are available yet. Ask a platform admin.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <li key={t.versionId}>
                    <button type="button" onClick={() => setVersionId(t.versionId)} aria-pressed={versionId === t.versionId}
                      className={cn("flex w-full flex-col items-start gap-0.5 rounded-lg border p-3 text-left", versionId === t.versionId ? "border-primary bg-primary-subtle" : "border-border hover:bg-muted")}>
                      <span className="text-sm font-medium">{t.name}</span>
                      {t.description ? <span className="text-xs text-muted-foreground">{t.description}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Time zone</Label>
            <select className="h-11 rounded-md border border-input bg-transparent px-3 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Event scheduling uses this time zone.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Default language</Label>
            <select className="h-11 rounded-md border border-input bg-transparent px-3 text-sm" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <p className="font-medium">Predictions</p>
            <p className="text-xs text-muted-foreground">On — the core of your community.</p>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Creator Support</span>
              <span className="block text-xs text-muted-foreground">Let members voluntarily support you. You can change this later.</span>
            </span>
            <input type="checkbox" checked={creatorSupport} onChange={(e) => setCreatorSupport(e.target.checked)} className="size-4" />
          </label>
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <p className="font-medium">Media / livestream</p>
            <p className="text-xs text-muted-foreground">Optional — add YouTube, TikTok, Twitch, or any link per event. Video is never required.</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <p className="font-medium">Competitor Draft</p>
            <p className="text-xs text-muted-foreground">Enable per competition when you create one.</p>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <dl className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">URL</dt><dd className="font-medium">/t/{effectiveSlug}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Template</dt><dd className="font-medium">{chosen?.name ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Time zone</dt><dd className="font-medium">{timezone}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Language</dt><dd className="font-medium">{locale.toUpperCase()}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Creator Support</dt><dd className="font-medium">{creatorSupport ? "On" : "Off"}</dd></div>
        </dl>
      ) : null}

      {error ? <p className="text-sm text-negative">{error}</p> : null}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>Back</Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Next</Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending || !step1Valid}>{pending ? "Creating…" : "Create PollPool"}</Button>
        )}
      </div>
    </div>
  );
}
