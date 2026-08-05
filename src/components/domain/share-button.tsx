"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copy-link share (behind sharing_enabled; the parent decides to render it). */
export function ShareButton({ title }: { title?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title: title ?? document.title, url });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={share} aria-label="Share">
      {copied ? <Check /> : <Share2 />}
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
