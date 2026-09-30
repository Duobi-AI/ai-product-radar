import { createHash } from "node:crypto";
import type { SelectionSnapshot } from "@/lib/selection-snapshots";
import { globalRankingEvaluationFixtures } from "@/lib/global-ranking-evaluation-fixtures";

export const GLOBAL_RANKING_SCORECARD_EVALUATED_AT = "2026-09-30T09:15:21.000Z";

export const GLOBAL_RANKING_EVALUATION_CRITERIA = [
  "freshness",
  "credibility",
  "usefulness",
  "diversity",
  "explanationAccuracy",
] as const;

export type GlobalRankingEvaluationCriterion = (typeof GLOBAL_RANKING_EVALUATION_CRITERIA)[number];
export const REQUIRED_POSITIVE_CRITERIA = 4;
export const POSITIVE_SCORE_THRESHOLD = 4;

export type GlobalRankingEvaluationFixture = {
  snapshot: SelectionSnapshot;
  assessment: Record<GlobalRankingEvaluationCriterion, { score: number; note: string }>;
};

export type GlobalRankingEvaluationScorecard = {
  id: string;
  evaluatedAt: string;
  fixtureType: "representative";
  limitations: string[];
  sampleSize: number;
  requiredPositiveCriteria: number;
  positiveCriteria: GlobalRankingEvaluationCriterion[];
  eligibleForApproval: boolean;
  criteria: Record<GlobalRankingEvaluationCriterion, {
    meanScore: number;
    positive: boolean;
    assessments: { snapshotId: string; score: number; note: string }[];
  }>;
  snapshotReferences: {
    snapshotId: string;
    productId: string;
    snapshot: Omit<SelectionSnapshot, "acceptedEvidence"> & { acceptedEvidence: Record<string, unknown> };
  }[];
};

export type GlobalRankingProductApproval = {
  scorecardId: string;
  approvedBy: string;
  approvedAt: Date;
};

export type GlobalRankingReleaseDecision = {
  enabled: boolean;
  reason:
    | "insufficient_evaluation_fixtures"
    | "insufficient_positive_criteria"
    | "explicit_product_approval_required"
    | "approval_scorecard_mismatch"
    | "approval_predates_scorecard"
    | "approved";
  scorecardId: string;
  positiveCriteria: GlobalRankingEvaluationCriterion[];
  requiredPositiveCriteria: number;
  approval: { approvedBy: string; approvedAt: string } | null;
};

function roundedMean(scores: number[]) {
  if (!scores.length) return 0;
  return Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 100) / 100;
}

function reviewableEvidence(value: Record<string, unknown>) {
  const fields = [
    "factualSummary",
    "primaryUseCase",
    "audience",
    "productType",
    "officialEvidenceUrl",
    "supportingExcerpts",
    "confidence",
    "conflicts",
  ];
  return Object.fromEntries(fields.flatMap((field) => field in value ? [[field, structuredClone(value[field])]] : []));
}

function snapshotReference(snapshot: SelectionSnapshot) {
  const publicSnapshot = {
    ...snapshot,
    acceptedEvidence: reviewableEvidence(snapshot.acceptedEvidence),
  };
  const snapshotId = createHash("sha256")
    .update(JSON.stringify(publicSnapshot))
    .digest("hex")
    .slice(0, 16);
  return { snapshotId, productId: snapshot.productId, snapshot: publicSnapshot };
}

