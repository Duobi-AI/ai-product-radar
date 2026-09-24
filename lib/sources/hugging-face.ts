import { classifyCategory, classifyStage, isAiRelated } from "@/lib/classify";
import type { SourceCandidate } from "@/lib/domain";

type Space = {
  id: string;
  likes?: number;
  tags?: string[];
  sdk?: string;
  createdAt?: string;
  lastModified?: string;
  cardData?: { title?: string; emoji?: string; short_description?: string };
};

export async function collectHuggingFace(since: Date): Promise<SourceCandidate[]> {
  const params = new URLSearchParams({
    sort: "createdAt",
    direction: "-1",
    limit: "100",
  });
  const response = await fetch("https://huggingface.co/api/spaces?" + params, {
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Hugging Face returned HTTP " + response.status);
  const spaces = (await response.json()) as Space[];

  return spaces
    .filter((space) => space.id)
    .filter((space) => {
      const date = space.createdAt || space.lastModified;
      return date ? new Date(date) >= since : false;
    })
    .filter((space) =>
      isAiRelated([space.id, space.cardData?.short_description, ...(space.tags ?? [])].filter(Boolean).join(" ")),
    )
    .map((space) => {
      const title = space.cardData?.title || space.id.split("/").pop() || space.id;
      const description = space.cardData?.short_description || (space.tags ?? []).slice(0, 5).join(" · ");
      const text = [title, description, ...(space.tags ?? [])].join(" ");
      const url = "https://huggingface.co/spaces/" + space.id;
      return {
        source: "hugging_face",
        externalId: space.id,
        sourceUrl: url,
        sourceName: "Hugging Face · " + (space.likes ?? 0).toLocaleString() + " likes",
        name: title,
        description,
        websiteUrl: url,
        category: classifyCategory(text),
        stage: classifyStage(text + " demo"),
        announcedAt: space.createdAt ? new Date(space.createdAt) : null,
        score: space.likes ?? 0,
        metadata: { likes: space.likes ?? 0, sdk: space.sdk || "Space", tags: space.tags ?? [] },
      } satisfies SourceCandidate;
    });
}
