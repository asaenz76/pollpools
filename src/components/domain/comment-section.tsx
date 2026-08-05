"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addCommentAction } from "@/lib/domain/social-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CommentView = { id: string; author: string; body: string; createdAt: string };

export function CommentSection({
  tenantId,
  subjectType,
  subjectId,
  comments,
  signedIn,
  signInHref,
}: {
  tenantId: string;
  subjectType: "event" | "feed_activity";
  subjectId: string;
  comments: CommentView[];
  signedIn: boolean;
  signInHref: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addCommentAction({ tenantId, subjectType, subjectId, body });
      if (!res.ok) return setError(res.error);
      setBody("");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="comments-heading" className="grid gap-3">
      <h3 id="comments-heading" className="text-sm font-medium text-muted-foreground">
        Comments
      </h3>

      {signedIn ? (
        <div className="grid gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Add a comment…"
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error ? <p className="text-sm text-negative">{error}</p> : null}
          <div>
            <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
              {pending ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      ) : (
        <Link href={signInHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}>
          Sign in to comment
        </Link>
      )}

      <ul className="grid gap-2">
        {comments.length === 0 ? (
          <li className="text-sm text-muted-foreground">No comments yet.</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border px-3 py-2">
              <p className="text-sm font-medium">{c.author}</p>
              <p className="text-sm text-foreground">{c.body}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
