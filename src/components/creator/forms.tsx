"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  becomeCreatorAction,
  updateCreatorProfileAction,
  addCompetitorAction,
  createCompetitionAction,
  createBracketCompetitionAction,
  createEventAction,
  submitResultAction,
} from "@/lib/domain/creator-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_BRACKET_COMPETITORS, MAX_BRACKET_COMPETITORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Competitor = { id: string; name: string; color: string | null };

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
              <span aria-hidden className="size-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: c.color ?? "transparent" }} />
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

// ── Add competitor ───────────────────────────────────────────────────────────
export function CompetitorForm({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await addCompetitorAction({ creatorId, name, color });
          if (!res.ok) return setError(res.error);
          setName("");
          router.refresh();
        });
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label>Competitor name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-14 rounded-md border border-input bg-card" />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
      <div className="w-full"><Err msg={error} /></div>
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
  const [youtubeUrl, setYoutube] = useState("");
  const [question, setQuestion] = useState("Which competitor will win?");
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
        start(async () => {
          const res = await createEventAction({
            creatorId,
            competitionId: competitionId ?? null,
            title,
            description,
            locksAt: locksAt ? new Date(locksAt).toISOString() : undefined,
            youtubeUrl,
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
      <Field label="Live YouTube URL"><Input value={youtubeUrl} onChange={(e) => setYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required /></Field>
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
export function ResultForm({ eventId, competitors }: { eventId: string; competitors: Competitor[] }) {
  const router = useRouter();
  const [winner, setWinner] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!winner) return setError("Choose the winning competitor.");
        start(async () => {
          const res = await submitResultAction({ eventId, winningCompetitorId: winner, notes });
          if (!res.ok) return setError(res.error);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label>Winner</Label>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {competitors.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setWinner(c.id)}
                aria-pressed={winner === c.id}
                className={cn("flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm", winner === c.id ? "border-positive bg-muted" : "border-border hover:bg-muted")}
              >
                <span aria-hidden className="size-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: c.color ?? "transparent" }} />
                <span className="min-w-0 truncate">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Field label="Result notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Err msg={error} />
      <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit result"}</Button>
    </form>
  );
}
