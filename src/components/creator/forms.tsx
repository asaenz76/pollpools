"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  becomeCreatorAction,
  updateCreatorProfileAction,
  addCompetitorAction,
  updateCompetitorAction,
  createCompetitionAction,
  createBracketCompetitionAction,
  createEventAction,
  submitResultAction,
  correctResultAction,
} from "@/lib/domain/creator-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_BRACKET_COMPETITORS, MAX_BRACKET_COMPETITORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { EVENT_MEDIA_TYPE, type EventMediaType } from "@/types/enums";
import { validateMediaUrl, detectProvider, providerLabel } from "@/lib/domain/media";
import { CompetitorMark } from "@/components/domain/competitor-mark";

type Competitor = { id: string; name: string; color: string | null; colors?: string[]; identifier?: string | null; imageUrl?: string | null };

function Err({ msg }: { msg: string | null }) {
  return msg ? <p className="text-sm text-negative">{msg}</p> : null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Multi-select competitor picker (checkbox list).
function CompetitorPicker({
  competitors,
  selected,
  toggle,
}: {
  competitors: Competitor[];
  selected: Set<string>;
  toggle: (id: string) => void;
}) {
  if (competitors.length === 0) {
    return <p className="text-sm text-muted-foreground">Add competitors first, then come back to build this.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {competitors.map((c) => {
        const on = selected.has(c.id);
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                on ? "border-primary bg-muted" : "border-border hover:bg-muted",
              )}
            >
              <CompetitorMark name={c.name} colors={c.colors} color={c.color} identifier={c.identifier} imageUrl={c.imageUrl} size={20} />
              <span className="min-w-0 truncate">{c.name}</span>
              {on ? <span className="ml-auto text-xs text-primary">✓</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Onboarding ───────────────────────────────────────────────────────────────
export function OnboardingForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [displayName, setName] = useState("");
  const [description, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await becomeCreatorAction({ tenantSlug, displayName, description });
          if (!res.ok) return setError(res.error);
          router.push(`/t/${tenantSlug}/creator`);
        });
      }}
    >
      <Field label="Creator name"><Input value={displayName} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
      <Field label="Description (optional)"><Input value={description} onChange={(e) => setDesc(e.target.value)} /></Field>
      <Err msg={error} />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create creator profile"}</Button>
    </form>
  );
}

// ── Edit profile ─────────────────────────────────────────────────────────────
export function ProfileForm({ creatorId, initial }: { creatorId: string; initial: { displayName: string; description: string } }) {
  const router = useRouter();
  const [displayName, setName] = useState(initial.displayName);
  const [description, setDesc] = useState(initial.description);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        start(async () => {
          const res = await updateCreatorProfileAction({ creatorId, displayName, description });
          if (!res.ok) return setError(res.error);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <Field label="Creator name"><Input value={displayName} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
      <Field label="Description"><Input value={description} onChange={(e) => setDesc(e.target.value)} /></Field>
      <Err msg={error} />
      {saved ? <p className="text-sm text-positive">Saved.</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}

// ── Appearance editor (0–4 colors + optional identifier), reused create + edit ──
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function AppearanceEditor({
  name, colors, setColors, identifier, setIdentifier,
}: {
  name: string;
  colors: string[];
  setColors: (c: string[]) => void;
  identifier: string;
  setIdentifier: (v: string) => void;
}) {
  const setAt = (i: number, v: string) => setColors(colors.map((c, idx) => (idx === i ? v : c)));
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Appearance</legend>
      <div className="flex items-center gap-3">
        <CompetitorMark name={name || "Competitor"} colors={colors.filter((c) => HEX_RE.test(c))} identifier={identifier} size={40} />
        <span className="text-xs text-muted-foreground">Preview</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Colors</Label>
        {colors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="color" aria-label={`Color ${i + 1}`} value={HEX_RE.test(c) ? c : "#000000"} onChange={(e) => setAt(i, e.target.value)} className="h-9 w-12 rounded-md border border-input bg-card" />
            <Input value={c} onChange={(e) => setAt(i, e.target.value)} className="w-32" placeholder="#RRGGBB" aria-label={`Color ${i + 1} hex`} />
            <button type="button" onClick={() => setColors(colors.filter((_, idx) => idx !== i))} className="text-xs text-muted-foreground hover:text-negative">Remove</button>
          </div>
        ))}
        {colors.length < 4 ? (
          <button type="button" onClick={() => setColors([...colors, "#0c44ac"])} className="self-start text-sm text-primary hover:underline">+ Add color</button>
        ) : null}
      </div>
      <Field label="Number or identifier (optional)">
        <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} maxLength={6} placeholder="8" className="w-24" />
      </Field>
      <p className="text-xs text-muted-foreground">Optional. Use this for numbered or labeled competitors.</p>
    </fieldset>
  );
}

