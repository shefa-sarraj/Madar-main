import { useState } from "react";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export type PageRequest = { page: number; pageSize: PageSize };
export type PageResult<T> = { rows: T[]; total: number; page: number };
export type PaginationControl = PageRequest & {
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  loading?: boolean;
};

export function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size));
}

export function pageRange(page: number, size: number) {
  const from = (Math.max(1, page) - 1) * size;
  return { from, to: from + size - 1 };
}

export function keepPageData<T>(
  data: T | undefined,
  query: { queryKey: readonly unknown[] } | undefined,
  scope: readonly unknown[],
) {
  return query && scope.every((value, index) => query.queryKey[index] === value) ? data : undefined;
}

// The scope includes filters and tenant/year, so the first render after a change is page one.
export function usePagination(scope: unknown) {
  const key = JSON.stringify(scope);
  const [state, setState] = useState({ key, page: 1, pageSize: 25 as PageSize });
  const page = state.key === key ? state.page : 1;
  return {
    page,
    pageSize: state.pageSize,
    onPageChange: (next: number) =>
      setState({ key, page: Math.max(1, next), pageSize: state.pageSize }),
    onPageSizeChange: (pageSize: PageSize) => setState({ key, page: 1, pageSize }),
  };
}

export function slicePage<T>(rows: T[], request: PageRequest): PageResult<T> {
  const page = Math.min(request.page, pageCount(rows.length, request.pageSize));
  const { from, to } = pageRange(page, request.pageSize);
  return { rows: rows.slice(from, to + 1), total: rows.length, page };
}

// Quote PostgREST OR operands; user text must never become filter syntax or wildcards.
export function searchOperand(text: string) {
  return `"%${text.trim().replace(/[\\%_"]/g, (char) => `\\${char}`)}%"`;
}

type ReadResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};
export async function readPage<T>(
  read: (from: number, to: number) => PromiseLike<ReadResponse<T>>,
  request: PageRequest,
): Promise<PageResult<T>> {
  const range = pageRange(request.page, request.pageSize);
  const result = await read(range.from, range.to);
  if (result.error) throw result.error;
  if (result.count == null) throw new Error("تعذر تحميل عدد السجلات.");
  const page = Math.min(request.page, pageCount(result.count, request.pageSize));
  if (page !== request.page) return readPage(read, { ...request, page });
  return { rows: result.data ?? [], total: result.count, page };
}

// Complete projections are needed for aggregates/lookups, never rely on the API row cap.
export async function readAll<T>(read: (from: number, to: number) => PromiseLike<ReadResponse<T>>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const result = await read(from, from + size - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) return rows;
  }
}