/** Score a fixed, human-assessed snapshot set without consulting live sources or model providers. */
export function evaluateGlobalRankingFixtures(
  fixtures: readonly GlobalRankingEvaluationFixture[],
  options: { evaluatedAt: Date },
): GlobalRankingEvaluationScorecard {
  const productIds = new Set<string>();
  for (const fixture of fixtures) {
    if (productIds.has(fixture.snapshot.productId)) {
      throw new Error(`Evaluation fixtures must reference unique Products: ${fixture.snapshot.productId}`);
    }
    productIds.add(fixture.snapshot.productId);
    for (const criterion of GLOBAL_RANKING_EVALUATION_CRITERIA) {
      const assessment = fixture.assessment[criterion];
      if (!Number.isFinite(assessment.score) || assessment.score < 1 || assessment.score > 5) {
        throw new Error(`Evaluation score for ${criterion} must be between 1 and 5`);
      }
      if (!assessment.note.trim()) throw new Error(`Evaluation note for ${criterion} cannot be empty`);
    }
  }
  const references = fixtures.map(({ snapshot }) => snapshotReference(snapshot));
  const referenceByProductId = new Map(references.map((reference) => [reference.productId, reference]));
  const criteria = Object.fromEntries(GLOBAL_RANKING_EVALUATION_CRITERIA.map((criterion) => {
    const assessments = fixtures.map((fixture) => ({
      snapshotId: referenceByProductId.get(fixture.snapshot.productId)!.snapshotId,
      score: fixture.assessment[criterion].score,
      note: fixture.assessment[criterion].note.trim(),
    }));
    const meanScore = roundedMean(assessments.map((assessment) => assessment.score));
    return [criterion, { meanScore, positive: meanScore >= POSITIVE_SCORE_THRESHOLD, assessments }];
  })) as GlobalRankingEvaluationScorecard["criteria"];
  const positiveCriteria = GLOBAL_RANKING_EVALUATION_CRITERIA.filter((criterion) => criteria[criterion].positive);
  const evaluatedAt = options.evaluatedAt.toISOString();
  const context = {
    evaluatedAt,
    fixtureType: "representative" as const,
    limitations: [
      "Fixtures are synthetic representative examples, not captured production history.",
      "Criterion ratings are explicit rubric assessments and require product review before approval.",
    ],
    sampleSize: fixtures.length,
    requiredPositiveCriteria: REQUIRED_POSITIVE_CRITERIA,
    positiveCriteria,
    criteria,
    snapshotReferences: references,
  };
  const id = "gdr-" + createHash("sha256").update(JSON.stringify(context)).digest("hex").slice(0, 16);
  return {
    id,
    ...context,
    eligibleForApproval: fixtures.length > 0 && positiveCriteria.length >= REQUIRED_POSITIVE_CRITERIA,
  };
}

/** Fail closed unless the passing scorecard has a later, explicit, attributable product approval. */
export function decideGlobalRankingRelease(
  scorecard: GlobalRankingEvaluationScorecard,
  approval: GlobalRankingProductApproval | null,
): GlobalRankingReleaseDecision {
  let reason: GlobalRankingReleaseDecision["reason"];
  if (scorecard.sampleSize === 0) reason = "insufficient_evaluation_fixtures";
  else if (!scorecard.eligibleForApproval) reason = "insufficient_positive_criteria";
  else if (!approval || !approval.approvedBy.trim()) reason = "explicit_product_approval_required";
  else if (approval.scorecardId !== scorecard.id) reason = "approval_scorecard_mismatch";
  else if (!Number.isFinite(approval.approvedAt.getTime()) || approval.approvedAt.getTime() <= Date.parse(scorecard.evaluatedAt)) {
    reason = "approval_predates_scorecard";
  } else reason = "approved";

  const approved = reason === "approved" && approval !== null;
  return {
    enabled: approved,
    reason,
    scorecardId: scorecard.id,
    positiveCriteria: [...scorecard.positiveCriteria],
    requiredPositiveCriteria: scorecard.requiredPositiveCriteria,
    approval: approved ? { approvedBy: approval.approvedBy.trim(), approvedAt: approval.approvedAt.toISOString() } : null,
  };
}

/** Read an explicit operator-provided approval. Empty or partial configuration is never approval. */
export function globalRankingApprovalFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GlobalRankingProductApproval | null {
  const scorecardId = environment.GLOBAL_DISCOVERY_RANKING_APPROVED_SCORECARD_ID?.trim();
  const approvedBy = environment.GLOBAL_DISCOVERY_RANKING_APPROVED_BY?.trim();
  const approvedAtValue = environment.GLOBAL_DISCOVERY_RANKING_APPROVED_AT?.trim();
  if (!scorecardId || !approvedBy || !approvedAtValue) return null;
  const approvedAt = new Date(approvedAtValue);
  if (!Number.isFinite(approvedAt.getTime())) return null;
  return { scorecardId, approvedBy, approvedAt };
}

export function currentGlobalRankingScorecard() {
  return evaluateGlobalRankingFixtures(globalRankingEvaluationFixtures, {
    evaluatedAt: new Date(GLOBAL_RANKING_SCORECARD_EVALUATED_AT),
  });
}

export function currentGlobalRankingReleaseDecision(environment?: Readonly<Record<string, string | undefined>>) {
  return decideGlobalRankingRelease(
    currentGlobalRankingScorecard(),
    globalRankingApprovalFromEnvironment(environment),
  );
}
