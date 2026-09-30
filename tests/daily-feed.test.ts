import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CANDIDATE_SHORTLIST,
  MAX_DAILY_FEED,
  scoreDailyCandidates,
} from "../lib/daily-ranking";
import {
  runDailyFeed,
  type DailyFeedDependencies,
  type DailyFeedPersistence,
} from "../lib/ingest";
import type { SourceCandidate } from "../lib/domain";
import type { SelectionSnapshot } from "../lib/selection-snapshots";
import { enrichEvidenceWithDeepSeek, type EvidenceRecord } from "../lib/evidence";
import { InMemoryDiscoveryBudgetRepository, type DiscoveryBudgetRepository } from "../lib/discovery-budget";

const NOW = new Date("2026-09-29T19:00:00.000Z");

function candidate(index: number, overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    source: "product_hunt",
    externalId: `item-${index}`,
    sourceUrl: `https://www.producthunt.com/posts/item-${index}`,
    sourceName: "Product Hunt",
    name: `AI Item ${index}`,
    description: "An AI assistant for focused product teams.",
    websiteUrl: `https://item-${index}.example.com`,
    announcedAt: NOW,
    score: index,
    metadata: { topics: ["Artificial Intelligence"] },
    ...overrides,
  };
}

function fakePersistence(): {
  persistence: DailyFeedPersistence;
  persisted: string[];
  completed: { localDate: string; sourceResults: Record<string, unknown> } | null;
  ranked: { identity: string; rank: number }[];
  evidence: Map<string, EvidenceRecord>;
  evidenceRefreshedAt: Date | null;
  snapshots: SelectionSnapshot[];
} {
  const persisted: string[] = [];
  let completed: { localDate: string; sourceResults: Record<string, unknown> } | null = null;
  const ranked: { identity: string; rank: number }[] = [];
  const evidence = new Map<string, EvidenceRecord>();
  let evidenceRefreshedAt: Date | null = null;
  const snapshots: SelectionSnapshot[] = [];

  return {
    persisted,
    get completed() {
      return completed;
    },
    ranked,
    evidence,
    get evidenceRefreshedAt() {
      return evidenceRefreshedAt;
    },
    snapshots,
    persistence: {
      getRun: async () => null,
      startRun: async () => {},
      persistCandidates: async (groups) => {
        const ids = new Map<string, string>();
        for (const group of groups) {
          for (const item of group.items) persisted.push(item.externalId);
          ids.set(group.identity, `product-${group.identity}`);
        }
        return ids;
      },
      persistEvidence: async (records, _productIds, _groups, refreshedAt) => {
        evidenceRefreshedAt = refreshedAt;
        for (const [identity, record] of records) evidence.set(identity, record);
      },
      persistDailySelection: async (entries, records) => {
        ranked.push(...entries);
        snapshots.push(...records);
      },
      loadArchiveRediscoveries: async () => [],
      completeRun: async (input) => {
        completed = { localDate: input.localDate, sourceResults: input.sourceResults };
      },
      failRun: async () => {},
    },
  };
}

function dependencies(input: {
  candidates: SourceCandidate[];
  rank: DailyFeedDependencies["rank"];
  persistence: DailyFeedPersistence;
  now?: DailyFeedDependencies["now"];
  enrichEvidence?: DailyFeedDependencies["enrichEvidence"];
  discoveryBudget?: DiscoveryBudgetRepository;
}): DailyFeedDependencies {
  return {
    now: input.now || (() => NOW),
    collect: async () => [{ key: "product_hunt", candidates: input.candidates, error: null }],
    persistence: input.persistence,
    rank: input.rank,
    enrichEvidence: input.enrichEvidence,
    discoveryBudget: input.discoveryBudget || new InMemoryDiscoveryBudgetRepository(),
  };
}

