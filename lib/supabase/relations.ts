/**
 * Supabase embeds a many-to-one relation (e.g. `classes(name)` on an
 * assignment) as a single object at runtime, but without generated database
 * types the client types it as an array. This returns the related row either
 * way.
 */
export function one<T>(relation: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(relation)) return relation[0];
  return relation ?? undefined;
}
