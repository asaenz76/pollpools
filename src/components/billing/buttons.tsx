"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startCheckoutAction, cancelSubscriptionAction, requestPayoutAction } from "@/lib/domain/billing-actions";
import { Button } from "@/components/ui/button";

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

export function CheckoutButton({
  productId,
  tenantSlug,
  creatorId,
  competitionId,
  draftReservationId,
  label,
  variant = "primary",
}: {
  productId: string;
  tenantSlug: string;
  creatorId?: string;
  competitionId?: string;
  draftReservationId?: string;
  label: string;
  variant?: "primary" | "outline";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startCheckoutAction({ productId, tenantSlug, creatorId, competitionId, draftReservationId });
            if (!res.ok) return setError(res.error);
            window.location.href = res.url;
          })
        }
      >
        {pending ? "Starting…" : label}
      </Button>
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </div>
  );
}

export function CancelSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await cancelSubscriptionAction({ subscriptionId });
          if (res.ok) router.refresh();
        })
      }
    >
      {pending ? "Canceling…" : "Cancel at period end"}
    </Button>
  );
}

export function RequestPayoutButton({ creatorId, availableMinorUnits, currencyCode }: { creatorId: string; availableMinorUnits: number; currencyCode: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const disabled = pending || availableMinorUnits <= 0;
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        disabled={disabled}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await requestPayoutAction({ creatorId, amountMinorUnits: availableMinorUnits, currencyCode });
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        {pending ? "Requesting…" : `Request payout of ${money(availableMinorUnits, currencyCode)}`}
      </Button>
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </div>
  );
}
