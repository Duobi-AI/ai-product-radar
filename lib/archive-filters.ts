import { SOURCE_NAMES, type SourceKey } from "@/lib/domain";

export type ArchiveFilters = {
  query: string;
  category: string;
  date: string;
  source: SourceKey | "";
  sort: "newest" | "oldest";
  recommended: boolean;
  archive: boolean;
  page: number;
};

type SearchValues = Record<string, string | string[] | undefined>;

export function parseArchiveFilters(params: SearchValues): ArchiveFilters {
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const query = value("q").trim();
  const category = value("category");
  const date = value("date");
  const sourceValue = value("source");
  const source = Object.hasOwn(SOURCE_NAMES, sourceValue) ? sourceValue as SourceKey : "";
  const sort = value("sort") === "oldest" ? "oldest" : "newest";
  const rawPage = Number(value("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const archive = value("archive") === "1" || Boolean(query || date || source || sort === "oldest");
  return { query, category, date, source, sort, recommended: value("recommended") === "1", archive, page };
}

export function archiveHref(filters: ArchiveFilters, page?: number): string {
  const params = new URLSearchParams();
  if (filters.archive) params.set("archive", "1");
  if (filters.query) params.set("q", filters.query);
  if (filters.category && filters.category !== "All categories") params.set("category", filters.category);
  if (filters.date) params.set("date", filters.date);
  if (filters.source) params.set("source", filters.source);
  if (filters.sort === "oldest") params.set("sort", "oldest");
  if (filters.recommended) params.set("recommended", "1");
  if (page && page > 1) params.set("page", String(page));
  return "/" + (params.size ? `?${params}` : "");
}
