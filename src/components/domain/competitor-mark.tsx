import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The ONE generic renderer for a competitor's visual identity (CV.3). Reused
 * everywhere a competitor appears — creator forms, prediction options, Draft,
 * leaderboards, event/competition pages — so identity is consistent and never
 * reimplemented per surface.
 *
 * Identity model (all optional, any combination valid):
 *   • image  — primary visual when present
 *   • colors — 0–4 identifying colors, shown as DISTINCT segments (never blended)
 *   • identifier — a short number/label ("8", "12", "A", "07") overlaid legibly
 *
 * Color is never the sole identifier: callers always render the competitor's name
 * alongside this mark, and the identifier (when set) is shown here.
 */
export type CompetitorMarkProps = {
  name: string;
  colors?: readonly string[] | null;
  /** Legacy single color — used when `colors` is empty (backwards compatibility). */
  color?: string | null;
  identifier?: string | null;
  imageUrl?: string | null;
  /** Diameter in px. */
  size?: number;
  className?: string;
};

/** Choose a readable foreground for text placed directly on a solid color. */
function readableOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#000000";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

/** Hard-stop conic segments so each color stays distinct (no blending gradient). */
function segmentBackground(colors: readonly string[]): CSSProperties {
  if (colors.length === 1) return { background: colors[0] };
  const n = colors.length;
  const stops = colors.map((c, i) => `${c} ${((i / n) * 100).toFixed(3)}% ${(((i + 1) / n) * 100).toFixed(3)}%`).join(", ");
  return { background: `conic-gradient(from 0deg, ${stops})` };
}

function accessibleLabel(name: string, colors: readonly string[], identifier?: string | null): string {
  const parts = [name];
  if (identifier) parts.push(`number ${identifier}`);
  if (colors.length === 1) parts.push("one color");
  else if (colors.length > 1) parts.push(`${colors.length} colors`);
  return parts.join(", ");
}

export function CompetitorMark({ name, colors, color, identifier, imageUrl, size = 24, className }: CompetitorMarkProps) {
  // Effective palette: multi-color when set, else the legacy single color.
  const source = colors && colors.length ? colors : color ? [color] : [];
  const palette = source.filter((c) => typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c));
  const id = identifier?.trim() || null;
  const hasImage = Boolean(imageUrl);
  const multi = palette.length >= 2;

  const baseStyle: CSSProperties = { width: size, height: size };
  const fillStyle: CSSProperties = hasImage || palette.length === 0 ? {} : segmentBackground(palette);

  return (
    <span
      role="img"
      aria-label={accessibleLabel(name, palette, id)}
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-border", palette.length === 0 && !hasImage ? "bg-muted" : "", className)}
      style={{ ...baseStyle, ...fillStyle }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {id ? (
        multi || hasImage ? (
          // Multicolor / image → contrast is ambiguous, so back the identifier with a
          // small neutral (theme-aware) disc that stays legible on any background.
          <span
            className="relative grid place-items-center rounded-full border border-border bg-background/85 font-semibold text-foreground"
            style={{ width: size * 0.72, height: size * 0.72, fontSize: Math.max(9, size * 0.4) }}
          >
            {id}
          </span>
        ) : (
          <span className="relative font-semibold leading-none" style={{ color: palette.length === 1 ? readableOn(palette[0]!) : "var(--foreground, #000)", fontSize: Math.max(9, size * 0.5) }}>
            {id}
          </span>
        )
      ) : null}
    </span>
  );
}
