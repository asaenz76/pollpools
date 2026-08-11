import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for the platform legal/support pages. Content is structurally
 * complete and honest about the product (a social prediction / community
 * competition platform — not a money-gaming service) but is clearly marked as
 * pending final legal review; it must not be treated as finished legal copy.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Poll Pools</Link>
      <div className="mt-3 rounded-md border border-streak/40 bg-streak/10 px-3 py-2 text-xs text-muted-foreground">
        Draft — pending final legal review. This describes how Poll Pools intends to operate; the definitive terms will be published before launch.
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: {updated}</p>
      <div className="prose-legal mt-6 flex flex-col gap-6 text-sm leading-relaxed text-foreground">{children}</div>
      <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/support" className="hover:underline">Support</Link>
      </footer>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{heading}</h2>
      {children}
    </section>
  );
}
