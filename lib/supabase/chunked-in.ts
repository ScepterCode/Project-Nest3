/**
 * PostgREST filters go in the URL, so `.in('id', ids)` with hundreds of UUIDs
 * (~37 characters each) can exceed URL length limits and fail. This runs the
 * query once per batch of ids, in parallel, and concatenates the rows.
 *
 *   const rows = await selectInChunks(ids, chunk =>
 *     supabase.from('users').select('id, first_name').in('id', chunk));
 */
export const IN_CHUNK_SIZE = 100;

export async function selectInChunks<T>(
  ids: readonly string[],
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = IN_CHUNK_SIZE
): Promise<T[]> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const results = await Promise.all(chunks.map(chunk => query(chunk)));
  const failed = results.find(r => r.error);
  if (failed) throw failed.error;
  return results.flatMap(r => r.data ?? []);
}
