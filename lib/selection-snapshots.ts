export const REDISCOVERY_COOLDOWN_DAYS = 30;
export const MAX_DAILY_REDISCOVERIES = 3;
export const SELECTION_SNAPSHOT_RETENTION_DAYS = 365;

export function selectionSnapshotRetentionCutoff(now: Date) {
  return new Date(now.getTime() - SELECTION_SNAPSHOT_RETENTION_DAYS * 86_400_000);
}

export type RediscoveryCandidate = {
  productId: string;
  lastSelectedAt: Date | null;
  evidenceRefreshedAt?: Date | null;
  latestQualifyingMentionAt?: Date | null;
};

export type RediscoveryQualification =
  | { qualified: true; reason: "refreshed_official_evidence" | "new_qualifying_product_mention" }
  | { qualified: false };

export function hasRediscoveryCooldownElapsed(lastSelectedAt: Date | null, now: Date) {
  if (!lastSelectedAt) return false;
  const cooldownEndsAt = new Date(lastSelectedAt.getTime() + REDISCOVERY_COOLDOWN_DAYS * 86_400_000);
  return now >= cooldownEndsAt;
}

export function qualifyRediscovery(candidate: RediscoveryCandidate, selectedAt: Date): RediscoveryQualification {
  if (!candidate.lastSelectedAt || !hasRediscoveryCooldownElapsed(candidate.lastSelectedAt, selectedAt)) return { qualified: false };

  if (candidate.evidenceRefreshedAt && candidate.evidenceRefreshedAt > candidate.lastSelectedAt && candidate.evidenceRefreshedAt <= selectedAt) {
    return { qualified: true, reason: "refreshed_official_evidence" };
  }
  if (candidate.latestQualifyingMentionAt && candidate.latestQualifyingMentionAt > candidate.lastSelectedAt && candidate.latestQualifyingMentionAt <= selectedAt) {
    return { qualified: true, reason: "new_qualifying_product_mention" };
  }
  return { qualified: false };
}

export type RankedSelectionCandidate = {
  productId: string;
  deterministicScore: number;
  similarityTokens?: string[];
  rediscovery: boolean;
};

const COMPARABLE_SCORE_DELTA = 0.05;
const NEAR_DUPLICATE_JACCARD_THRESHOLD = 0.9;

function isComparableNearDuplicate(candidate: RankedSelectionCandidate, selected: RankedSelectionCandidate[]) {
  const candidateTokens = new Set(candidate.similarityTokens ?? []);
  if (!candidateTokens.size) return false;

  return selected.some((item) => {
    if (Math.abs(item.deterministicScore - candidate.deterministicScore) > COMPARABLE_SCORE_DELTA) return false;
    const selectedTokens = new Set(item.similarityTokens ?? []);
    if (!selectedTokens.size) return false;
    const intersectionSize = [...candidateTokens].filter((token) => selectedTokens.has(token)).length;
    const unionSize = new Set([...candidateTokens, ...selectedTokens]).size;
    return unionSize > 0 && intersectionSize / unionSize >= NEAR_DUPLICATE_JACCARD_THRESHOLD;
  });
}

export function applyRediscoveryAndSoftDiversity(candidates: RankedSelectionCandidate[], limit: number) {
  const selected: RankedSelectionCandidate[] = [];
  const deferred: RankedSelectionCandidate[] = [];
  let rediscoveries = 0;

  for (const candidate of candidates) {
    if (candidate.rediscovery && rediscoveries >= MAX_DAILY_REDISCOVERIES) continue;
    if (isComparableNearDuplicate(candidate, selected)) {
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    if (candidate.rediscovery) rediscoveries += 1;
    if (selected.length >= limit) return selected;
  }

  for (const candidate of deferred) {
    if (candidate.rediscovery && rediscoveries >= MAX_DAILY_REDISCOVERIES) continue;
    selected.push(candidate);
    if (candidate.rediscovery) rediscoveries += 1;
    if (selected.length >= limit) break;
  }
  return selected;
}

export type SelectionSnapshot = {
  productId: string;
  selectedAt: Date;
  rank: number;
  freshness: number;
  evidenceConfidence: number;
  deterministicScore: number;
  sourceRelativeTraction: number;
  acceptedEvidence: Record<string, unknown>;
  rankingReason: string | null;
  rediscovery: boolean;
  provenance: "model" | "fallback";
};

export interface SelectionSnapshotRepository {
  append(snapshot: SelectionSnapshot): Promise<SelectionSnapshot>;
  list(): Promise<SelectionSnapshot[]>;
  deleteSelectedBefore(cutoff: Date): Promise<number>;
}

function copySnapshot(snapshot: SelectionSnapshot): SelectionSnapshot {
  return {
    ...snapshot,
    selectedAt: new Date(snapshot.selectedAt),
    acceptedEvidence: structuredClone(snapshot.acceptedEvidence),
  };
}

export class InMemorySelectionSnapshotRepository implements SelectionSnapshotRepository {
  private snapshots: SelectionSnapshot[] = [];

  async append(snapshot: SelectionSnapshot) {
    const stored = copySnapshot(snapshot);
    this.snapshots.push(stored);
    return copySnapshot(stored);
  }

  async list() {
    return this.snapshots.map(copySnapshot);
  }

  async deleteSelectedBefore(cutoff: Date) {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((snapshot) => snapshot.selectedAt >= cutoff);
    return before - this.snapshots.length;
  }
}

export async function cleanupExpiredSelectionSnapshots(repository: SelectionSnapshotRepository, now: Date) {
  return repository.deleteSelectedBefore(selectionSnapshotRetentionCutoff(now));
}
