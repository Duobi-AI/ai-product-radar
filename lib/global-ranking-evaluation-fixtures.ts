import type { GlobalRankingEvaluationFixture } from "@/lib/global-ranking-evaluation";
import type { SelectionSnapshot } from "@/lib/selection-snapshots";

const selectedAt = new Date("2026-09-29T19:00:00.000Z");

function snapshot(input: {
  productId: string;
  rank: number;
  freshness: number;
  evidenceConfidence: number;
  sourceRelativeTraction: number;
  deterministicScore: number;
  summary: string;
  useCase: string;
  audience: string;
  officialUrl: string;
  excerpt: string;
  reason: string;
  rediscovery?: boolean;
}): SelectionSnapshot {
  return {
    productId: input.productId,
    selectedAt,
    rank: input.rank,
    freshness: input.freshness,
    evidenceConfidence: input.evidenceConfidence,
    deterministicScore: input.deterministicScore,
    sourceRelativeTraction: input.sourceRelativeTraction,
    acceptedEvidence: {
      factualSummary: input.summary,
      primaryUseCase: input.useCase,
      audience: input.audience,
      productType: "AI software",
      officialEvidenceUrl: input.officialUrl,
      supportingExcerpts: [input.excerpt],
      confidence: "high",
      conflicts: [],
      // Deliberately included to prove the exported scorecard omits private fields.
      chainOfThought: "This private field must never appear in the review artifact.",
    },
    rankingReason: input.reason,
    rediscovery: input.rediscovery ?? false,
    rediscoveryReason: input.rediscovery ? "refreshed_official_evidence" : null,
    provenance: "fallback",
  };
}

function assessment(input: {
  freshness: number;
  credibility: number;
  usefulness: number;
  diversity: number;
  explanationAccuracy: number;
  notes: Record<"freshness" | "credibility" | "usefulness" | "diversity" | "explanationAccuracy", string>;
}): GlobalRankingEvaluationFixture["assessment"] {
  return {
    freshness: { score: input.freshness, note: input.notes.freshness },
    credibility: { score: input.credibility, note: input.notes.credibility },
    usefulness: { score: input.usefulness, note: input.notes.usefulness },
    diversity: { score: input.diversity, note: input.notes.diversity },
    explanationAccuracy: { score: input.explanationAccuracy, note: input.notes.explanationAccuracy },
  };
}