test("pre-scoring uses stable source-relative traction and the 45/35/20 weights", () => {
  const groups = [
    candidate(1),
    candidate(2),
    candidate(3, { score: 9 }),
    candidate(4, { score: 0 }),
  ].map((item) => ({ identity: item.externalId, items: [item] }));
  groups[1]!.items[0]!.score = 1;

  const scored = scoreDailyCandidates(groups, {
    now: NOW,
    evidenceConfidence: (group) => group.identity === "item-3" ? 0.5 : 0,
  });
  const byIdentity = new Map(scored.map((group) => [group.identity, group]));

  assert.equal(byIdentity.get("item-1")?.score.sourceRelativeTraction, 0.5);
  assert.equal(byIdentity.get("item-2")?.score.sourceRelativeTraction, 0.5);
  assert.equal(byIdentity.get("item-3")?.score.sourceRelativeTraction, 1);
  assert.equal(byIdentity.get("item-4")?.score.sourceRelativeTraction, 0);
  assert.equal(byIdentity.get("item-3")?.score.preScore, 0.825);
});

test("Daily Feed persists official evidence and scores its confidence before ranking", async () => {
  const items = [candidate(1), candidate(2)];
  const fake = fakePersistence();
  const highConfidence: EvidenceRecord = {
    factualSummary: "A research assistant.", primaryUseCase: "research", audience: "teams", productType: "assistant",
    officialEvidenceUrl: "https://item-1.example.com", supportingExcerpts: [], confidence: "high", conflicts: [],
  };

  const result = await runDailyFeed(dependencies({
    candidates: items,
    persistence: fake.persistence,
    enrichEvidence: async () => new Map([["name:ai-item-1", highConfidence]]),
    rank: async (groups) => groups.map((group) => group.identity),
  }));

  assert.equal(fake.evidence.get("name:ai-item-1"), highConfidence);
  assert.equal(fake.evidenceRefreshedAt, NOW);
  assert.equal(result.selected.find((group) => group.identity === "name:ai-item-1")?.score.evidenceConfidence, 1);
  assert.equal(fake.snapshots.length, 2);
  const snapshot = fake.snapshots.find((item) => item.productId === "product-name:ai-item-1");
  assert.equal(snapshot?.acceptedEvidence.factualSummary, "A research assistant.");
  assert.equal(snapshot?.provenance, "model");
});

test("Daily Feed persists every eligible mention before bounded selection", async () => {
  const items = Array.from({ length: 110 }, (_, index) => candidate(index));
  const fake = fakePersistence();
  let shortlist: string[] = [];

  const result = await runDailyFeed(dependencies({
    candidates: items,
    persistence: fake.persistence,
    rank: async (groups) => {
      shortlist = groups.map((group) => group.identity);
      return [shortlist.at(-1)!, shortlist.at(-2)!];
    },
  }));

  assert.equal(fake.persisted.length, 110);
  assert.equal(shortlist.length, MAX_CANDIDATE_SHORTLIST);
  assert.equal(result.selectedProducts, MAX_DAILY_FEED);
  assert.deepEqual(result.selected.map((group) => group.identity).slice(0, 2), [shortlist.at(-1), shortlist.at(-2)]);
  assert.equal(fake.ranked.length, MAX_DAILY_FEED);
  assert.ok(fake.completed);
  assert.equal(result.status, "complete");
});

test("Daily Feed completes with deterministic fallback after provider failure or invalid output", async () => {
  const items = [candidate(1), candidate(9), candidate(3)];
  const providerFailures: DailyFeedDependencies["rank"][] = [
    async () => {
      throw new Error("provider unavailable");
    },
    async () => ["unknown-product"],
    async () => ["name:ai-item-9", "name:ai-item-9"],
  ];

  for (const rank of providerFailures) {
    const fake = fakePersistence();
    const result = await runDailyFeed(dependencies({ candidates: items, persistence: fake.persistence, rank }));

    assert.equal(result.status, "complete");
    assert.equal(result.ranking, "fallback");
    assert.deepEqual(result.selected.map((group) => group.identity), ["name:ai-item-9", "name:ai-item-3", "name:ai-item-1"]);
    assert.ok(fake.completed);
  }
});

