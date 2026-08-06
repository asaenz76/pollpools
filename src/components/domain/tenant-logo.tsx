import Link from "next/link";

/**
 * Tenant wordmark / logo. A tenant brand asset — shared components never hard-code
 * a specific tenant's logo; it is resolved from tenant theme config.
 *
 * When monochrome logo assets are configured (logoLight = black mark for light
 * mode, logoDark = white mark for dark mode) they swap purely via CSS, so there is
 * no theme-change flash and the black mark never lands on a dark surface (or vice
 * versa). With no assets configured it falls back to the display-name wordmark,
 * which already adapts (foreground is black in light mode, white in dark mode).
 */
export function TenantLogo({
  href,
  displayName,
  logoLight,
  logoDark,
}: {
  href: string;
  displayName: string;
  logoLight: string | null;
  logoDark: string | null;
}) {
  return (
    <Link href={href} className="flex items-center font-semibold tracking-tight text-foreground">
      {logoLight && logoDark ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoLight} alt={displayName} className="block h-6 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDark} alt={displayName} className="hidden h-6 w-auto dark:block" />
        </>
      ) : (
        displayName
      )}
    </Link>
  );
}
