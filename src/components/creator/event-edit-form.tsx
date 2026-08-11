"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventAction } from "@/lib/domain/creator-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EditOption = { id: string; label: string };

export type EventEditInitial = {
  title: string;
  description: string;
  startsAt: string; // datetime-local value or ""
  locksAt: string; // datetime-local value or ""
  youtubeUrl: string;
  externalUrl: string;
  marketQuestion: string;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Safe event edits are always available (title, description, times, links).
 * Prediction-changing edits (market question, option labels) are only shown when
 * no predictions exist yet; once a prediction is submitted these are hidden and the
 * DB (update_event) rejects them too — the meaning of a submitted prediction is
 * never silently changed (spec §3–§4). Timing fields are only editable before lock.
 */
export function EventEditForm({
  eventId,
  tenantSlug,
  initial,
  options,
  hasPredictions,
  timingEditable,
}: {
  eventId: string;
  tenantSlug: string;
  initial: EventEditInitial;
  options: EditOption[];
  hasPredictions: boolean;
  timingEditable: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [locksAt, setLocksAt] = useState(initial.locksAt);
  const [youtubeUrl, setYoutubeUrl] = useState(initial.youtubeUrl);
  const [externalUrl, setExternalUrl] = useState(initial.externalUrl);
  const [marketQuestion, setMarketQuestion] = useState(initial.marketQuestion);
  const [optLabels, setOptLabels] = useState<EditOption[]>(options);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const toLocalIso = (v: string) => (v ? new Date(v).toISOString() : null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        start(async () => {
          const patch: Parameters<typeof updateEventAction>[0] = {
            eventId,
            title: title.trim(),
            description: description.trim() || null,
            youtubeUrl: youtubeUrl.trim() || null,
            externalUrl: externalUrl.trim() || null,
          };
          if (timingEditable) {
            patch.startsAt = toLocalIso(startsAt);
            patch.locksAt = toLocalIso(locksAt);
          }
          if (!hasPredictions) {
            if (marketQuestion.trim()) patch.marketQuestion = marketQuestion.trim();
            patch.options = optLabels.map((o) => ({ id: o.id, label: o.label.trim() }));
          }
          const res = await updateEventAction(patch);
          if (!res.ok) return setError(res.error);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <Field label="Event title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} /></Field>
      <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>

      {timingEditable ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts at"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Field label="Locks at"><Input type="datetime-local" value={locksAt} onChange={(e) => setLocksAt(e.target.value)} /></Field>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Start and lock times are frozen once the event locks.</p>
      )}

      <Field label="Livestream / video URL" hint="Shown so participants can watch along."><Input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} inputMode="url" maxLength={500} /></Field>
      <Field label="External link (optional)"><Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} inputMode="url" maxLength={500} /></Field>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Market &amp; options</legend>
        {hasPredictions ? (
          <p className="text-xs text-muted-foreground">
            Predictions have been submitted, so the question and options are locked to protect their meaning. To change them, cancel this event and create a new one.
          </p>
        ) : (
          <>
            <Field label="Market question"><Input value={marketQuestion} onChange={(e) => setMarketQuestion(e.target.value)} maxLength={300} /></Field>
            {optLabels.map((o, i) => (
              <Field key={o.id} label={`Option ${i + 1}`}>
                <Input
                  value={o.label}
                  onChange={(e) => setOptLabels((prev) => prev.map((p) => (p.id === o.id ? { ...p, label: e.target.value } : p)))}
                  maxLength={120}
                />
              </Field>
            ))}
          </>
        )}
      </fieldset>

      {error ? <p className="text-sm text-negative">{error}</p> : null}
      {saved ? <p className="text-sm text-positive">Saved.</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.push(`/t/${tenantSlug}/creator/e/${eventId}`)}>Back</Button>
      </div>
    </form>
  );
}
