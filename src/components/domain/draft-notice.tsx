import { DRAFT_OPTIONAL_NOTICE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The product rule kept visible on every draft surface: drafting is optional and
 * never gates free predictions. Uses the exact approved copy.
 */
export function DraftOptionalNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        "rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      {DRAFT_OPTIONAL_NOTICE}
    </p>
  );
}
