import { cn } from "@/lib/utils";
import type { EventStatus } from "@/types/enums";

/**
 * Semantic event-status badge. Always shows a TEXT label (never color alone) so
 * status is legible without relying on color perception (spec §15).
 */
const STATUS_META: Record<string, { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "info" }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  published: { label: "Published", tone: "info" },
  open: { label: "Open", tone: "positive" },
  locked: { label: "Locked", tone: "warning" },
  live: { label: "Live", tone: "info" },
  waiting_result: { label: "Awaiting result", tone: "warning" },
  settlement_pending: { label: "Settling", tone: "warning" },
  settled: { label: "Settled", tone: "info" },
  canceled: { label: "Canceled", tone: "negative" },
  voided: { label: "Voided", tone: "negative" },
};

const TONE_CLASS: Record<string, string> = {
  positive: "bg-positive/12 text-positive",
  warning: "bg-warning/12 text-warning",
  negative: "bg-negative/12 text-negative",
  info: "bg-primary/12 text-primary",
  neutral: "bg-muted text-muted-foreground",
};

export function EventStatusBadge({ status, className }: { status: EventStatus | string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: String(status), tone: "neutral" as const };
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[meta.tone], className)}
    >
      {meta.label}
    </span>
  );
}

/** Human label for a status (for use outside the pill, e.g. inline text). */
export function eventStatusLabel(status: EventStatus | string): string {
  return STATUS_META[status]?.label ?? String(status);
}
