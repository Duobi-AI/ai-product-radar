import { classifyCategory, classifyStage, isAiRelated } from "@/lib/classify";
import type { SourceCandidate } from "@/lib/domain";

type Story = {
  id: number;
  title?: string;
  text?: string;
  url?: string;
  time?: number;
  score?: number;
  descendants?: number;
  type?: string;
  deleted?: boolean;
  dead?: boolean;
};

export async function collectShowHn(since: Date): Promise<SourceCandidate[]> {
  const response = await fetch("https://hacker-news.firebaseio.com/v0/showstories.json", {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Hacker News returned HTTP " + response.status);
  const ids = (await response.json()) as number[];
  const stories = await Promise.all(
    ids.slice(0, 100).map(async (id) => {
      const itemResponse = await fetch(
        "https://hacker-news.firebaseio.com/v0/item/" + id + ".json",
        { signal: AbortSignal.timeout(10_000), cache: "no-store" },
      );
      return itemResponse.ok ? ((await itemResponse.json()) as Story | null) : null;
    }),
  );

  return stories
    .filter((story): story is Story => Boolean(story?.id && story.title && !story.deleted && !story.dead))
    .filter((story) => story.time && new Date(story.time * 1000) >= since)
    .filter((story) => isAiRelated([story.title, story.text].filter(Boolean).join(" ")))
    .map((story) => {
      const text = [story.title, story.text].filter(Boolean).join(" ");
      const destination =
        story.url && !story.url.includes("news.ycombinator.com") ? story.url : null;
      return {
        source: "hacker_news",
        externalId: String(story.id),
        sourceUrl: "https://news.ycombinator.com/item?id=" + story.id,
        sourceName: "Hacker News · " + (story.score ?? 0) + " points",
        name: (story.title || "Show HN project").replace(/^Show HN:\s*/i, ""),
        description: (story.text || story.title || "").replace(/<[^>]*>/g, " ").slice(0, 500),
        websiteUrl: destination,
        category: classifyCategory(text),
        stage: classifyStage(text),
        announcedAt: story.time ? new Date(story.time * 1000) : null,
        score: story.score ?? 0,
        metadata: { points: story.score ?? 0, comments: story.descendants ?? 0 },
      } satisfies SourceCandidate;
    });
}
