import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRediscoveryAndSoftDiversity,
  cleanupExpiredSelectionSnapshots,
  InMemorySelectionSnapshotRepository,
  qualifyRediscovery,
} from "../lib/selection-snapshots";

const RUN_DATE = new Date("2026-09-29T19:00:00.000Z");

test("a prior Daily Feed product rediscovery needs a 30-day absence and new qualification", () => {
  const selectedOn = new Date("2026-08-30T19:00:00.000Z");

  assert.deepEqual(
    qualifyRediscovery(
      {
        productId: "product-a",
        lastSelectedAt: selectedOn,
        evidenceRefreshedAt: new Date("2026-09-28T19:00:00.000Z"),
      },
      RUN_DATE,
    ),
    { qualified: true, reason: "refreshed_official_evidence" },
  );

  assert.deepEqual(
    qualifyRediscovery(
      {
        productId: "product-a",
        lastSelectedAt: selectedOn,
        latestQualifyingMentionAt: new Date("2026-09-10T19:00:00.000Z"),
      },
      RUN_DATE,
    ),
    { qualified: true, reason: "new_qualifying_product_mention" },
  );

  assert.deepEqual(
    qualifyRediscovery(
      {
        productId: "product-a",
        lastSelectedAt: new Date("2026-09-01T19:00:00.000Z"),
        evidenceRefreshedAt: new Date("2026-09-28T19:00:00.000Z"),
      },
      RUN_DATE,
    ),
    { qualified: false },
  );

  assert.deepEqual(
    qualifyRediscovery(
      {
        productId: "product-a",
        lastSelectedAt: selectedOn,
        evidenceRefreshedAt: selectedOn,
      },
      RUN_DATE,
    ),
    { qualified: false },
  );

  assert.deepEqual(
    qualifyRediscovery(
      {
        productId: "product-a",
        lastSelectedAt: selectedOn,
        // Reobserving the same source item does not make its first-seen time new.
        latestQualifyingMentionAt: selectedOn,
      },
      RUN_DATE,
    ),
    { qualified: false },
  );
});

test("rediscovery and diversity policies preserve the highest order without quotas", () => {
  const selected = applyRediscoveryAndSoftDiversity([
    { productId: "fresh-a", deterministicScore: 0.95, similarityTokens: ["assistant"], rediscovery: false },
    { productId: "rediscovery-a", deterministicScore: 0.94, similarityTokens: ["research"], rediscovery: true },
    { productId: "fresh-b", deterministicScore: 0.93, similarityTokens: ["assistant"], rediscovery: false },
    { productId: "rediscovery-b", deterministicScore: 0.92, similarityTokens: ["models"], rediscovery: true },
    { productId: "rediscovery-c", deterministicScore: 0.91, similarityTokens: ["coding"], rediscovery: true },
    { productId: "rediscovery-d", deterministicScore: 0.9, similarityTokens: ["video"], rediscovery: true },
  ], 5);

  assert.deepEqual(selected.map((item) => item.productId), ["fresh-a", "rediscovery-a", "rediscovery-b", "rediscovery-c", "fresh-b"]);
  assert.equal(selected.filter((item) => item.rediscovery).length, 3);
});

test("soft diversity defers only lexically near-identical products with comparable scores", () => {
  const selected = applyRediscoveryAndSoftDiversity([
    { productId: "research-one", deterministicScore: 0.9, similarityTokens: ["ai", "research", "assistant", "papers", "citations"], rediscovery: false },
    { productId: "near-duplicate", deterministicScore: 0.89, similarityTokens: ["ai", "research", "assistant", "papers", "citations"], rediscovery: false },
    { productId: "same-category-different-product", deterministicScore: 0.88, similarityTokens: ["ai", "coding", "agent", "repository", "tests"], rediscovery: false },
  ], 2);

  assert.deepEqual(selected.map((item) => item.productId), ["research-one", "same-category-different-product"]);
});

test("soft diversity catches near-duplicates with slightly different wording", () => {
  const sharedTokens = ["ai", "research", "assistant", "for", "teams", "that", "summarizes", "papers", "and", "extracts", "key", "findings", "with", "citations", "source", "links", "and", "collaboration", "tools"];
  const selected = applyRediscoveryAndSoftDiversity([
    { productId: "research-assistant", deterministicScore: 0.9, similarityTokens: [...sharedTokens, "workflow"], rediscovery: false },
    { productId: "research-copilot", deterministicScore: 0.89, similarityTokens: [...sharedTokens, "workspace"], rediscovery: false },
    { productId: "coding-agent", deterministicScore: 0.88, similarityTokens: ["ai", "coding", "agent", "repository", "tests"], rediscovery: false },
  ], 2);

  assert.deepEqual(selected.map((item) => item.productId), ["research-assistant", "coding-agent"]);
});

test("selection snapshots are immutable and expire after one year", async () => {
  const repository = new InMemorySelectionSnapshotRepository();
  const selectedAt = new Date("2025-09-28T19:00:00.000Z");
  const snapshot = await repository.append({
    productId: "product-a",
    selectedAt,
    rank: 1,
    freshness: 0.9,
    evidenceConfidence: 0.8,
    deterministicScore: 0.91,
    sourceRelativeTraction: 0.8,
    acceptedEvidence: { summary: "Official fact" },
    rankingReason: "Officially described as a tool; its stated primary use case is research.",
    rediscovery: false,
    rediscoveryReason: null,
    provenance: "fallback",
  });

  (snapshot.acceptedEvidence as { summary: string }).summary = "changed";
  assert.equal((await repository.list())[0]?.acceptedEvidence.summary, "Official fact");

  assert.equal(await cleanupExpiredSelectionSnapshots(repository, new Date("2026-09-29T19:00:00.000Z")), 1);
  assert.deepEqual(await repository.list(), []);
});
