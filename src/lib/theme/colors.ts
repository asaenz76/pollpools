/**
 * Tiny, tenant-neutral color helpers for deriving accessible variations of a
 * tenant's brand primary (hover / subtle-tint / a lighter dark-mode variant).
 * No palette values live here — only pure math on whatever hex a tenant provides.
 */

const HEX = /^#([0-9a-fA-F]{6})$/;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

type Rgb = { r: number; g: number; b: number };

function toRgb(hex: string): Rgb {
  const h = hex.trim().slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Darken toward black by `amount` (0..1). */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = toRgb(hex);
  return toHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
}

/** Lighten toward white by `amount` (0..1). */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = toRgb(hex);
  return toHex({ r: r + (255 - r) * amount, g: g + (255 - g) * amount, b: b + (255 - b) * amount });
}

/** Mix `hex` into white, keeping only `weight` (0..1) of the color — a subtle tint. */
export function tint(hex: string, weight: number): string {
  const { r, g, b } = toRgb(hex);
  return toHex({ r: 255 - (255 - r) * weight, g: 255 - (255 - g) * weight, b: 255 - (255 - b) * weight });
}

/** Relative luminance (WCAG). */
function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
