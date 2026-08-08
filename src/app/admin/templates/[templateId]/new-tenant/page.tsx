import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/ops/admin";
import { getTemplateDetail, getPublishedVersion } from "@/lib/ops/templates-admin";
import { CreateTenantForm } from "@/components/admin/create-tenant-form";
import { TemplatePreview } from "@/components/admin/template-preview";

export const dynamic = "force-dynamic";

export default async function NewTenantFromTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireSuperAdmin();
  const { templateId } = await params;
  const [detail, version] = await Promise.all([getTemplateDetail(templateId), getPublishedVersion(templateId)]);
  if (!detail) notFound();
  if (!version) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/admin/templates/${templateId}`} className="text-sm text-muted-foreground hover:underline">← {detail.name}</Link>
        <p className="text-sm text-muted-foreground">This template has no published version yet. Publish one first.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/templates/${templateId}`} className="text-sm text-muted-foreground hover:underline">← {detail.name}</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Create tenant from {detail.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Using v{version.version}. The tenant owns its configuration after creation — later template changes never touch it.</p>
      </header>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Inherited configuration</h2>
        <TemplatePreview config={version.configuration} engineVersion={version.engineVersion} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">New tenant</h2>
        <CreateTenantForm templateVersionId={version.id} hasSeed={version.hasSeed} defaultLocale={version.configuration.locale ?? "en"} defaultTimezone={version.configuration.timezone ?? "UTC"} />
      </section>
    </div>
  );
}
