export const REDISCOVERY_COOLDOWN_DAYS = 30;
export const MAX_DAILY_REDISCOVERIES = 3;
export const SELECTION_SNAPSHOT_RETENTION_DAYS = 365;

export type RediscoveryCandidate = {
  productId: string;
  lastSelectedAt: Date | null;
  evidenceRefreshedAt?: Date | null;
  latestQualifyingMentionAt?: Date | null;
};

export type RediscoveryQualification =
  | { qualified: true; reason: "refreshed_official_evidence" | "new_qualifying_product_mention" }
  | { qualified: false };

export function qualifyRediscovery(candidate: RediscoveryCandidate, selectedAt: Date): RediscoveryQualification {
  if (!candidate.lastSelectedAt) return { qualified: false };

  const cooldownEndsAt = new Date(candidate.lastSelectedAt.getTime() + REDISCOVERY_COOLDOWN_DAYS * 86_400_000);
  if (selectedAt < cooldownEndsAt) return { qualified: false };

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
  similarityKey?: string | null;
  rediscovery: boolean;
};

const COMPARABLE_SCORE_DELTA = 0.05;

function isComparableNearDuplicate(candidate: RankedSelectionCandidate, selected: RankedSelectionCandidate[]) {
  return selected.some((item) =>
    item.similarityKey && item.similarityKey === candidate.similarityKey
    && Math.abs(item.deterministicScore - candidate.deterministicScore) <= COMPARABLE_SCORE_DELTA,
  );
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
  deterministicScore: number;
  sourceRelativeTraction: number;
  acceptedEvidence: Record<string, unknown>;
  rankingReason: string;
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
  const cutoff = new Date(now.getTime() - SELECTION_SNAPSHOT_RETENTION_DAYS * 86_400_000);
  return repository.deleteSelectedBefore(cutoff);
}
