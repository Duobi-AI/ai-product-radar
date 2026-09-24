import { classifyCategory, classifyStage, isAiRelated } from "@/lib/classify";
import type { SourceCandidate } from "@/lib/domain";

type HuntPost = {
  id: string;
  name: string;
  tagline: string;
  description: string | null;
  url: string;
  website: string | null;
  createdAt: string;
  votesCount: number;
  commentsCount: number;
  topics?: { edges?: { node?: { name?: string } }[] };
};

export async function collectProductHunt(since: Date): Promise<SourceCandidate[]> {
  const token = process.env.PRODUCT_HUNT_TOKEN;
  if (!token) return [];

  const query = [
    "query DailyAIProducts($since: DateTime!) {",
    '  posts(first: 50, order: NEWEST, postedAfter: $since, topic: "artificial-intelligence") {',
    "    edges { node { id name tagline description url website createdAt votesCount commentsCount",
    "      topics(first: 8) { edges { node { name } } }",
    "    } }",
    "  }",
    "}",
  ].join("\n");

  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { since: since.toISOString() } }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Product Hunt returned HTTP " + response.status);

  const payload = (await response.json()) as {
    data?: { posts?: { edges?: { node?: HuntPost }[] } };
    errors?: { message?: string }[];
  };
  if (payload.errors?.length) throw new Error(payload.errors[0].message || "Product Hunt query failed");

  return (payload.data?.posts?.edges ?? [])
    .map((edge) => edge.node)
    .filter((post): post is HuntPost => Boolean(post?.id && post.name))
    .map((post) => ({
      post,
      topics: (post.topics?.edges ?? [])
        .map((item) => item.node?.name)
        .filter((topic): topic is string => Boolean(topic)),
    }))
    .filter(({ post, topics }) =>
      isAiRelated(
        [post.name, post.tagline, post.description, ...topics].filter(Boolean).join(" "),
      ),
    )
    .map(({ post, topics }) => {
      const text = [post.name, post.tagline, post.description].filter(Boolean).join(" ");
      return {
        source: "product_hunt",
        externalId: post.id,
        sourceUrl: post.url,
        sourceName: "Product Hunt",
        name: post.name,
        description: post.description || post.tagline,
        websiteUrl: post.website,
        category: classifyCategory(text),
        stage: classifyStage(text),
        announcedAt: new Date(post.createdAt),
        score: post.votesCount,
        metadata: { votes: post.votesCount, comments: post.commentsCount, topics },
      } satisfies SourceCandidate;
    });
}
