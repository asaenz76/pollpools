import type { Database, Json } from "./database";

/**
 * Argument type for a Postgres RPC, from the generated schema.
 *
 * Supabase's type generator types every function argument as non-nullable even
 * when the SQL function accepts NULL, so passing `null` for an optional arg fails
 * to type-check. Casting the args object with `as RpcArgs<"fn">` tolerates that
 * generator gap while STILL checking argument names (a misspelled or missing key
 * is a type error) — unlike the blanket `as never` it replaces.
 */
export type RpcArgs<K extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][K]["Args"];

export type { Json };
