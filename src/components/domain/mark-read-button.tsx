"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsReadAction } from "@/lib/domain/social-actions";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || !hasUnread}
      onClick={() => startTransition(async () => {
        await markAllNotificationsReadAction();
        router.refresh();
      })}
    >
      Mark all read
    </Button>
  );
}
