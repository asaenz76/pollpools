"use client";

import { useActionState } from "react";
import { platformSignInAction, type AuthFormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthFormState = { error: null };

/**
 * Platform (tenant-independent) sign-in form. Auth is global; there is no tenant
 * slug, so this is the entry point for platform admins. Sign-up / password-reset
 * stay tenant-scoped by design, so this form intentionally omits those links.
 */
export function PlatformSignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(platformSignInAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-negative">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : "Sign in"}
      </Button>
    </form>
  );
}
