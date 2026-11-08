type Response = { data: unknown[] | null; error: unknown };
type ReadQuery = PromiseLike<Response> & {
  order: (column: "id") => ReadQuery;
  range: (from: number, to: number) => PromiseLike<Response>;
};

// Aggregates/exports must consume the full RLS-visible set, including beyond the API row cap.
// Keep ordinary list queries on readPage; this helper is only for complete-source reads.
export async function completeRead<Q extends ReadQuery>(query: Q): Promise<Awaited<Q>> {
  const ordered = query.order("id");
  const rows: unknown[] = [];
  for (let from = 0; ; from += 500) {
    const response = await ordered.range(from, from + 499);
    if (response.error) return response as Awaited<Q>;
    rows.push(...(response.data ?? []));
    if ((response.data?.length ?? 0) < 500) return { ...response, data: rows } as Awaited<Q>;
  }
}

export async function completeQueries<const Q extends readonly ReadQuery[]>(
  queries: Q,
): Promise<{ [K in keyof Q]: Awaited<Q[K]> }> {
  return Promise.all(queries.map((query) => completeRead(query))) as Promise<{
    [K in keyof Q]: Awaited<Q[K]>;
  }>;
}

export async function completeIds<Q extends ReadQuery>(
  ids: string[],
  query: (ids: string[]) => Q,
): Promise<Awaited<Q>> {
  const unique = [...new Set(ids)];
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 100) {
    const result = await completeRead(query(unique.slice(offset, offset + 100)));
    if (result.error) return result;
    rows.push(...(result.data ?? []));
    if (offset + 100 >= unique.length) return { ...result, data: rows } as Awaited<Q>;
  }
}
