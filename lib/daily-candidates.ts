import { identityFor, isAiRelated } from "@/lib/classify";
import type { SourceCandidate } from "@/lib/domain";

export type CandidateGroup = { identity: string; items: SourceCandidate[] };

export function prepareDailyCandidates(candidates: SourceCandidate[]): CandidateGroup[] {
  const groups = new Map<string, SourceCandidate[]>();
  for (const candidate of candidates) {
    const name = candidate.name.trim();
    const description = candidate.description.trim();
    const date = candidate.announcedAt?.getTime();
    const text = [name, description, JSON.stringify(candidate.metadata || {})].join(" ");
    if (name.length < 3 || !isAiRelated(text) || (!description && !candidate.websiteUrl) || (date && date > Date.now() + 24 * 60 * 60 * 1000)) continue;
    const identity = identityFor(name, candidate.websiteUrl);
    const group = groups.get(identity) || [];
    group.push(candidate);
    groups.set(identity, group);
  }

  return [...groups.entries()].map(([identity, items]) => ({ identity, items }));
}
