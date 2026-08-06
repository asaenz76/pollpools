import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantOps, getModerationComments } from "@/lib/ops/admin";
import { CommentModeration } from "@/components/admin/comment-moderation";

export const dynamic = "force-dynamic";

export default async function ModerationPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ops = await getTenantOps(tenantId);
  if (!ops) notFound();
  const comments = await getModerationComments(tenantId);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/tenants/${tenantId}`} className="text-sm text-muted-foreground hover:underline">← {ops.displayName} ops</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comments in {ops.displayName}. Hidden and deleted comments are already removed from public view; nothing is
          hard-deleted, so history is preserved.
        </p>
      </header>
      <CommentModeration tenantId={tenantId} comments={comments} />
    </div>
  );
}
