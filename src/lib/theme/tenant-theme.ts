import { darken, lighten, tint, isHex } from "./colors";

/**
 * Tenant brand resolution. Brand colors come from the tenant's `theme` JSONB
 * (brandPrimary / brandSecondary / brandAccent / brandDeep, plus optional logo
 * assets). Neutral surfaces and semantic states are platform-wide (globals.css)
 * and are NOT tenant-controlled. The engine stays tenant-neutral — no slug or
 * tenant name appears here.
 */
export type TenantBrand = {
  primary: string; // interaction (Royal Blue for Marble Grand Prix)
  red: string; // brand-red
  crimson: string; // brand-crimson
  navy: string; // brand-navy
  logoLight: string | null;
  logoDark: string | null;
};

// Platform defaults = the Marble Grand Prix racing palette. Any tenant overrides
// these via its `theme` JSONB; a tenant with no theme simply inherits them.
const DEFAULT_BRAND: TenantBrand = {
  primary: "#0c44ac",
  red: "#ed0101",
  crimson: "#970005",
  navy: "#000052",
  logoLight: null,
  logoDark: null,
};

function hexOr(theme: Record<string, unknown>, key: string, fallback: string): string {
  const v = theme[key];
  return typeof v === "string" && isHex(v) ? v.toLowerCase() : fallback;
}
function strOrNull(theme: Record<string, unknown>, key: string): string | null {
  const v = theme[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function resolveTenantBrand(theme: Record<string, unknown>): TenantBrand {
  return {
    primary: hexOr(theme, "brandPrimary", DEFAULT_BRAND.primary),
    red: hexOr(theme, "brandSecondary", DEFAULT_BRAND.red),
    crimson: hexOr(theme, "brandAccent", DEFAULT_BRAND.crimson),
    navy: hexOr(theme, "brandDeep", DEFAULT_BRAND.navy),
    logoLight: strOrNull(theme, "logoLight"),
    logoDark: strOrNull(theme, "logoDark"),
  };
}

/**
 * CSS overriding only the BRAND tokens for this tenant, in both modes. Derives
 * accessible hover / subtle-tint / a lighter dark-mode primary from the tenant's
 * own brand primary. Rendered server-side into a <style> tag, so it is present at
 * first paint (no flash) and never leaks tenant hexes into components.
 */
export function tenantBrandCss(brand: TenantBrand): string {
  const p = brand.primary;
  const light = [
    `--primary:${p}`,
    `--ring:${p}`,
    `--primary-hover:${darken(p, 0.14)}`,
    `--primary-subtle:${tint(p, 0.08)}`,
    `--brand-red:${brand.red}`,
    `--brand-crimson:${brand.crimson}`,
    `--brand-navy:${brand.navy}`,
  ].join(";");
  const pDark = lighten(p, 0.35); // lighter, accessible on dark surfaces
  const dark = [
    `--primary:${pDark}`,
    `--ring:${pDark}`,
    `--primary-hover:${lighten(p, 0.5)}`,
    `--primary-subtle:${darken(p, 0.72)}`, // deep brand-blue tint for selected states
    `--brand-red:${brand.red}`,
    `--brand-crimson:${brand.crimson}`,
    `--brand-navy:${brand.navy}`,
  ].join(";");
  return `:root{${light}}.dark{${dark}}`;
}
