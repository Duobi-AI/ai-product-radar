import { eq, lt } from "drizzle-orm";
import { dailyRuns, productEvidence, productSources, products, selectionSnapshots } from "@/db/schema";
import { getDb } from "@/lib/db";
import { identityForCandidate, prepareDailyCandidates, type CandidateGroup } from "@/lib/daily-candidates";
import {
  candidateShortlist,
  coldStartEvidenceConfidence,
  MAX_DAILY_FEED,
  type ScoredCandidateGroup,
} from "@/lib/daily-ranking";
import type { SourceCandidate, SourceKey } from "@/lib/domain";
import { enrichOfficialEvidence, fetchBoundedOfficialEvidence, renderEvidenceBackedRankingReason, type EvidenceRecord } from "@/lib/evidence";
import { rankDailyCandidateIds } from "@/lib/llm-ranking";
import { collectGitHub } from "@/lib/sources/github";
import { collectHuggingFace } from "@/lib/sources/hugging-face";
import { collectShowHn } from "@/lib/sources/hacker-news";
import { collectProductHunt } from "@/lib/sources/product-hunt";
import { SELECTION_SNAPSHOT_RETENTION_DAYS, type SelectionSnapshot } from "@/lib/selection-snapshots";

const SOURCE_COLLECTORS = [
  ["product_hunt", collectProductHunt],
  ["hacker_news", collectShowHn],
  ["github", collectGitHub],
  ["hugging_face", collectHuggingFace],
] as const;

export { MAX_DAILY_FEED } from "@/lib/daily-ranking";

type SourceResult = { found: number; selected: number; error: string | null };
export type DailyRunStatus = "running" | "complete" | "failed";

export type DailyCollectionResult = {
  key: SourceKey;
  candidates: SourceCandidate[];
  error: string | null;
};

export type DailyFeedPersistence = {
  getRun: (localDate: string) => Promise<{ status: DailyRunStatus } | null>;
  startRun: (input: { localDate: string; startedAt: Date }) => Promise<void>;
  /** Persist every eligible source mention before ranking, keyed by group identity. */
  persistCandidates: (groups: CandidateGroup[]) => Promise<Map<string, string>>;
  persistEvidence: (records: Map<string, EvidenceRecord>, productIds: Map<string, string>) => Promise<void>;
  persistSelectionSnapshots: (records: SelectionSnapshot[]) => Promise<void>;
  setDailyRanks: (entries: { identity: string; rank: number }[], productIds: Map<string, string>) => Promise<void>;
  completeRun: (input: { localDate: string; sourceResults: Record<string, SourceResult>; finishedAt: Date }) => Promise<void>;
  failRun: (input: { localDate: string; error: string; finishedAt: Date }) => Promise<void>;
};

export type DailyFeedDependencies = {
  now: () => Date;
  collect: (since: Date) => Promise<DailyCollectionResult[]>;
  persistence: DailyFeedPersistence;
  enrichEvidence?: (groups: CandidateGroup[]) => Promise<Map<string, EvidenceRecord>>;
  /** Return only supplied shortlist identities, in desired feed order. */
  rank: (shortlist: ScoredCandidateGroup[]) => Promise<readonly string[]>;
};

export type DailyFeedResult = {
  localDate: string;
  status: "complete" | "already_complete";
  candidates: number;
  selectedProducts: number;
  saved: number;
  sources: Record<string, SourceResult>;
  selected: ScoredCandidateGroup[];
  ranking: "provider" | "fallback";
};

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

function validateRanking(ids: readonly string[], allowed: Set<string>) {
  if (!ids.length || ids.length > MAX_DAILY_FEED) return null;
  const unique = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !allowed.has(id) || unique.has(id)) return null;
    unique.add(id);
  }
  return [...unique];
}

function isDailyRunStatus(status: string): status is DailyRunStatus {
  return status === "running" || status === "complete" || status === "failed";
}

function fallbackOrder(shortlist: ScoredCandidateGroup[]) {
  return shortlist.slice(0, MAX_DAILY_FEED);
}

function evidenceConfidenceValue(record: EvidenceRecord | undefined) {
  if (!record) return undefined;
  return record.confidence === "high" ? 1 : record.confidence === "medium" ? 0.6 : 0.25;
}

function officialGitHubRepository(group: CandidateGroup) {
  for (const candidate of group.items) for (const url of [candidate.websiteUrl, candidate.sourceUrl]) {
    try {
      const parsed = new URL(url || "");
      if (parsed.protocol === "https:" && parsed.hostname === "github.com") return parsed.toString();
    } catch {
      // Candidate URLs remain untrusted source data.
    }
  }
  return undefined;
}