// ── Add competitor ───────────────────────────────────────────────────────────
export function CompetitorForm({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [colors, setColors] = useState<string[]>(["#0c44ac"]); // start with one row
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const clean = colors.map((c) => c.trim()).filter((c) => c.length > 0);
          const res = await addCompetitorAction({ creatorId, name, colors: clean, identifier: identifier.trim() || undefined });
          if (!res.ok) return setError(res.error);
          setName(""); setColors(["#0c44ac"]); setIdentifier("");
          router.refresh();
        });
      }}
    >
      <Field label="Competitor name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <AppearanceEditor name={name} colors={colors} setColors={setColors} identifier={identifier} setIdentifier={setIdentifier} />
      <Err msg={error} />
      <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add competitor"}</Button>
    </form>
  );
}

// ── Edit competitor appearance ───────────────────────────────────────────────
export function CompetitorEditForm({ competitor }: { competitor: { id: string; name: string; colors: string[]; identifier: string | null } }) {
  const router = useRouter();
  const [name, setName] = useState(competitor.name);
  const [colors, setColors] = useState<string[]>(competitor.colors.length ? competitor.colors : []);
  const [identifier, setIdentifier] = useState(competitor.identifier ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null); setSaved(false);
        start(async () => {
          const clean = colors.map((c) => c.trim()).filter((c) => c.length > 0);
          const res = await updateCompetitorAction({ competitorId: competitor.id, name, colors: clean, identifier: identifier.trim() || null });
          if (!res.ok) return setError(res.error);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <Field label="Competitor name"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={80} /></Field>
      <AppearanceEditor name={name} colors={colors} setColors={setColors} identifier={identifier} setIdentifier={setIdentifier} />
      <Err msg={error} />
      {saved ? <p className="text-sm text-positive">Saved.</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save appearance"}</Button>
    </form>
  );
}

// ── Create season/tournament competition ─────────────────────────────────────
export function CompetitionForm({ creatorId, tenantSlug, type }: { creatorId: string; tenantSlug: string; type: "SEASON" | "TOURNAMENT" }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await createCompetitionAction({ creatorId, type, title, description });
          if (!res.ok) return setError(res.error);
          router.push(`/t/${tenantSlug}/creator/c/${res.competitionId}`);
        });
      }}
    >
      <Field label={`${type === "SEASON" ? "Season" : "Tournament"} title`}><Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} /></Field>
      <Field label="Description (optional)"><Input value={description} onChange={(e) => setDesc(e.target.value)} /></Field>
      <Err msg={error} />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
    </form>
  );
}

// ── Create standalone / competition event with a market ──────────────────────
export function EventForm({
  creatorId,
  tenantSlug,
  competitionId,
  competitors,
}: {
  creatorId: string;
  tenantSlug: string;
  competitionId?: string;
  competitors: Competitor[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [locksAt, setLocksAt] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<EventMediaType>("livestream");
  const [mediaLabel, setMediaLabel] = useState("");
  const [mediaPrimary, setMediaPrimary] = useState(true);
  const [question, setQuestion] = useState("Which competitor will win?");

  // Live provider hint: valid URL → detected provider; non-empty invalid → error copy.
  const trimmedMedia = mediaUrl.trim();
  const mediaCheck = trimmedMedia ? validateMediaUrl(trimmedMedia) : null;
  const detectedProvider = mediaCheck?.ok ? providerLabel(detectProvider(mediaCheck.url)) : null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (selected.size < 2) return setError("Select at least 2 competitors.");
        if (trimmedMedia && mediaCheck && !mediaCheck.ok) return setError(mediaCheck.error);
        start(async () => {
          const res = await createEventAction({
            creatorId,
            competitionId: competitionId ?? null,
            title,
            description,
            locksAt: locksAt ? new Date(locksAt).toISOString() : undefined,
            media: trimmedMedia
              ? [{ url: trimmedMedia, mediaType, label: mediaLabel.trim() || undefined, isPrimary: mediaPrimary }]
              : undefined,
            competitorIds: [...selected],
            marketQuestion: question,
            publish: true,
          });
          if (!res.ok) return setError(res.error);
          router.push(`/t/${tenantSlug}/e/${res.slug}`);
        });
      }}
    >
      <Field label="Event title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} /></Field>
      <Field label="Description (optional)"><Input value={description} onChange={(e) => setDesc(e.target.value)} /></Field>
      <Field label="Locks at (optional)"><Input type="datetime-local" value={locksAt} onChange={(e) => setLocksAt(e.target.value)} /></Field>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Live stream or video</legend>
        <p className="text-xs text-muted-foreground">
          Add a livestream, video, or event link so participants can watch along. This is optional but recommended.
        </p>
        <Field label="Media URL (optional)">
          <Input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://… (YouTube, TikTok, Twitch, or any link)"
            inputMode="url"
          />
        </Field>
        {trimmedMedia && mediaCheck && !mediaCheck.ok ? (
          <p className="text-xs text-destructive">{mediaCheck.error}</p>
        ) : detectedProvider ? (
          <p className="text-xs text-muted-foreground">Detected: {detectedProvider}</p>
        ) : null}
        {trimmedMedia ? (
          <>
            <Field label="Media type">
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as EventMediaType)}
              >
                {EVENT_MEDIA_TYPE.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Display label (optional)">
              <Input value={mediaLabel} onChange={(e) => setMediaLabel(e.target.value)} placeholder="Watch live on YouTube" maxLength={120} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mediaPrimary} onChange={(e) => setMediaPrimary(e.target.checked)} />
              Primary media
            </label>
          </>
        ) : null}
      </fieldset>

      <Field label="Market question"><Input value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
      <div className="flex flex-col gap-1.5">
        <Label>Competitors ({selected.size} selected)</Label>
        <CompetitorPicker competitors={competitors} selected={selected} toggle={toggle} />
      </div>
      <Err msg={error} />
      <Button type="submit" disabled={pending || competitors.length < 2}>{pending ? "Publishing…" : "Publish event"}</Button>
    </form>
  );
}

