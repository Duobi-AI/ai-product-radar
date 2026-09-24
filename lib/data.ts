import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { dailyRuns, feedback, productSources, products } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { ProductListing } from "@/lib/domain";
import { rankPersonalizedProducts } from "@/lib/llm-ranking";

const PAGE_SIZE = 24;
const DAILY_FEED_LIMIT = 30;

export async function listProducts(options: {
  query?: string;
  category?: string;
  date?: string;
  page?: number;
  userId?: string | null;
  recommended?: boolean;
  dailySince?: Date | null;
  dailyLimit?: number;
}) {
  const db = getDb();
  const pageSize = options.dailySince ? Math.min(options.dailyLimit || DAILY_FEED_LIMIT, DAILY_FEED_LIMIT) : PAGE_SIZE;
  if (!db) return { items: [] as ProductListing[], total: 0, categories: [] as string[], page: 1, pageSize, ready: false };

  const conditions = [];
  const query = options.query?.trim();
  if (query) {
    const pattern = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
    conditions.push(or(ilike(products.name, pattern), ilike(products.description, pattern))!);
  }
  if (options.category && options.category !== "All categories") conditions.push(eq(products.category, options.category));
  if (options.dailySince) conditions.push(gte(products.lastSeenAt, options.dailySince));
  if (options.date) {
    const start = new Date(options.date + "T00:00:00.000Z");
    if (!Number.isNaN(start.getTime())) {
      conditions.push(gte(products.firstSeenAt, start));
      conditions.push(lt(products.firstSeenAt, new Date(start.getTime() + 86_400_000)));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [totalResult, categoryRows, allFeedback] = await Promise.all([
    db.select({ value: count() }).from(products).where(where),
    db.selectDistinct({ category: products.category }).from(products).orderBy(products.category),
    options.userId && options.recommended
      ? db.select({ direction: feedback.direction, reason: feedback.reason, name: products.name, description: products.description,
          category: products.category, stage: products.stage, updatedAt: feedback.updatedAt })
          .from(feedback).innerJoin(products, eq(feedback.productId, products.id)).where(eq(feedback.userId, options.userId))
          .orderBy(desc(feedback.updatedAt)).limit(60)
      : Promise.resolve([] as { direction: number; reason: string | null; name: string; description: string; category: string; stage: string; updatedAt: Date }[]),
  ]);

  const page = Math.max(1, Math.floor(options.page || 1));
  const rankBeforePagination = Boolean(options.dailySince || (options.recommended && options.userId));
  let rankingNotice: string | undefined;
  // Load the complete daily set and the first 30 newest personalized matches before
  // paging, rather than ranking only whichever 24 rows happen to be on the current page.
  const rows = await db.select().from(products).where(where)
    .orderBy(options.dailySince ? asc(products.dailyRank) : desc(products.firstSeenAt), desc(products.firstSeenAt))
    .limit(rankBeforePagination ? 2500 : PAGE_SIZE)
    .offset(rankBeforePagination ? 0 : (page - 1) * PAGE_SIZE);
  const ids = rows.map((row) => row.id);
  if (!ids.length) return { items: [] as ProductListing[], total: options.dailySince ? 0 : Number(totalResult[0]?.value || 0), categories: categoryRows.map((row) => row.category), page, pageSize, ready: true };

  const [mentions, votes] = await Promise.all([
    db.select().from(productSources).where(inArray(productSources.productId, ids)),
    options.userId ? db.select().from(feedback).where(and(eq(feedback.userId, options.userId), inArray(feedback.productId, ids))) : Promise.resolve([]),
  ]);
  const byProduct = new Map<string, ProductListing["sources"]>();
  for (const mention of mentions) {
    const list = byProduct.get(mention.productId) || [];
    list.push({ id: mention.id, source: mention.source, sourceName: mention.sourceName, sourceUrl: mention.sourceUrl, score: mention.score });
    byProduct.set(mention.productId, list);
  }
  const voteByProduct = new Map(votes.map((vote) => [vote.productId, vote]));
  let items: ProductListing[] = rows.map((row) => {
    const sources = byProduct.get(row.id) || [];
    const vote = voteByProduct.get(row.id);
    return { id: row.id, name: row.name, description: row.description, websiteUrl: row.websiteUrl, category: row.category, stage: row.stage,
      announcedAt: row.announcedAt, firstSeenAt: row.firstSeenAt, sources,
      feedback: vote ? { direction: vote.direction, reason: vote.reason } : null, relevance: 0 };
  });
  if (options.recommended && options.userId) {
    const rerankable = items.slice(0, 30);
    const remainder = items.slice(30);
    try {
      const personalized = await rankPersonalizedProducts({ userId: options.userId, products: rerankable, feedback: allFeedback });
      items = [...personalized, ...remainder];
    } catch {
      rankingNotice = "Personalized ranking is temporarily unavailable; showing the current feed order instead.";
    }
  }
  const pageItems = options.dailySince
    ? items.slice(0, pageSize)
    : options.recommended && options.userId
      ? items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      : items;
  const rawTotal = Number(totalResult[0]?.value || 0);
  const total = options.dailySince ? Math.min(rawTotal, pageSize) : rawTotal;
  return { items: pageItems, total, categories: categoryRows.map((row) => row.category), page, pageSize, ready: true, rankingNotice };
}

export async function getUserLearningSummary(userId: string) {
  const db = getDb();
  if (!db) return { total: 0, positive: 0, negative: 0, byCategory: [] as { name: string; score: number }[] };
  const [votes, byCategory] = await Promise.all([
    db.select().from(feedback).where(eq(feedback.userId, userId)),
    db.select({ category: products.category, score: count() }).from(feedback).innerJoin(products, eq(feedback.productId, products.id))
      .where(eq(feedback.userId, userId)).groupBy(products.category).orderBy(desc(count())),
  ]);
  return { total: votes.length, positive: votes.filter((vote) => vote.direction > 0).length,
    negative: votes.filter((vote) => vote.direction < 0).length,
    byCategory: byCategory.map((row) => ({ name: row.category, score: Number(row.score) })) };
}

export async function getLatestRun() {
  const db = getDb();
  if (!db) return null;
  const [run] = await db.select().from(dailyRuns).where(eq(dailyRuns.status, "complete")).orderBy(desc(dailyRuns.localDate)).limit(1);
  return run || null;
}
