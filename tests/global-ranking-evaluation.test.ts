import assert from "node:assert/strict";
import test from "node:test";
import {
  currentGlobalRankingReleaseDecision,
  decideGlobalRankingRelease,
  evaluateGlobalRankingFixtures,
  type GlobalRankingEvaluationFixture,
} from "../lib/global-ranking-evaluation";
import { globalRankingEvaluationFixtures } from "../lib/global-ranking-evaluation-fixtures";

const EVALUATED_AT = new Date("2026-09-30T18:00:00.000Z");

function fixture(
  productId: string,
  scores: [number, number, number, number, number],
): GlobalRankingEvaluationFixture {
  const [freshness, credibility, usefulness, diversity, explanationAccuracy] = scores;
  return {
    snapshot: {
      productId,
      selectedAt: new Date("2026-09-29T19:00:00.000Z"),
      rank: 1,
      freshness: 0.9,
      evidenceConfidence: 0.8,
      deterministicScore: 0.85,
      sourceRelativeTraction: 0.7,
      acceptedEvidence: {
        factualSummary: "An AI research assistant for product teams.",
        primaryUseCase: "research",
        audience: "product teams",
        productType: "assistant",
        officialEvidenceUrl: "https://example.test/product",
        supportingExcerpts: ["Officially described as a research assistant."],
        confidence: "high",
        conflicts: [],
      },
      rankingReason: "Officially described as a research assistant; built for product teams.",
      rediscovery: false,
      rediscoveryReason: null,
      provenance: "fallback",
    },
    assessment: {
      freshness: { score: freshness, note: "The dated source observation is recent." },
      credibility: { score: credibility, note: "Official evidence supports the product claim." },
      usefulness: { score: usefulness, note: "The stated use case is concrete." },
      diversity: { score: diversity, note: "The item adds a distinct use case to the sample." },
      explanationAccuracy: { score: explanationAccuracy, note: "Both clauses match accepted evidence." },
    },
  };
}

test("fixed snapshot fixtures produce a deterministic five-criterion scorecard", () => {
  const fixtures = [
    fixture("product-a", [5, 4, 4, 5, 5]),
    fixture("product-b", [3, 5, 3, 4, 4]),
  ];

  const scorecard = evaluateGlobalRankingFixtures(fixtures, { evaluatedAt: EVALUATED_AT });
  const repeated = evaluateGlobalRankingFixtures(fixtures, { evaluatedAt: EVALUATED_AT });

  assert.deepEqual(scorecard, repeated);
  assert.equal(scorecard.criteria.freshness.meanScore, 4);
  assert.equal(scorecard.criteria.freshness.positive, true);
  assert.equal(Object.keys(scorecard.criteria).length, 5);
  assert.equal(scorecard.snapshotReferences.length, 2);
  assert.equal(JSON.stringify(scorecard).includes("chainOfThought"), false);
});

test("representative scorecard remains readable without exposing private evidence fields", () => {
  const scorecard = evaluateGlobalRankingFixtures(globalRankingEvaluationFixtures, { evaluatedAt: EVALUATED_AT });
  const encoded = JSON.stringify(scorecard);

  assert.equal(scorecard.sampleSize, 5);
  assert.equal(scorecard.fixtureType, "representative");
  assert.match(scorecard.limitations[0]!, /not captured production history/);
  assert.equal(scorecard.eligibleForApproval, true);
  assert.equal(encoded.includes("chainOfThought"), false);
  assert.ok(scorecard.snapshotReferences.every((reference) => reference.snapshot.rankingReason));
});

test("production release gate is fail-closed when approval configuration is absent or incomplete", () => {
  assert.equal(currentGlobalRankingReleaseDecision({}).enabled, false);
  assert.equal(currentGlobalRankingReleaseDecision({
    GLOBAL_DISCOVERY_RANKING_APPROVED_SCORECARD_ID: "gdr-known",
    GLOBAL_DISCOVERY_RANKING_APPROVED_BY: "product-owner",
  }).enabled, false);
});

test("release eligibility requires at least four positive criteria and explicit approval tied to this scorecard", () => {
  const scorecard = evaluateGlobalRankingFixtures([
    fixture("product-a", [5, 4, 4, 5, 5]),
    fixture("product-b", [3, 5, 3, 4, 4]),
  ], { evaluatedAt: EVALUATED_AT });

  const notApproved = decideGlobalRankingRelease(scorecard, null);
  assert.equal(notApproved.enabled, false);
  assert.equal(notApproved.reason, "explicit_product_approval_required");

  const approved = decideGlobalRankingRelease(scorecard, {
    scorecardId: scorecard.id,
    approvedBy: "product-owner",
    approvedAt: new Date("2026-09-30T18:01:00.000Z"),
  });
  assert.equal(approved.enabled, true);
  assert.equal(approved.scorecardId, scorecard.id);
  assert.deepEqual(approved.positiveCriteria, ["freshness", "credibility", "diversity", "explanationAccuracy"]);
});

test("insufficient score, stale approval, or approval for another scorecard cannot enable ranking", () => {
  const scorecard = evaluateGlobalRankingFixtures([
    fixture("product-a", [5, 2, 2, 3, 4]),
  ], { evaluatedAt: EVALUATED_AT });
  const approval = {
    scorecardId: scorecard.id,
    approvedBy: "product-owner",
    approvedAt: new Date("2026-10-01T18:01:00.000Z"),
  };

  assert.equal(decideGlobalRankingRelease(scorecard, approval).enabled, false);
  assert.equal(decideGlobalRankingRelease(scorecard, approval).reason, "insufficient_positive_criteria");
  assert.equal(decideGlobalRankingRelease(scorecard, {
    ...approval,
    scorecardId: "another-scorecard",
  }).enabled, false);
  assert.equal(decideGlobalRankingRelease(scorecard, {
    ...approval,
    approvedAt: new Date("2026-09-30T17:59:00.000Z"),
  }).enabled, false);
});

test("evaluation rejects duplicate snapshots and out-of-rubric scores", () => {
  const first = fixture("product-a", [5, 4, 4, 5, 5]);
  const duplicate = fixture("product-a", [5, 4, 4, 5, 5]);
  assert.throws(() => evaluateGlobalRankingFixtures([first, duplicate], { evaluatedAt: EVALUATED_AT }), /unique Products/);

  const invalid = fixture("product-b", [5, 4, 4, 5, 5]);
  invalid.assessment.usefulness.score = 6;
  assert.throws(() => evaluateGlobalRankingFixtures([invalid], { evaluatedAt: EVALUATED_AT }), /between 1 and 5/);
});
