import { cn } from "@/lib/utils";
import type { ProjectionHealth } from "@/lib/ops/reconciliation";

type State = ProjectionHealth["state"];

// Health states map to SEMANTIC state colors (not brand): healthy=positive,
// delayed/degraded=warning/streak, blocked/critical=negative.
const STYLES: Record<State, string> = {
  healthy: "bg-positive/12 text-positive",
  delayed: "bg-warning/12 text-warning",
  degraded: "bg-streak/12 text-streak",
  blocked: "bg-negative/12 text-negative",
  critical: "bg-negative/15 text-negative",
};

export function HealthBadge({ state, className }: { state: State; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STYLES[state],
        className,
      )}
    >
      {state}
    </span>
  );
}
