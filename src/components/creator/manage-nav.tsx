import Link from "next/link";

/**
 * Tenant management information architecture (spec §6). A deliberate, grouped nav —
 * not a dump of every route. Every destination is a page that already exists and is
 * server-authorized. Sections only appear when backed by real functionality.
 */
type Item = { label: string; href: string };
type Section = { title: string; items: Item[] };

export function TenantManageNav({ slug, current }: { slug: string; current?: string }) {
  const base = `/t/${slug}/creator`;
  const sections: Section[] = [
    { title: "Overview", items: [{ label: "Dashboard", href: base }] },
    { title: "Content", items: [{ label: "Create", href: `${base}/new` }, { label: "Competitors", href: `${base}/competitors` }] },
    { title: "Community", items: [{ label: "Analytics", href: `${base}/analytics` }, { label: "Growth", href: `${base}/growth` }] },
    { title: "Monetization", items: [{ label: "Revenue", href: `${base}/revenue` }] },
    { title: "Settings", items: [{ label: "Community", href: `${base}/settings` }, { label: "Profile", href: `${base}/profile` }] },
  ];
  return (
    <nav aria-label="Manage" className="flex flex-col gap-3">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</p>
          <ul className="flex flex-wrap gap-1.5">
            {s.items.map((it) => {
              const active = current === it.href;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "inline-flex h-8 items-center rounded-md border px-3 text-sm " +
                      (active ? "border-primary bg-primary-subtle text-foreground" : "border-border bg-card text-foreground hover:bg-muted")
                    }
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
