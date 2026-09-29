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
});

test("rediscovery and diversity policies preserve the highest order without quotas", () => {
  const selected = applyRediscoveryAndSoftDiversity([
    { productId: "fresh-a", deterministicScore: 0.95, similarityKey: "assistants", rediscovery: false },
    { productId: "rediscovery-a", deterministicScore: 0.94, similarityKey: "research", rediscovery: true },
    { productId: "fresh-b", deterministicScore: 0.93, similarityKey: "assistants", rediscovery: false },
    { productId: "rediscovery-b", deterministicScore: 0.92, similarityKey: "models", rediscovery: true },
    { productId: "rediscovery-c", deterministicScore: 0.91, similarityKey: "coding", rediscovery: true },
    { productId: "rediscovery-d", deterministicScore: 0.9, similarityKey: "video", rediscovery: true },
  ], 5);

  assert.deepEqual(selected.map((item) => item.productId), ["fresh-a", "rediscovery-a", "rediscovery-b", "rediscovery-c", "fresh-b"]);
  assert.equal(selected.filter((item) => item.rediscovery).length, 3);
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
    provenance: "fallback",
  });

  (snapshot.acceptedEvidence as { summary: string }).summary = "changed";
  assert.equal((await repository.list())[0]?.acceptedEvidence.summary, "Official fact");

  assert.equal(await cleanupExpiredSelectionSnapshots(repository, new Date("2026-09-29T19:00:00.000Z")), 1);
  assert.deepEqual(await repository.list(), []);
});