/** Representative fixed snapshots and concise human rubric assessments; no live APIs/models. */
export const globalRankingEvaluationFixtures: GlobalRankingEvaluationFixture[] = [
  {
    snapshot: snapshot({
      productId: "product-research-assistant",
      rank: 1,
      freshness: 0.97,
      evidenceConfidence: 0.95,
      sourceRelativeTraction: 0.82,
      deterministicScore: 0.93,
      summary: "Research assistant that summarizes technical papers and preserves citations.",
      useCase: "paper research",
      audience: "research teams",
      officialUrl: "https://example.test/research-assistant",
      excerpt: "Summarize papers with cited sources and shared workspaces.",
      reason: "Officially described as a paper research assistant; it preserves cited sources.",
    }),
    assessment: assessment({
      freshness: 5, credibility: 5, usefulness: 4, diversity: 4, explanationAccuracy: 5,
      notes: {
        freshness: "Freshness component is 0.97 for this current-run observation.",
        credibility: "High-confidence official evidence includes a supporting excerpt.",
        usefulness: "Paper research is a concrete task for a named audience.",
        diversity: "Paper research is distinct from the other sampled workflows.",
        explanationAccuracy: "The official excerpt supports both public reason clauses.",
      },
    }),
  },
  {
    snapshot: snapshot({
      productId: "product-code-review",
      rank: 2,
      freshness: 0.91,
      evidenceConfidence: 0.9,
      sourceRelativeTraction: 0.76,
      deterministicScore: 0.88,
      summary: "Code review assistant that identifies risky changes in pull requests.",
      useCase: "pull request review",
      audience: "software teams",
      officialUrl: "https://example.test/code-review",
      excerpt: "Review pull requests and highlight risky changes before merge.",
      reason: "Its official site describes pull request review; it highlights risky changes.",
    }),
    assessment: assessment({
      freshness: 4, credibility: 5, usefulness: 4, diversity: 5, explanationAccuracy: 5,
      notes: {
        freshness: "Freshness component is 0.91 for this current-run observation.",
        credibility: "High-confidence evidence links the claim to the official site.",
        usefulness: "Pull request review is a concrete workflow for software teams.",
        diversity: "Code review adds a software workflow distinct from the sample's other tasks.",
        explanationAccuracy: "The official excerpt supports both public reason clauses.",
      },
    }),
  },
  {
    snapshot: snapshot({
      productId: "product-meeting-notes",
      rank: 3,
      freshness: 0.87,
      evidenceConfidence: 0.86,
      sourceRelativeTraction: 0.74,
      deterministicScore: 0.84,
      summary: "Meeting notes tool that turns team discussions into assigned follow-ups.",
      useCase: "meeting follow-up",
      audience: "project teams",
      officialUrl: "https://example.test/meeting-notes",
      excerpt: "Capture decisions and create follow-up tasks from meetings.",
      reason: "Officially described as meeting software; it turns decisions into follow-up tasks.",
    }),
    assessment: assessment({
      freshness: 4, credibility: 4, usefulness: 3, diversity: 4, explanationAccuracy: 4,
      notes: {
        freshness: "Freshness component is 0.87 for this current-run observation.",
        credibility: "Official evidence supports the described meeting follow-up function.",
        usefulness: "The product benefit is plausible, but differentiation is not clear in the excerpt.",
        diversity: "Meeting follow-up is distinct from research, coding, and image workflows.",
        explanationAccuracy: "The source supports the meeting software claim and task result.",
      },
    }),
  },
  {
    snapshot: snapshot({
      productId: "product-image-workflow",
      rank: 4,
      freshness: 0.83,
      evidenceConfidence: 0.92,
      sourceRelativeTraction: 0.69,
      deterministicScore: 0.82,
      summary: "Image workflow tool for generating consistent campaign assets.",
      useCase: "campaign asset creation",
      audience: "design teams",
      officialUrl: "https://example.test/image-workflow",
      excerpt: "Create and organize campaign images with reusable brand styles.",
      reason: "Its official page describes image creation; reusable styles support consistent campaign assets.",
    }),
    assessment: assessment({
      freshness: 4, credibility: 4, usefulness: 4, diversity: 5, explanationAccuracy: 5,
      notes: {
        freshness: "Freshness component is 0.83 for this current-run observation.",
        credibility: "The official excerpt supports image creation and reusable styles.",
        usefulness: "Campaign asset creation is a specific design-team workflow.",
        diversity: "Image generation adds a distinct modality and task to the sample.",
        explanationAccuracy: "The source supports the image-creation and consistency claims.",
      },
    }),
  },
  {
    snapshot: snapshot({
      productId: "product-data-cleanup",
      rank: 5,
      freshness: 0.78,
      evidenceConfidence: 0.78,
      sourceRelativeTraction: 0.66,
      deterministicScore: 0.76,
      summary: "Data cleanup tool that helps analysts find inconsistent rows.",
      useCase: "dataset cleanup",
      audience: "data analysts",
      officialUrl: "https://example.test/data-cleanup",
      excerpt: "Find inconsistent records and prepare datasets for analysis.",
      reason: "Officially presented as a data cleanup tool; it helps prepare datasets for analysis.",
      rediscovery: true,
    }),
    assessment: assessment({
      freshness: 5, credibility: 4, usefulness: 3, diversity: 4, explanationAccuracy: 4,
      notes: {
        freshness: "Freshness component is 0.78; the snapshot marks this as a qualified rediscovery.",
        credibility: "Refreshed official evidence supports the broad data-cleanup description.",
        usefulness: "Dataset preparation is relevant, but the user benefit remains broad.",
        diversity: "Data cleanup is distinct from the other sampled product workflows.",
        explanationAccuracy: "The official excerpt supports the cleanup and preparation claims.",
      },
    }),
  },
];
