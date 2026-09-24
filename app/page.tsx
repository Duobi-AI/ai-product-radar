import { Dashboard } from "@/components/dashboard";
import { getLatestRun, listProducts } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const query = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "";
  const date = typeof params.date === "string" ? params.date : "";
  const page = Number(params.page || 1);
  const recommended = params.recommended === "1";
  const archive = params.archive === "1" || Boolean(query) || Boolean(date);
  const latestRun = archive ? null : await getLatestRun();
  const dailySince = archive ? null : latestRun?.status === "complete" ? latestRun.startedAt : new Date();
  const feed = await listProducts({ query, category, date, page, userId: user?.id, recommended, dailySince, dailyLimit: 30 });
  return <Dashboard feed={feed} signedIn={Boolean(user)} userName={user?.name} filters={{ query, category, date, recommended, archive }} />;
}