// ── Create bracket (2–32 competitors) ────────────────────────────────────────
export function BracketForm({ creatorId, tenantSlug, competitors }: { creatorId: string; tenantSlug: string; competitors: Competitor[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX_BRACKET_COMPETITORS) n.add(id);
      return n;
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (selected.size < MIN_BRACKET_COMPETITORS) return setError(`Select at least ${MIN_BRACKET_COMPETITORS} competitors.`);
        start(async () => {
          const res = await createBracketCompetitionAction({ creatorId, title, description, competitorIds: [...selected] });
          if (!res.ok) return setError(res.error);
          router.push(`/t/${tenantSlug}/c/${res.slug}`);
        });
      }}
    >
      <Field label="Knockout title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} /></Field>
      <Field label="Description (optional)"><Input value={description} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="flex flex-col gap-1.5">
        <Label>Competitors — pick {MIN_BRACKET_COMPETITORS}–{MAX_BRACKET_COMPETITORS} ({selected.size} selected)</Label>
        <p className="text-xs text-muted-foreground">Byes are added automatically when the count isn&apos;t a power of two.</p>
        <CompetitorPicker competitors={competitors} selected={selected} toggle={toggle} />
      </div>
      <Err msg={error} />
      <Button type="submit" disabled={pending || competitors.length < MIN_BRACKET_COMPETITORS}>{pending ? "Building…" : "Create knockout"}</Button>
    </form>
  );
}

// ── Submit result ────────────────────────────────────────────────────────────
type ResultOption = { id: string; label: string; competitorId: string | null; color: string | null; colors?: string[]; identifier?: string | null; imageUrl?: string | null };

export function ResultForm({ eventId, options }: { eventId: string; options: ResultOption[] }) {
  const router = useRouter();
  const [optionId, setOptionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!optionId) return setError("Select the result.");
        // The selected OPTION is authoritative; a competitor is passed only when the
        // option represents one (so Draw / Yes / No settle without a competitor).
        const selected = options.find((o) => o.id === optionId);
        start(async () => {
          const res = await submitResultAction({ eventId, winningOptionIds: [optionId], winningCompetitorId: selected?.competitorId ?? undefined, notes });
          if (!res.ok) return setError(res.error);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label>Result</Label>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setOptionId(o.id)}
                aria-pressed={optionId === o.id}
                className={cn("flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm", optionId === o.id ? "border-positive bg-muted" : "border-border hover:bg-muted")}
              >
                <CompetitorMark name={o.label} colors={o.colors} color={o.color} identifier={o.identifier} imageUrl={o.imageUrl} size={20} />
                <span className="min-w-0 truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Field label="Result notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Err msg={error} />
      <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Confirm result"}</Button>
    </form>
  );
}

// ── Correct result (regrade) ─────────────────────────────────────────────────
// Same option picker as ResultForm, but corrects an already-settled event. The
// previous result stays in history; a new grading version is created and
// projections re-run. A correction note is encouraged.
export function CorrectResultForm({ eventId, options, currentLabel }: { eventId: string; options: ResultOption[]; currentLabel: string | null }) {
  const router = useRouter();
  const [optionId, setOptionId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!optionId) return setError("Select the corrected result.");
        const selected = options.find((o) => o.id === optionId);
        start(async () => {
          const res = await correctResultAction({ eventId, winningOptionIds: [optionId], winningCompetitorId: selected?.competitorId ?? undefined, reason });
          if (!res.ok) return setError(res.error);
          router.refresh();
        });
      }}
    >
      {currentLabel ? <p className="text-sm text-muted-foreground">Current result: <span className="font-medium text-foreground">{currentLabel}</span></p> : null}
      <div className="flex flex-col gap-1.5">
        <Label>Corrected result</Label>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setOptionId(o.id)}
                aria-pressed={optionId === o.id}
                className={cn("flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm", optionId === o.id ? "border-positive bg-muted" : "border-border hover:bg-muted")}
              >
                <CompetitorMark name={o.label} colors={o.colors} color={o.color} identifier={o.identifier} imageUrl={o.imageUrl} size={20} />
                <span className="min-w-0 truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Field label="Correction note (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the result changing?" /></Field>
      <Err msg={error} />
      <Button type="submit" disabled={pending}>{pending ? "Correcting…" : "Confirm correction"}</Button>
    </form>
  );
}
