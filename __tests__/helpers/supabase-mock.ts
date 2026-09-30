// Minimal Supabase client mock for route/service tests.
//
// Every query builder method (select, eq, in, order, ...) is chainable. The
// result a query resolves to is chosen per table and operation:
//
//   const supabase = createSupabaseMock({
//     user: { id: 'u1' },
//     tables: {
//       users: { select: { data: { role: 'student' } }, update: { error: null } },
//     },
//   });
//
// Awaiting the builder, or calling .single() / .maybeSingle(), resolves to
// that result. Writes are recorded in `supabase.calls` for assertions.

type Result = { data?: unknown; error?: unknown; count?: number | null };
type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export interface SupabaseMockOptions {
  user?: { id: string; email?: string } | null;
  authError?: unknown;
  tables?: Record<string, Partial<Record<Operation, Result>>>;
  rpc?: Record<string, Result>;
}

export interface RecordedCall {
  table: string;
  operation: Operation;
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
}

export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const calls: RecordedCall[] = [];

  const from = (table: string) => {
    const call: RecordedCall = { table, operation: 'select', filters: [] };
    calls.push(call);

    const result = (): Promise<Result> => {
      const r = options.tables?.[table]?.[call.operation] ?? {
        data: null,
        error: null,
      };
      return Promise.resolve({ data: null, error: null, ...r });
    };

    const builder: Record<string, unknown> = {};
    const chain =
      (name: string) =>
      (...args: unknown[]) => {
        call.filters.push([name, ...args]);
        return builder;
      };
    for (const name of [
      'eq',
      'neq',
      'in',
      'is',
      'not',
      'or',
      'gt',
      'gte',
      'lt',
      'lte',
      'ilike',
      'like',
      'order',
      'range',
      'limit',
      'match',
      'filter',
    ]) {
      builder[name] = chain(name);
    }
    const write = (operation: Operation) => (payload?: unknown) => {
      // .insert(...).select() keeps the write operation for result lookup.
      if (operation !== 'select' || call.operation === 'select') {
        call.operation = operation;
      }
      if (operation !== 'select') call.payload = payload;
      return builder;
    };
    builder.select = write('select');
    builder.insert = write('insert');
    builder.update = write('update');
    builder.upsert = write('upsert');
    builder.delete = write('delete');
    builder.single = () => result();
    builder.maybeSingle = () => result();
    builder.then = (
      resolve: (r: Result) => unknown,
      reject?: (e: unknown) => unknown
    ) => result().then(resolve, reject);
    return builder;
  };

  return {
    calls,
    from: jest.fn(from),
    rpc: jest.fn((name: string) =>
      Promise.resolve({
        data: null,
        error: null,
        ...(options.rpc?.[name] ?? {}),
      })
    ),
    auth: {
      getUser: jest.fn(() =>
        Promise.resolve({
          data: { user: options.user ?? null },
          error: options.authError ?? null,
        })
      ),
      updateUser: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
