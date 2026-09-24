export const SOURCE_NAMES = {
  product_hunt: "Product Hunt",
  hacker_news: "Show HN",
  github: "GitHub",
  hugging_face: "Hugging Face",
} as const;

export type SourceKey = keyof typeof SOURCE_NAMES;

export type ProductListing = {
  id: string;
  name: string;
  description: string;
  websiteUrl: string | null;
  category: string;
  stage: string;
  announcedAt: Date | null;
  firstSeenAt: Date;
  sources: {
    id: string;
    source: string;
    sourceName: string;
    sourceUrl: string;
    score: number;
  }[];
  feedback: {
    direction: number;
    reason: string | null;
  } | null;
  relevance: number;
};

export type SourceCandidate = {
  source: SourceKey;
  externalId: string;
  sourceUrl: string;
  sourceName: string;
  name: string;
  description: string;
  websiteUrl?: string | null;
  category?: string;
  stage?: string;
  announcedAt?: Date | null;
  score?: number;
  metadata?: Record<string, unknown>;
};
