import type { CandidateGroup } from "@/lib/daily-candidates";
import type { SourceCandidate, SourceKey } from "@/lib/domain";

export const MAX_CANDIDATE_SHORTLIST = 100;
export const MAX_DAILY_FEED = 30;

export type DailyScore = {
  freshness: number;
  evidenceConfidence: number;
  sourceRelativeTraction: number;
  preScore: number;
};

export type ScoredCandidateGroup = CandidateGroup & { score: DailyScore };

export type DailyScoringOptions = {
  now: Date;
  /**
   * Evidence enrichment replaces this cold-start estimator once an accepted
   * Evidence Record is available. Keeping it injectable makes that transition
   * explicit without making selection depend on a provider.
   */
  evidenceConfidence?: (group: CandidateGroup) => number;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function nativeScore(candidate: SourceCandidate) {
  return typeof candidate.score === "number" && Number.isFinite(candidate.score) && candidate.score > 0
    ? candidate.score
    : 0;
}

/**
 * Compare native scores only with other eligible candidates from the same
 * source in this collection run. Zero or absent source scores intentionally
 * receive zero traction. Equal scores receive the same midpoint percentile.
 */
export function sourceRelativeTraction(candidates: SourceCandidate[]) {
  const bySource = new Map<SourceKey, SourceCandidate[]>();
  for (const candidate of candidates) {
    const items = bySource.get(candidate.source) || [];
    items.push(candidate);
    bySource.set(candidate.source, items);
  }

  const percentiles = new Map<SourceCandidate, number>();
  for (const items of bySource.values()) {
    for (const candidate of items) {
      const score = nativeScore(candidate);
      if (score === 0) {
        percentiles.set(candidate, 0);
        continue;
      }
      if (items.length === 1) {
        percentiles.set(candidate, 1);
        continue;
      }
      const lower = items.filter((item) => nativeScore(item) < score).length;
      const equal = items.filter((item) => nativeScore(item) === score).length;
      percentiles.set(candidate, clamp((lower + (equal - 1) / 2) / (items.length - 1)));
    }
  }
  return percentiles;
}

export function freshnessForGroup(group: CandidateGroup, now: Date) {
  const dates = group.items
    .map((item) => item.announcedAt?.getTime())
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  // A current observation without an announcement date is still useful, but
  // cannot be treated as equally fresh as a dated new launch.
  if (!dates.length) return 0.65;
  const ageInDays = Math.max(0, (now.getTime() - Math.max(...dates)) / 86_400_000);
  return clamp(1 - ageInDays / 30);
}

/**
 * Cold-start evidence is deliberately conservative: this is only a
 * deterministic completeness signal for source-supplied facts. #11 replaces
 * it with confidence from bounded official Evidence Records.
 */
export function coldStartEvidenceConfidence(group: CandidateGroup) {
  const hasDescription = group.items.some((item) => item.description.trim().length > 0);
  const hasWebsite = group.items.some((item) => Boolean(item.websiteUrl));
  const hasMetadata = group.items.some((item) => Object.keys(item.metadata || {}).length > 0);
  const corroborated = new Set(group.items.map((item) => item.source)).size > 1;
  return clamp((hasDescription ? 0.25 : 0) + (hasWebsite ? 0.3 : 0) + (hasMetadata ? 0.25 : 0) + (corroborated ? 0.2 : 0));
}

export function scoreDailyCandidates(groups: CandidateGroup[], options: DailyScoringOptions): ScoredCandidateGroup[] {
  const traction = sourceRelativeTraction(groups.flatMap((group) => group.items));
  const evidenceFor = options.evidenceConfidence || coldStartEvidenceConfidence;

  return groups
    .map((group) => {
      const freshness = freshnessForGroup(group, options.now);
      const evidenceConfidence = clamp(evidenceFor(group));
      const sourceRelativeTraction = Math.max(0, ...group.items.map((item) => traction.get(item) || 0));
      return {
        ...group,
        score: {
          freshness,
          evidenceConfidence,
          sourceRelativeTraction,
          preScore: 0.45 * freshness + 0.35 * evidenceConfidence + 0.2 * sourceRelativeTraction,
        },
      };
    })
    .sort((left, right) => {
      const scoreDifference = right.score.preScore - left.score.preScore;
      if (scoreDifference) return scoreDifference;
      return left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0;
    });
}

export function candidateShortlist(groups: CandidateGroup[], options: DailyScoringOptions) {
  return scoreDailyCandidates(groups, options).slice(0, MAX_CANDIDATE_SHORTLIST);
}
