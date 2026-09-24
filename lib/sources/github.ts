import { classifyCategory, classifyStage, isAiRelated } from "@/lib/classify";
import type { SourceCandidate } from "@/lib/domain";

type Repository = {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  created_at: string;
  stargazers_count: number;
  forks_count: number;
  topics?: string[];
  fork: boolean;
};

export async function collectGitHub(since: Date): Promise<SourceCandidate[]> {
  const created = since.toISOString().slice(0, 10);
  const queries = [
    "topic:artificial-intelligence created:>=" + created,
    "AI in:name,description created:>=" + created,
    "LLM in:name,description created:>=" + created,
  ];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "AI-Product-Radar",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  }

  const results = await Promise.all(
    queries.map(async (query) => {
      const params = new URLSearchParams({ q: query, sort: "stars", order: "desc", per_page: "50" });
      const response = await fetch("https://api.github.com/search/repositories?" + params, {
        headers,
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("GitHub returned HTTP " + response.status);
      return ((await response.json()) as { items?: Repository[] }).items ?? [];
    }),
  );

  const unique = new Map<number, Repository>();
  for (const repository of results.flat()) unique.set(repository.id, repository);

  return Array.from(unique.values())
    .filter((repo) => !repo.fork && repo.description && isAiRelated([repo.name, repo.description, repo.topics].join(" ")))
    .map((repo) => {
      const text = [repo.name, repo.description, ...(repo.topics ?? [])].filter(Boolean).join(" ");
      return {
        source: "github",
        externalId: String(repo.id),
        sourceUrl: repo.html_url,
        sourceName: "GitHub · " + repo.stargazers_count.toLocaleString() + " stars",
        name: repo.name,
        description: repo.description || "",
        websiteUrl: repo.homepage || repo.html_url,
        category: classifyCategory(text),
        stage: classifyStage(text + " open source"),
        announcedAt: new Date(repo.created_at),
        score: repo.stargazers_count,
        metadata: { stars: repo.stargazers_count, forks: repo.forks_count, topics: repo.topics ?? [] },
      } satisfies SourceCandidate;
    });
}
