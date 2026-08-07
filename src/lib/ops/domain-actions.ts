"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import {
  classifyDomainType,
  verificationRecordName,
  verificationTxtValue,
  txtRecordsContainToken,
} from "@/lib/domain/domains";
import { lookupTxt } from "@/lib/domain/dns-verify";

/**
 * Custom-domain operations (Phase 8B.8), super-admin only. Ownership is never
 * trusted: adding a domain only stores a pending row + a DNS-TXT token; the domain
 * resolves to the tenant only after `verify` confirms the token via real DNS. SSL
 * provisioning is a hosting-platform concern — we record ssl_status and leave the
 * actual certificate to the platform (documented infra boundary).
 */
export type DomainActionResult = { ok: boolean; message: string };

async function assertSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) throw new Error("NOT_AUTHORIZED");
}

/** Normalize a user-entered hostname to a bare lowercase host (no scheme/path/port). */
function normalizeHostname(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  value = value.replace(/\/.*$/, "").replace(/:\d+$/, "");
  // Basic hostname shape: labels of a-z0-9- separated by dots, at least one dot.
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value)) return null;
  return value;
}

export async function addTenantDomainAction(tenantId: string, hostnameRaw: string): Promise<DomainActionResult> {
  await assertSuperAdmin();
  const hostname = normalizeHostname(hostnameRaw);
  if (!hostname) return { ok: false, message: "Enter a valid domain, e.g. predict.example.com." };

  const admin = createAdminSupabase();
  const domainType = classifyDomainType(hostname, publicEnv.NEXT_PUBLIC_ROOT_DOMAIN);
  const token = randomBytes(16).toString("hex");
  // First domain for a tenant becomes primary once verified; here we only mark the
  // intent — a domain cannot actually resolve until verification succeeds.
  const { count } = await admin
    .from("tenant_domains")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const isFirst = (count ?? 0) === 0;

  const { error } = await admin.from("tenant_domains").insert({
    tenant_id: tenantId,
    domain: hostname,
    domain_type: domainType,
    verification_status: "pending",
    verification_token: token,
    ssl_status: "pending",
    is_primary: false,
  } as never);
  if (error) {
    if (error.code === "23505") return { ok: false, message: "That domain is already registered." };
    return { ok: false, message: "Couldn't add the domain." };
  }
  revalidatePath(`/admin/tenants/${tenantId}/domains`);
  const record = `${verificationRecordName(hostname)}  TXT  "${verificationTxtValue(token)}"`;
  return {
    ok: true,
    message: `Added ${hostname}. Add this DNS record, then verify: ${record}${isFirst ? " (will become primary once verified)" : ""}`,
  };
}

export async function verifyTenantDomainAction(tenantId: string, domainId: string): Promise<DomainActionResult> {
  await assertSuperAdmin();
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("tenant_domains")
    .select("domain, verification_token, is_primary")
    .eq("id", domainId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row || !row.verification_token) return { ok: false, message: "Domain not found." };

  const records = await lookupTxt(verificationRecordName(row.domain));
  const verified = txtRecordsContainToken(records, row.verification_token);

  // If this is the tenant's only domain and it just verified, make it primary.
  let makePrimary = row.is_primary;
  if (verified && !row.is_primary) {
    const { count } = await admin
      .from("tenant_domains")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_primary", true);
    if ((count ?? 0) === 0) makePrimary = true;
  }

  const { error } = await admin
    .from("tenant_domains")
    .update({
      verification_status: verified ? "verified" : "failed",
      ssl_status: verified ? "provisioning" : "pending",
      is_primary: makePrimary,
    } as never)
    .eq("id", domainId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, message: "Couldn't update verification." };
  revalidatePath(`/admin/tenants/${tenantId}/domains`);
  return verified
    ? { ok: true, message: "Domain verified. SSL provisioning is handled by the hosting platform." }
    : { ok: false, message: "TXT record not found yet. DNS can take a while to propagate." };
}

export async function makeTenantDomainPrimaryAction(tenantId: string, domainId: string): Promise<DomainActionResult> {
  await assertSuperAdmin();
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("tenant_domains")
    .select("verified")
    .eq("id", domainId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Domain not found." };
  if (!row.verified) return { ok: false, message: "Verify the domain before making it primary." };

  // Clear the current primary first (the one-primary unique index forbids overlap).
  const cleared = await admin
    .from("tenant_domains")
    .update({ is_primary: false } as never)
    .eq("tenant_id", tenantId)
    .eq("is_primary", true);
  if (cleared.error) return { ok: false, message: "Couldn't update the primary domain." };
  const { error } = await admin
    .from("tenant_domains")
    .update({ is_primary: true } as never)
    .eq("id", domainId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, message: "Couldn't set the primary domain." };
  revalidatePath(`/admin/tenants/${tenantId}/domains`);
  return { ok: true, message: "Primary domain updated." };
}

export async function removeTenantDomainAction(tenantId: string, domainId: string): Promise<DomainActionResult> {
  await assertSuperAdmin();
  const admin = createAdminSupabase();
  const { error } = await admin.from("tenant_domains").delete().eq("id", domainId).eq("tenant_id", tenantId);
  if (error) return { ok: false, message: "Couldn't remove the domain." };
  revalidatePath(`/admin/tenants/${tenantId}/domains`);
  return { ok: true, message: "Domain removed." };
}