test("a qualified archive rediscovery is selected and recorded as a rediscovery", async () => {
  const fake = fakePersistence();
  const archive = candidate(99, { announcedAt: new Date("2026-07-01T19:00:00.000Z") });
  fake.persistence.loadArchiveRediscoveries = async () => [{
    productId: "archive-product",
    group: { identity: "name:ai-item-99", items: [archive] },
    lastSelectedAt: new Date("2026-08-01T19:00:00.000Z"),
    evidenceRefreshedAt: new Date("2026-09-20T19:00:00.000Z"),
  }];

  const result = await runDailyFeed(dependencies({
    candidates: [candidate(1)],
    persistence: fake.persistence,
    enrichEvidence: async () => new Map([["name:ai-item-99", {
      factualSummary: "An AI assistant for teams, with a new workflow.", primaryUseCase: "research", audience: "teams", productType: "assistant",
      officialEvidenceUrl: "https://item-99.example.com", supportingExcerpts: ["Official launch details"], confidence: "high", conflicts: [],
    }]]),
    rank: async (groups) => ["name:ai-item-99", ...groups.map((group) => group.identity).filter((id) => id !== "name:ai-item-99")],
  }));

  assert.equal(result.selected[0]?.identity, "name:ai-item-99");
  assert.equal(fake.snapshots.find((snapshot) => snapshot.productId === "archive-product")?.rediscovery, true);
  assert.equal(fake.snapshots.find((snapshot) => snapshot.productId === "archive-product")?.rediscoveryReason, "refreshed_official_evidence");
});

test("an archive-only product can qualify through newly refreshed official evidence", async () => {
  const fake = fakePersistence();
  const lastSelectedAt = new Date("2026-08-20T19:00:00.000Z");
  const refreshedEvidence: EvidenceRecord = {
    factualSummary: "A research assistant.", primaryUseCase: "research", audience: "teams", productType: "assistant",
    officialEvidenceUrl: "https://item-99.example.com", supportingExcerpts: ["Official product summary."], confidence: "high", conflicts: [],
  };
  fake.persistence.loadArchiveRediscoveries = async () => [{
    productId: "archive-product",
    group: { identity: "name:ai-item-99", items: [candidate(99)] },
    lastSelectedAt,
    evidenceRefreshedAt: lastSelectedAt,
    latestQualifyingMentionAt: lastSelectedAt,
  }];

  const result = await runDailyFeed({
    ...dependencies({
      candidates: [],
      persistence: fake.persistence,
      rank: async (groups) => groups.map((group) => group.identity),
    }),
    enrichEvidence: async (groups) => new Map(groups.map((group) => [group.identity, refreshedEvidence])),
  });

  assert.equal(result.selected[0]?.identity, "name:ai-item-99");
  assert.equal(fake.snapshots.find((snapshot) => snapshot.productId === "archive-product")?.rediscovery, true);
  assert.equal(fake.evidenceRefreshedAt, NOW);
});

