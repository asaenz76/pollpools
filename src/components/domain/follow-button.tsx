"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followCreatorAction, unfollowCreatorAction } from "@/lib/domain/social-actions";
import { Button } from "@/components/ui/button";

export function FollowButton({
  creatorId,
  initialFollowing,
  signedIn,
  signInHref,
}: {
  creatorId: string;
  initialFollowing: boolean;
  signedIn: boolean;
  signInHref: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Button variant="outline" size="sm" onClick={() => router.push(signInHref)}>
        Follow
      </Button>
    );
  }

  function toggle() {
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const res = next ? await followCreatorAction(creatorId) : await unfollowCreatorAction(creatorId);
      if (!res.ok) setFollowing(!next);
      else router.refresh();
    });
  }

  return (
    <Button variant={following ? "outline" : "primary"} size="sm" disabled={pending} onClick={toggle}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}
