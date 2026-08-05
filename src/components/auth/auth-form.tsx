"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  signInAction,
  signUpAction,
  requestResetAction,
  type AuthFormState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "sign-in" | "sign-up" | "reset";

const initial: AuthFormState = { error: null };

const config = {
  "sign-in": { action: signInAction, cta: "Sign in", needsPassword: true },
  "sign-up": { action: signUpAction, cta: "Create account", needsPassword: true },
  reset: { action: requestResetAction, cta: "Send reset link", needsPassword: false },
} as const;

export function AuthForm({ mode, slug }: { mode: Mode; slug: string }) {
  const { action, cta, needsPassword } = config[mode];
  const [state, formAction, pending] = useActionState(action, initial);
  const resetSent = mode === "reset" && !state.error && state !== initial;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      {needsPassword ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-negative">
          {state.error}
        </p>
      ) : null}
      {resetSent ? (
        <p role="status" className="text-sm text-positive">
          If that email exists, a reset link is on its way.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : cta}
      </Button>

      <div className="text-sm text-muted-foreground">
        {mode === "sign-in" ? (
          <>
            <Link href={`/t/${slug}/sign-up`} className="text-primary hover:underline">
              Create an account
            </Link>
            <span className="px-2">·</span>
            <Link href={`/t/${slug}/reset`} className="text-primary hover:underline">
              Forgot password?
            </Link>
          </>
        ) : (
          <Link href={`/t/${slug}/sign-in`} className="text-primary hover:underline">
            Back to sign in
          </Link>
        )}
      </div>
    </form>
  );
}
