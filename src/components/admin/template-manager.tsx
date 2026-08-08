"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  createDraftVersionAction,
  saveDraftConfigAction,
  publishVersionAction,
  retireTemplateAction,
  type ActionResult,
} from "@/lib/ops/template-actions";
import type { TemplateDetail, TemplateVersionRow } from "@/lib/ops/templates-admin";

function DraftEditor({ templateId, version }: { templateId: string; version: TemplateVersionRow }) {
  const [open, setOpen] = useState(false);
  const [engineVersion, setEngineVersion] = useState(version.engineVersion);
  const [configJson, setConfigJson] = useState(JSON.stringify(version.configuration, null, 2));
  const [seedJson, setSeedJson] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>) => start(async () => { try { setResult(await fn()); } catch { setResult({ ok: false, message: "Action failed." }); } });

  return (
    <div className="mt-2">
      <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Edit"} configuration (advanced)</Button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-2 text-sm">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Engine version
            <input value={engineVersion} onChange={(e) => setEngineVersion(e.target.value)} className="rounded border border-border bg-card px-2 py-1" />
          </label>
          <label className="text-xs text-muted-foreground">Configuration (JSON)</label>
          <textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} rows={12} className="w-full rounded border border-border bg-card p-2 font-mono text-xs" spellCheck={false} />
          <label className="text-xs text-muted-foreground">Demo seed (JSON, optional)</label>
          <textarea value={seedJson} onChange={(e) => setSeedJson(e.target.value)} rows={4} className="w-full rounded border border-border bg-card p-2 font-mono text-xs" placeholder="{ }" spellCheck={false} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => saveDraftConfigAction({ templateId, versionId: version.id, engineVersion, configurationJson: configJson, seedJson }))}>Save draft</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => publishVersionAction(templateId, version.id))}>Validate &amp; publish</Button>
          </div>
          {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " text-xs"}>{result.message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function TemplateManager({ detail }: { detail: TemplateDetail }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>) => start(async () => { try { setResult(await fn()); } catch { setResult({ ok: false, message: "Action failed." }); } });
  const published = detail.versions.find((v) => v.published);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => createDraftVersionAction(detail.id))}>New draft version</Button>
        {detail.latestVersion > 0 ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => createDraftVersionAction(detail.id, detail.latestVersion))}>New draft (copy v{detail.latestVersion})</Button>
        ) : null}
        {published ? (
          <Link href={`/admin/templates/${detail.id}/new-tenant`} className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">Create tenant</Link>
        ) : null}
        {detail.status !== "retired" ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => retireTemplateAction(detail.id))}>Retire</Button>
        ) : null}
      </div>
      {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " text-sm"}>{result.message}</p> : null}

      <div className="flex flex-col gap-2">
        {detail.versions.map((v) => (
          <div key={v.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">v{v.version} <span className="text-xs text-muted-foreground">· engine {v.engineVersion}{v.hasSeed ? " · demo seed" : ""}</span></span>
              <span className={"text-xs font-medium " + (v.published ? "text-positive" : "text-streak")}>{v.published ? "Published (immutable)" : "Draft"}</span>
            </div>
            {v.changelog ? <p className="mt-1 text-xs text-muted-foreground">{v.changelog}</p> : null}
            {!v.published ? <DraftEditor templateId={detail.id} version={v} /> : null}
          </div>
        ))}
        {detail.versions.length === 0 ? <p className="text-sm text-muted-foreground">No versions yet — create a draft to begin.</p> : null}
      </div>
    </div>
  );
}
