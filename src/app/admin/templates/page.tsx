import { requireSuperAdmin } from "@/lib/ops/admin";
import { listTemplates } from "@/lib/ops/templates-admin";
import { TemplateLibrary } from "@/components/admin/template-library";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireSuperAdmin();
  const templates = await listTemplates();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tenant templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reusable configuration blueprints. Create a new tenant from a published template — like starting a project from a template.</p>
      </header>
      <TemplateLibrary templates={templates} />
    </div>
  );
}
