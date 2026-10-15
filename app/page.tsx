import { Dashboard } from "@/components/dashboard";
import { getLatestRun, listProducts } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { archiveHref, parseArchiveFilters } from "@/lib/archive-filters";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const filters = parseArchiveFilters(params);
  const { query, category, date, source, sort, page, recommended, archive } = filters;
  const latestRun = archive ? null : await getLatestRun();
  const dailySince = archive ? null : latestRun?.status === "complete" ? latestRun.startedAt : new Date();
  const feed = await listProducts({ query, category, date, source, sort, page, userId: user?.id, recommended, dailySince, dailyLimit: 30, showRankingReasons: !archive && !recommended && !category });
  return <Dashboard key={archiveHref(filters, feed.page)} feed={feed} signedIn={Boolean(user)} userName={user?.name} filters={filters} />;
}
