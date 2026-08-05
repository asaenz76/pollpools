import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BracketMatchView } from "@/features/competitions/get-competition";

type Props = {
  tenantSlug: string;
  rounds: { number: number; name: string }[];
  matches: BracketMatchView[];
};

function Side({ name, isWinner, isBye }: { name: string | null; isWinner: boolean; isBye: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 text-sm",
        isWinner ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{name ?? (isBye ? "—" : "TBD")}</span>
      {isWinner ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
    </div>
  );
}

/** Read-only single-elimination bracket. Scrolls horizontally on small screens. */
export function BracketView({ tenantSlug, rounds, matches }: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4 pb-2">
        {rounds.map((round) => {
          const roundMatches = matches
            .filter((m) => m.roundNumber === round.number)
            .sort((a, b) => a.position - b.position);
          return (
            <div key={round.number} className="flex w-56 shrink-0 flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {round.name}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {roundMatches.map((m) => {
                  const card = (
                    <div
                      className={cn(
                        "divide-y divide-border overflow-hidden rounded-md border bg-card",
                        m.eventSlug ? "border-border hover:border-primary" : "border-border",
                      )}
                    >
                      <Side name={m.competitorA} isWinner={m.winner != null && m.winner === m.competitorA} isBye={m.isBye} />
                      <Side name={m.competitorB} isWinner={m.winner != null && m.winner === m.competitorB} isBye={m.isBye} />
                    </div>
                  );
                  return (
                    <div key={m.matchIndex}>
                      {m.eventSlug ? (
                        <Link href={`/t/${tenantSlug}/e/${m.eventSlug}`} className="block">
                          {card}
                        </Link>
                      ) : (
                        card
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
