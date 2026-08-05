"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toggleLikeAction } from "@/lib/domain/social-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LikeButton({
  tenantId,
  subjectType,
  subjectId,
  initialLiked,
  initialCount,
  signedIn,
  signInHref,
}: {
  tenantId: string;
  subjectType: "event" | "feed_activity" | "comment";
  subjectId: string;
  initialLiked: boolean;
  initialCount: number;
  signedIn: boolean;
  signInHref: string;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!signedIn) {
      router.push(signInHref);
      return;
    }
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    startTransition(async () => {
      const res = await toggleLikeAction({ tenantId, subjectType, subjectId });
      if (!res.ok) {
        setLiked(!next);
        setCount((c) => c + (next ? -1 : 1));
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={pending} aria-pressed={liked} aria-label="Like">
      <Heart className={cn(liked && "fill-negative text-negative")} />
      {count > 0 ? count : "Like"}
    </Button>
  );
}
