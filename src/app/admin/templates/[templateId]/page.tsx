import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/ops/admin";
import { getTemplateDetail } from "@/lib/ops/templates-admin";
import { TemplateManager } from "@/components/admin/template-manager";
import { TemplatePreview } from "@/components/admin/template-preview";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireSuperAdmin();
  const { templateId } = await params;
  const detail = await getTemplateDetail(templateId);
  if (!detail) notFound();
  const published = detail.versions.find((v) => v.published);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/templates" className="text-sm text-muted-foreground hover:underline">← Templates</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{detail.category} · {detail.status} · latest v{detail.latestVersion}</p>
        {detail.description ? <p className="mt-2 text-sm">{detail.description}</p> : null}
      </header>

      {published ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Published configuration (v{published.version})</h2>
          <TemplatePreview config={published.configuration} engineVersion={published.engineVersion} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Versions</h2>
        <TemplateManager detail={detail} />
      </section>
    </div>
  );
}