test("archive-only official refreshes are capped to the daily rediscovery budget", async () => {
  const fake = fakePersistence();
  const refreshedEvidence: EvidenceRecord = {
    factualSummary: "A research assistant.", primaryUseCase: "research", audience: "teams", productType: "assistant",
    officialEvidenceUrl: "https://example.com", supportingExcerpts: ["Official product summary."], confidence: "high", conflicts: [],
  };
  const storedEvidence: EvidenceRecord = {
    factualSummary: "A previously verified research assistant.", primaryUseCase: "research", audience: "teams", productType: "assistant",
    officialEvidenceUrl: "https://verified.example.com", supportingExcerpts: ["Previously accepted official summary."], confidence: "high", conflicts: [],
  };
  const archives = [1, 2, 3, 4].map((index) => {
    const lastSelectedAt = new Date(`2026-08-${String(10 + index).padStart(2, "0")}T19:00:00.000Z`);
    return {
      productId: `archive-product-${index}`,
      group: { identity: `name:ai-item-${index + 90}`, items: [candidate(index + 90)] },
      lastSelectedAt,
      evidenceRefreshedAt: index === 4 ? new Date("2026-09-01T19:00:00.000Z") : lastSelectedAt,
      latestQualifyingMentionAt: lastSelectedAt,
      evidence: index === 4 ? storedEvidence : null,
    };
  });
  fake.persistence.loadArchiveRediscoveries = async () => archives;
  let refreshedIdentities: string[] = [];

  const result = await runDailyFeed({
    ...dependencies({
      candidates: [],
      persistence: fake.persistence,
      rank: async (groups) => [...groups].sort((left, right) => Number(right.identity.endsWith("94")) - Number(left.identity.endsWith("94"))).map((group) => group.identity),
    }),
    enrichEvidence: async (groups) => {
      refreshedIdentities = groups.map((group) => group.identity);
      return new Map(groups.map((group) => [group.identity, refreshedEvidence]));
    },
  });

  assert.equal(refreshedIdentities.length, 3);
  assert.equal(result.selectedProducts, 3);
  assert.equal(fake.snapshots.find((snapshot) => snapshot.productId === "archive-product-4")?.acceptedEvidence.factualSummary, storedEvidence.factualSummary);
});

test("a previously selected current-batch product cannot bypass the rediscovery cooldown", async () => {
  const fake = fakePersistence();
  fake.persistence.loadArchiveRediscoveries = async () => [{
    productId: "selected-product",
    group: { identity: "name:ai-item-1", items: [candidate(1)] },
    lastSelectedAt: new Date("2026-09-15T19:00:00.000Z"),
    latestQualifyingMentionAt: new Date("2026-09-10T19:00:00.000Z"),
  }];

  const result = await runDailyFeed(dependencies({
    candidates: [candidate(1)],
    persistence: fake.persistence,
    rank: async (groups) => groups.map((group) => group.identity),
  }));

  assert.equal(result.selected.some((group) => group.identity === "name:ai-item-1"), false);
  assert.equal(fake.snapshots.some((snapshot) => snapshot.productId === "selected-product"), false);
});

test("snapshots retain low-confidence evidence and an honest two-clause reason when enrichment fails", async () => {
  const fake = fakePersistence();

  await runDailyFeed(dependencies({
    candidates: [candidate(1)],
    persistence: fake.persistence,
    enrichEvidence: async () => { throw new Error("retrieval unavailable"); },
    rank: async (groups) => groups.map((group) => group.identity),
  }));

  const snapshot = fake.snapshots[0]!;
  assert.equal(snapshot.acceptedEvidence.confidence, "low");
  assert.equal(snapshot.rankingReason, "Observed on Product Hunt; official product details remain incomplete.");
  assert.equal(snapshot.rankingReason.split("; ").length, 2);
});

test("Daily Feed completes with deterministic scoring when evidence enrichment fails", async () => {
  const fake = fakePersistence();
  const result = await runDailyFeed(dependencies({
    candidates: [candidate(1)],
    persistence: fake.persistence,
    enrichEvidence: async () => {
      throw new Error("DeepSeek unavailable");
    },
    rank: async (groups) => groups.map((group) => group.identity),
  }));

  assert.equal(result.status, "complete");
  assert.equal(result.selectedProducts, 1);
  assert.equal(result.selected[0]?.score.evidenceConfidence, 0.8);
  assert.ok(fake.completed);
});

