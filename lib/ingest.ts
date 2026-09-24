import { eq, inArray } from "drizzle-orm";
import { dailyRuns, productSources, products } from "@/db/schema";
import { getDb } from "@/lib/db";
import { identityFor } from "@/lib/classify";
import { prepareDailyCandidates, type CandidateGroup } from "@/lib/daily-candidates";
import { collectGitHub } from "@/lib/sources/github";
import { collectHuggingFace } from "@/lib/sources/hugging-face";
import { collectShowHn } from "@/lib/sources/hacker-news";
import { collectProductHunt } from "@/lib/sources/product-hunt";
import type { SourceCandidate } from "@/lib/domain";
import { rankDailyCandidates } from "@/lib/llm-ranking";

const SOURCE_COLLECTORS = [
  ["product_hunt", collectProductHunt],
  ["hacker_news", collectShowHn],
  ["github", collectGitHub],
  ["hugging_face", collectHuggingFace],
] as const;

export const MAX_DAILY_PRODUCTS = 30;

function pacificDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function isPacificNoonWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value) === 12;
}

async function storeCandidate(candidate: SourceCandidate) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const key = identityFor(candidate.name, candidate.websiteUrl);
  const now = new Date();
  const [product] = await db
    .insert(products)
    .values({
      identityKey: key,
      name: candidate.name.slice(0, 180),
      description: candidate.description.slice(0, 1200),
      websiteUrl: candidate.websiteUrl || null,
      category: candidate.category || "AI Tools",
      stage: candidate.stage || "New launch",
      dailyRank: null,
      announcedAt: candidate.announcedAt || null,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: products.identityKey,
      set: {
        description: candidate.description.slice(0, 1200),
        websiteUrl: candidate.websiteUrl || null,
        category: candidate.category || "AI Tools",
        stage: candidate.stage || "New launch",
        dailyRank: null,
        announcedAt: candidate.announcedAt || null,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning({ id: products.id });

  if (!product) return null;
  await db
    .insert(productSources)
    .values({
      productId: product.id,
      source: candidate.source,
      externalId: candidate.externalId,
      sourceUrl: candidate.sourceUrl,
      sourceName: candidate.sourceName,
      score: candidate.score || 0,
      metadata: candidate.metadata || {},
      seenAt: now,
    })
    .onConflictDoUpdate({
      target: [productSources.source, productSources.externalId],
      set: {
        productId: product.id,
        sourceUrl: candidate.sourceUrl,
        sourceName: candidate.sourceName,
        score: candidate.score || 0,
        metadata: candidate.metadata || {},
        seenAt: now,
      },
    });
  return product.id;
}

export async function runDailyIngestion(options: { force?: boolean } = {}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");

  const now = new Date();
  const localDate = pacificDate(now);
  const [existingRun] = await db
    .select({ status: dailyRuns.status })
    .from(dailyRuns)
    .where(eq(dailyRuns.localDate, localDate))
    .limit(1);
  if (existingRun?.status === "complete" && !options.force) {
    return { localDate, status: "already_complete", candidates: 0, selectedProducts: 0, saved: 0, sources: {} };
  }

  await db
    .insert(dailyRuns)
    .values({ localDate, status: "running", startedAt: now })
    .onConflictDoUpdate({
      target: dailyRuns.localDate,
      set: { status: "running", startedAt: now, finishedAt: null, sourceResults: {} },
    });

  const since = existingRun ? new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) : new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const collectionResults = await Promise.all(
    SOURCE_COLLECTORS.map(async ([key, collect]) => {
      try {
        const candidates = await collect(since);
        return { key, candidates, error: null as string | null };
      } catch (error) {
        return {
          key,
          candidates: [] as SourceCandidate[],
          error: error instanceof Error ? error.message : "Source collection failed",
        };
      }
    }),
  );

  const candidates = collectionResults.flatMap((result) => result.candidates);
  let selectedProducts: CandidateGroup[];
  try {
    selectedProducts = (await rankDailyCandidates(prepareDailyCandidates(candidates))).slice(0, MAX_DAILY_PRODUCTS);
  } catch (error) {
    await db.update(dailyRuns)
      .set({ status: "failed", sourceResults: { rankingError: error instanceof Error ? error.message : "LLM ranking failed" }, finishedAt: new Date() })
      .where(eq(dailyRuns.localDate, localDate));
    throw new Error(`LLM ranking failed: ${error instanceof Error ? error.message : "AI Gateway request failed"}`);
  }
  const selectedCandidates = selectedProducts.flatMap((product) => product.items);
  let saved = 0;
  const productRank = new Map<string, number>();
  for (const [index, group] of selectedProducts.entries()) {
    for (const candidate of group.items) {
      try {
        const productId = await storeCandidate(candidate);
        if (productId) productRank.set(productId, index + 1);
        saved += 1;
      } catch (error) {
        throw new Error(`Could not save ${candidate.source} item ${candidate.externalId}: ${error instanceof Error ? error.message : "database write failed"}`);
      }
    }
  }
  if (productRank.size) {
    await db.update(products).set({ dailyRank: null }).where(inArray(products.id, [...productRank.keys()]));
    for (const [id, rank] of productRank) await db.update(products).set({ dailyRank: rank }).where(eq(products.id, id));
  }

  const sourceResults = Object.fromEntries(
    collectionResults.map((result) => [
      result.key,
      {
        found: result.candidates.length,
        selected: selectedCandidates.filter((candidate) => candidate.source === result.key).length,
        error: result.error,
      },
    ]),
  );
  await db
    .update(dailyRuns)
    .set({
      status: "complete",
      sourceResults,
      finishedAt: new Date(),
    })
    .where(eq(dailyRuns.localDate, localDate));

  return { localDate, status: "complete", candidates: candidates.length, selectedProducts: selectedProducts.length, saved, sources: sourceResults };
}
