const MAX_OFFICIAL_DOCUMENT_CHARS = 24_000;

export type EvidenceConfidence = "high" | "medium" | "low";

export type OfficialEvidenceRequest = {
  kind: "canonical_page" | "github_readme";
  url: string;
};

export type OfficialEvidenceFetcher = (request: OfficialEvidenceRequest) => Promise<string | null>;

export type EvidenceRecord = {
  factualSummary: string | null;
  primaryUseCase: string | null;
  audience: string | null;
  productType: string | null;
  officialEvidenceUrl: string | null;
  supportingExcerpts: string[];
  confidence: EvidenceConfidence;
  conflicts: Array<"factualSummary" | "primaryUseCase" | "audience" | "productType">;
};

export type OfficialEvidenceInput = {
  name: string;
  canonicalUrl?: string | null;
  githubRepositoryUrl?: string | null;
  metadata?: Record<string, unknown>;
};

type EvidenceField = "factualSummary" | "primaryUseCase" | "audience" | "productType";
type EvidenceValues = Record<EvidenceField, string | null>;

const evidenceFields: EvidenceField[] = ["factualSummary", "primaryUseCase", "audience", "productType"];

function cleanText(value: string, trimFinalPunctuation = true) {
  const cleaned = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return trimFinalPunctuation ? cleaned.replace(/[.]+$/, "") : cleaned;
}

function firstMatch(body: string, patterns: RegExp[], trimFinalPunctuation = true) {
  for (const pattern of patterns) {
    const result = pattern.exec(body);
    if (result?.[1]) return cleanText(result[1], trimFinalPunctuation);
  }
  return null;
}

function valuesFromMetadata(metadata: Record<string, unknown> | undefined): EvidenceValues {
  const stringValue = (key: string) => typeof metadata?.[key] === "string" ? cleanText(metadata[key]) : null;
  return {
    factualSummary: stringValue("summary") || stringValue("description"),
    primaryUseCase: stringValue("primaryUseCase"),
    audience: stringValue("audience"),
    productType: stringValue("productType"),
  };
}

function valuesFromDocument(body: string): EvidenceValues {
  const bounded = body.slice(0, MAX_OFFICIAL_DOCUMENT_CHARS);
  const description = [...bounded.matchAll(/<meta\b[^>]*>/gi)]
    .map((tag) => tag[0])
    .find((tag) => /\bname=["']description["']/i.test(tag));
  return {
    factualSummary: description
      ? cleanText(/\bcontent=["']([^"']+)["']/i.exec(description)?.[1] || "", false) || null
      : firstMatch(bounded, [/(?:summary|description)\s*:\s*([^\n<]+)/i], false),
    primaryUseCase: firstMatch(bounded, [/(?:primary\s+use\s+case|use\s+case)\s*:\s*([^\n<]+)/i]),
    audience: firstMatch(bounded, [/(?:audience|for)\s*:\s*([^\n<]+)/i]),
    productType: firstMatch(bounded, [/(?:product\s+type|type)\s*:\s*([^\n<]+)/i]),
  };
}

function githubReadmeUrl(repositoryUrl: string | null | undefined) {
  if (!repositoryUrl) return null;
  try {
    const url = new URL(repositoryUrl);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const [owner, repository] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repository) return null;
    return `https://raw.githubusercontent.com/${owner}/${repository.replace(/\.git$/, "")}/HEAD/README.md`;
  } catch {
    return null;
  }
}

function canonicalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function combineEvidence(sources: EvidenceValues[]) {
  const evidence = Object.fromEntries(evidenceFields.map((field) => [field, null])) as EvidenceValues;
  const conflicts: EvidenceRecord["conflicts"] = [];
  for (const field of evidenceFields) {
    const values = [...new Set(sources.map((source) => source[field]).filter((value): value is string => Boolean(value)))];
    if (values.length === 1) evidence[field] = values[0];
    if (values.length > 1) conflicts.push(field);
  }
  return { evidence, conflicts };
}

function confidenceFor(evidence: EvidenceValues, conflicts: EvidenceRecord["conflicts"]): EvidenceConfidence {
  if (conflicts.length) return "low";
  const completeFields = evidenceFields.filter((field) => evidence[field]).length;
  if (completeFields === 4) return "high";
  return completeFields >= 2 ? "medium" : "low";
}

export async function enrichOfficialEvidence(input: OfficialEvidenceInput, fetchOfficialEvidence: OfficialEvidenceFetcher): Promise<EvidenceRecord> {
  const requests: OfficialEvidenceRequest[] = [];
  const pageUrl = canonicalUrl(input.canonicalUrl);
  if (pageUrl) requests.push({ kind: "canonical_page", url: pageUrl });
  const readmeUrl = githubReadmeUrl(input.githubRepositoryUrl);
  if (readmeUrl) requests.push({ kind: "github_readme", url: readmeUrl });

  const documents = await Promise.all(requests.map(async (request) => ({ request, body: await fetchOfficialEvidence(request) })));
  const sources = [valuesFromMetadata(input.metadata), ...documents.filter((document) => document.body).map((document) => valuesFromDocument(document.body!))];
  const { evidence, conflicts } = combineEvidence(sources);
  const excerpts = documents.flatMap((document) => document.body ? [cleanText(document.body.slice(0, 280))] : []).filter(Boolean).slice(0, 2);

  return {
    ...evidence,
    officialEvidenceUrl: pageUrl,
    supportingExcerpts: excerpts,
    confidence: confidenceFor(evidence, conflicts),
    conflicts,
  };
}

export function renderEvidenceBackedRankingReason(evidence: EvidenceRecord) {
  if (!evidence.factualSummary || !evidence.primaryUseCase || evidence.conflicts.length) return null;
  const summary = evidence.factualSummary.replace(/[.]+$/, "");
  const useCase = evidence.primaryUseCase.replace(/[.]+$/, "");
  return `Officially described as ${summary}; its stated primary use case is ${useCase}.`;
}