test("Daily Feed completes with the deterministic Evidence Record when the monthly budget is exhausted", async () => {
  const fake = fakePersistence();
  const budget = new InMemoryDiscoveryBudgetRepository({ capMicros: 0 });
  let modelCalls = 0;
  const baseRecord: EvidenceRecord = {
    factualSummary: "A source-grounded summary.",
    primaryUseCase: null,
    audience: null,
    productType: null,
    officialEvidenceUrl: "https://item-1.example.com",
    supportingExcerpts: ["The official product page has a short description."],
    confidence: "low",
    conflicts: [],
  };

  const result = await runDailyFeed(dependencies({
    candidates: [candidate(1)],
    persistence: fake.persistence,
    enrichEvidence: async (groups) => new Map(await Promise.all(groups.map(async (group) => [
      group.identity,
      await enrichEvidenceWithDeepSeek(
        { name: group.items[0]!.name, officialEvidenceUrl: baseRecord.officialEvidenceUrl },
        baseRecord,
        {
          now: () => NOW,
          budget,
          extract: async () => {
            modelCalls += 1;
            return { output: {} };
          },
        },
      ),
    ] as const))),
    rank: async (groups) => groups.map((group) => group.identity),
  }));

  assert.equal(result.status, "complete");
  assert.equal(modelCalls, 0);
  assert.deepEqual(fake.evidence.get("name:ai-item-1"), baseRecord);
  assert.equal(result.selected[0]?.score.evidenceConfidence, 0.25);
  assert.ok(fake.completed);
});

test("Daily Feed reserves budget before ranking and records provider token usage", async () => {
  const fake = fakePersistence();
  const budget = new InMemoryDiscoveryBudgetRepository();
  const result = await runDailyFeed(dependencies({
    candidates: [candidate(1), candidate(2)],
    persistence: fake.persistence,
    discoveryBudget: budget,
    rank: async (groups) => {
      assert.equal(budget.requests.length, 1);
      assert.equal(budget.requests[0]?.operation, "ranking");
      return {
        productIds: groups.map((group) => group.identity),
        usage: { inputTokens: 150, outputTokens: 40 },
      };
    },
  }));

  assert.equal(result.ranking, "provider");
  assert.equal(budget.requests[0]?.outcome, "completed");
  assert.equal(budget.requests[0]?.inputTokens, 150);
  assert.equal(budget.requests[0]?.outputTokens, 40);
});

test("Daily Feed skips model ranking and completes deterministically when the monthly budget is exhausted", async () => {
  const fake = fakePersistence();
  const budget = new InMemoryDiscoveryBudgetRepository({ capMicros: 0 });
  let modelCalls = 0;
  const result = await runDailyFeed(dependencies({
    candidates: [candidate(1), candidate(2)],
    persistence: fake.persistence,
    discoveryBudget: budget,
    rank: async (groups) => {
      modelCalls += 1;
      return groups.map((group) => group.identity);
    },
  }));

  assert.equal(modelCalls, 0);
  assert.equal(result.status, "complete");
  assert.equal(result.ranking, "fallback");
  assert.deepEqual(result.selected.map((group) => group.identity), ["name:ai-item-2", "name:ai-item-1"]);
  assert.equal(budget.requests.length, 0);
  assert.ok(fake.completed);
});

test("ranking budget uses the month in which its model request is reserved", async () => {
  const fake = fakePersistence();
  const budget = new InMemoryDiscoveryBudgetRepository();
  let clockCalls = 0;
  const dates = [
    new Date("2026-09-30T23:59:59.900Z"),
    new Date("2026-10-01T00:00:00.100Z"),
    new Date("2026-10-01T00:00:01.000Z"),
  ];
  await runDailyFeed(dependencies({
    now: () => dates[clockCalls++] || dates[2]!,
    candidates: [candidate(1), candidate(2)],
    persistence: fake.persistence,
    discoveryBudget: budget,
    rank: async (groups) => ({ productIds: groups.map((group) => group.identity) }),
  }));

  assert.equal(budget.requests[0]?.month, "2026-10");
});
