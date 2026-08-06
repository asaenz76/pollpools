import { describe, it, expect } from "vitest";
import * as enums from "@/types/enums";
import { Constants } from "@/types/database";

/**
 * Single source of truth for enums (finding F-09).
 *
 * `src/types/enums.ts` is a hand-maintained mirror of the Postgres ENUM types.
 * The generated `Constants.public.Enums` (from `npm run db:types`) is the
 * authority. This test fails if the two ever drift — a value added to the DB but
 * not to `enums.ts`, or vice versa — so the mirror can never silently rot.
 *
 * The mapping is derived automatically: each SCREAMING_SNAKE export in enums.ts
 * maps to the snake_case SQL enum of the same name.
 */

const sqlEnums = Constants.public.Enums as Record<string, readonly string[]>;

// enums.ts exports that are intentionally NOT backed by a Postgres enum type
// (pure app-level vocabularies). Keep this list tiny and justified.
const NON_SQL_EXPORTS = new Set<string>([]);

// SQL enums intentionally NOT mirrored in enums.ts because they are server-only
// (billing/accounting/reconciliation/sponsorship internals accessed exclusively
// via the generated database.ts types, never as hand-written domain vocabulary).
// A NEW SQL enum must be either mirrored in enums.ts or added here WITH cause —
// the reverse-parity test below fails otherwise, so nothing escapes review (F-09).
const KNOWN_UNMIRRORED = new Set<string>([
  "billing_checkout_status",
  "billing_entitlement_type",
  "billing_interval_type",
  "billing_order_status",
  "billing_product_status",
  "billing_provider_type",
  "billing_refund_status",
  "creator_earning_status",
  "creator_earning_type",
  "creator_payout_status",
  "entitlement_source_type",
  "entitlement_status",
  "fanout_status",
  "provider_approval_status",
  "reconciliation_mode",
  "reconciliation_scope_type",
  "reconciliation_status",
  "sponsorship_invoice_status",
  "webhook_processing_status",
]);

function isEnumArray(v: unknown): v is readonly string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

describe("enum single source of truth (enums.ts ⇔ generated schema)", () => {
  const exported = Object.entries(enums).filter(
    ([name, val]) => name === name.toUpperCase() && isEnumArray(val),
  ) as [string, readonly string[]][];

  it("covers a meaningful number of enums", () => {
    expect(exported.length).toBeGreaterThan(20);
  });

  for (const [name, values] of exported) {
    const sqlName = name.toLowerCase();
    it(`${name} matches SQL enum ${sqlName}`, () => {
      if (NON_SQL_EXPORTS.has(name)) return;
      const sql = sqlEnums[sqlName];
      expect(sql, `no SQL enum named ${sqlName} — is enums.ts out of sync?`).toBeDefined();
      expect([...values].sort()).toEqual([...sql!].sort());
    });
  }

  // Reverse direction (F-09 hardening): every SQL enum must be either mirrored in
  // enums.ts or explicitly allow-listed as server-only — a new one can't silently
  // escape review.
  const mirrored = new Set(exported.map(([name]) => name.toLowerCase()));
  for (const sqlName of Object.keys(sqlEnums)) {
    it(`SQL enum ${sqlName} is mirrored or explicitly allow-listed`, () => {
      expect(
        mirrored.has(sqlName) || KNOWN_UNMIRRORED.has(sqlName),
        `SQL enum "${sqlName}" has no enums.ts mirror and is not in KNOWN_UNMIRRORED — mirror it or justify it there.`,
      ).toBe(true);
    });
  }
});
