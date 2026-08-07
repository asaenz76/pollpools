import "server-only";

import { promises as dns } from "node:dns";

/**
 * Look up TXT records for a name and return them as flat strings. DNS chunks a
 * single record into multiple strings; we join them. Any lookup error (NXDOMAIN,
 * timeout, etc.) yields an empty list — the caller treats "no matching record" and
 * "lookup failed" identically (verification simply hasn't succeeded yet).
 */
export async function lookupTxt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}
