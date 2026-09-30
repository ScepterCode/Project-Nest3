import { selectInChunks } from '@/lib/supabase/chunked-in';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe('selectInChunks', () => {
  it('splits long id lists into batches and concatenates the rows', async () => {
    const seen: number[] = [];
    const rows = await selectInChunks(ids(250), async chunk => {
      seen.push(chunk.length);
      return { data: chunk.map(id => ({ id })), error: null };
    });
    expect(seen).toEqual([100, 100, 50]);
    expect(rows).toHaveLength(250);
    expect(rows[249]).toEqual({ id: 'id-249' });
  });

  it('de-duplicates ids and skips the query for an empty list', async () => {
    const query = jest.fn(async (chunk: string[]) => ({
      data: chunk,
      error: null,
    }));
    expect(await selectInChunks(['a', 'a', 'b'], query)).toEqual(['a', 'b']);
    expect(await selectInChunks([], query)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('throws the first error from any batch', async () => {
    await expect(
      selectInChunks(ids(150), async chunk =>
        chunk[0] === 'id-100'
          ? { data: null, error: new Error('batch 2 failed') }
          : { data: [], error: null }
      )
    ).rejects.toThrow('batch 2 failed');
  });
});
