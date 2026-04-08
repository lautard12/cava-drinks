import { useState } from "react";

export function usePagination<T>(items: T[], pageSize = 5) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safeP = Math.min(page, totalPages);
  const paged = items.slice((safeP - 1) * pageSize, safeP * pageSize);
  return { page: safeP, totalPages, paged, setPage, total: items.length };
}