async function enrichProductionEvidence(groups: CandidateGroup[]) {
  const records = await Promise.all(groups.map(async (group) => {
    const best = group.items.find((candidate) => candidate.websiteUrl) || group.items[0]!;
    const record = await enrichOfficialEvidence({
      name: best.name,
      canonicalUrl: best.websiteUrl,
      githubRepositoryUrl: officialGitHubRepository(group),
      metadata: best.metadata,
      metadataProvenance: "source",
    }, fetchBoundedOfficialEvidence);
    return [group.identity, record] as const;
  }));
  return new Map(records);
}

/**
 * The Daily Feed's one high-level orchestration seam. Collection, persistence,
 * ranking, and time are injected so fixture tests never need live services.
 */
export async function runDailyFeed(
  dependencies: DailyFeedDependencies,
  options: { force?: boolean } = {},
): Promise<DailyFeedResult> {
  const startedAt = dependencies.now();
  const localDate = pacificDate(startedAt);
  const existingRun = await dependencies.persistence.getRun(localDate);
  if (existingRun?.status === "complete" && !options.force) {
    return {
      localDate,
      status: "already_complete",
      candidates: 0,
      selectedProducts: 0,
      saved: 0,
      sources: {},
      selected: [],
      ranking: "fallback",
    };
  }

  await dependencies.persistence.startRun({ localDate, startedAt });
  try {
    const since = existingRun
      ? new Date(startedAt.getTime() - 2 * 86_400_000)
      : new Date(startedAt.getTime() - 8 * 86_400_000);
    const collectionResults = await dependencies.collect(since);
    const candidates = collectionResults.flatMap((result) => result.candidates);
    const groups = prepareDailyCandidates(candidates, { now: startedAt });

    // This deliberately precedes shortlist construction and provider ranking:
    // unselected eligible products and mentions remain part of the archive.
    const productIds = await dependencies.persistence.persistCandidates(groups);
    let evidence = new Map<string, EvidenceRecord>();
    try {
      evidence = dependencies.enrichEvidence ? await dependencies.enrichEvidence(groups) : await enrichProductionEvidence(groups);
    } catch {
      // Retrieval is optional evidence improvement; score conservatively if it fails.
    }
    await dependencies.persistence.persistEvidence(evidence, productIds);
    const shortlist = candidateShortlist(groups, {
      now: startedAt,
      evidenceConfidence: (group) => evidenceConfidenceValue(evidence.get(group.identity)) ?? coldStartEvidenceConfidence(group),
    });
    let selected: ScoredCandidateGroup[];
    let ranking: DailyFeedResult["ranking"] = "provider";
    try {
      const rankedIds = validateRanking(await dependencies.rank(shortlist), new Set(shortlist.map((group) => group.identity)));
      if (!rankedIds) throw new Error("Ranking output did not contain unique shortlist identities");
      const byIdentity = new Map(shortlist.map((group) => [group.identity, group]));
      const modelOrder = rankedIds.map((id) => byIdentity.get(id)!);
      const remaining = shortlist.filter((group) => !rankedIds.includes(group.identity));
      selected = [...modelOrder, ...remaining].slice(0, MAX_DAILY_FEED);
    } catch {
      // Ranking is optional refinement; a provider error or invalid response
      // must never turn a successfully collected run into a failed one.
      ranking = "fallback";
      selected = fallbackOrder(shortlist);
    }

    await dependencies.persistence.setDailyRanks(
      selected.map((group, index) => ({ identity: group.identity, rank: index + 1 })),
      productIds,
    );
    const snapshots = selected.flatMap((group, index) => {
      const productId = productIds.get(group.identity);
      if (!productId) return [];
      const evidenceRecord = evidence.get(group.identity);
      return [{
        productId,
        selectedAt: startedAt,
        rank: index + 1,
        freshness: group.score.freshness,
        evidenceConfidence: group.score.evidenceConfidence,
        sourceRelativeTraction: group.score.sourceRelativeTraction,
        deterministicScore: group.score.preScore,
        acceptedEvidence: evidenceRecord ? structuredClone(evidenceRecord) as Record<string, unknown> : {},
        rankingReason: evidenceRecord ? renderEvidenceBackedRankingReason(evidenceRecord) : null,
        rediscovery: false,
        provenance: ranking === "provider" ? "model" as const : "fallback" as const,
      }];
    });
    await dependencies.persistence.persistSelectionSnapshots(snapshots);
    const sourceResults = Object.fromEntries(
      collectionResults.map((result) => [
        result.key,
        {
          found: result.candidates.length,
          selected: selected.flatMap((group) => group.items).filter((candidate) => candidate.source === result.key).length,
          error: result.error,
        },
      ]),
    );
    const finishedAt = dependencies.now();
    await dependencies.persistence.completeRun({ localDate, sourceResults, finishedAt });

    return {
      localDate,
      status: "complete",
      candidates: candidates.length,
      selectedProducts: selected.length,
      saved: groups.reduce((total, group) => total + group.items.length, 0),
      sources: sourceResults,
      selected,
      ranking,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily collection failed";
    await dependencies.persistence.failRun({ localDate, error: message, finishedAt: dependencies.now() });
    throw error;
  }
}

async function storeCandidate(candidate: SourceCandidate) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const key = identityForCandidate(candidate);
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

function productionPersistence(): DailyFeedPersistence {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  return {
    getRun: async (localDate) => {
      const [run] = await db.select({ status: dailyRuns.status }).from(dailyRuns).where(eq(dailyRuns.localDate, localDate)).limit(1);
      return run && isDailyRunStatus(run.status) ? { status: run.status } : null;
    },
    startRun: async ({ localDate, startedAt }) => {
      await db.insert(dailyRuns).values({ localDate, status: "running", startedAt }).onConflictDoUpdate({
        target: dailyRuns.localDate,
        set: { status: "running", startedAt, finishedAt: null, sourceResults: {} },
      });
    },
    persistCandidates: async (groups) => {
      const ids = new Map<string, string>();
      for (const group of groups) {
        for (const candidate of group.items) {
          const id = await storeCandidate(candidate);
          if (!id) throw new Error(`Could not persist ${candidate.source} item ${candidate.externalId}`);
          ids.set(group.identity, id);
        }
      }
      return ids;
    },
    persistEvidence: async (records, productIds) => {
      const refreshedAt = new Date();
      for (const [identity, record] of records) {
        const productId = productIds.get(identity);
        if (!productId) continue;
        await db.insert(productEvidence).values({
          productId,
          factualSummary: record.factualSummary,
          primaryUseCase: record.primaryUseCase,
          audience: record.audience,
          productType: record.productType,
          officialEvidenceUrl: record.officialEvidenceUrl,
          supportingExcerpts: record.supportingExcerpts,
          confidence: record.confidence,
          conflicts: record.conflicts,
          rankingReason: renderEvidenceBackedRankingReason(record),
          refreshedAt,
        }).onConflictDoUpdate({
          target: productEvidence.productId,
          set: {
            factualSummary: record.factualSummary,
            primaryUseCase: record.primaryUseCase,
            audience: record.audience,
            productType: record.productType,
            officialEvidenceUrl: record.officialEvidenceUrl,
            supportingExcerpts: record.supportingExcerpts,
            confidence: record.confidence,
            conflicts: record.conflicts,
            rankingReason: renderEvidenceBackedRankingReason(record),
            refreshedAt,
          },
        });
      }
    },
    persistSelectionSnapshots: async (records) => {
      if (!records.length) return;
      await db.insert(selectionSnapshots).values(records.map((record) => ({
        productId: record.productId,
        selectedAt: record.selectedAt,
        rank: record.rank,
        freshness: record.freshness,
        evidenceConfidence: record.evidenceConfidence,
        sourceRelativeTraction: record.sourceRelativeTraction,
        deterministicScore: record.deterministicScore,
        acceptedEvidence: record.acceptedEvidence,
        rankingReason: record.rankingReason,
        rediscovery: record.rediscovery,
        provenance: record.provenance,
      })));
    },
    setDailyRanks: async (entries, productIds) => {
      for (const entry of entries) {
        const productId = productIds.get(entry.identity);
        if (productId) await db.update(products).set({ dailyRank: entry.rank }).where(eq(products.id, productId));
      }
    },
    completeRun: async ({ localDate, sourceResults, finishedAt }) => {
      await db.update(dailyRuns).set({ status: "complete", sourceResults, finishedAt }).where(eq(dailyRuns.localDate, localDate));
    },
    failRun: async ({ localDate, error, finishedAt }) => {
      await db.update(dailyRuns).set({ status: "failed", sourceResults: { error }, finishedAt }).where(eq(dailyRuns.localDate, localDate));
    },
  };
}

async function collectProductionSources(since: Date): Promise<DailyCollectionResult[]> {
  return Promise.all(
    SOURCE_COLLECTORS.map(async ([key, collect]) => {
      try {
        return { key, candidates: await collect(since), error: null };
      } catch (error) {
        return {
          key,
          candidates: [],
          error: error instanceof Error ? error.message : "Source collection failed",
        };
      }
    }),
  );
}

/** Intended for the scheduled maintenance path; snapshots are append-only until expiry. */
export async function cleanupExpiredSelectionSnapshots(now = new Date()) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  const cutoff = new Date(now.getTime() - SELECTION_SNAPSHOT_RETENTION_DAYS * 86_400_000);
  const deleted = await db.delete(selectionSnapshots).where(lt(selectionSnapshots.selectedAt, cutoff)).returning({ id: selectionSnapshots.id });
  return deleted.length;
}

export async function runDailyIngestion(options: { force?: boolean } = {}) {
  return runDailyFeed({
    now: () => new Date(),
    collect: collectProductionSources,
    persistence: productionPersistence(),
    rank: rankDailyCandidateIds,
  }, options);
}
