import assert from "node:assert/strict";
import test from "node:test";
import { collectProductHunt } from "../lib/sources/product-hunt";

test("Product Hunt collector carries the AI topic into candidate metadata", async () => {
  const previousToken = process.env.PRODUCT_HUNT_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.PRODUCT_HUNT_TOKEN = "test-token";
  globalThis.fetch = async () => Response.json({
    data: {
      posts: {
        edges: [
          {
            node: {
              id: "post-1",
              name: "Orbit",
              tagline: "A simple launch planner",
              description: "A focused planner for small teams.",
              url: "https://www.producthunt.com/posts/orbit",
              website: "https://www.producthunt.com/r/orbit-redirect",
              createdAt: "2026-09-24T12:00:00.000Z",
              votesCount: 3,
              commentsCount: 1,
              topics: { edges: [{ node: { name: "Artificial Intelligence" } }] },
            },
          },
        ],
      },
    },
  });

  try {
    const [candidate] = await collectProductHunt(new Date("2026-09-23T00:00:00.000Z"));

    assert.ok(candidate);
    assert.deepEqual(candidate.metadata?.topics, ["Artificial Intelligence"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.PRODUCT_HUNT_TOKEN;
    else process.env.PRODUCT_HUNT_TOKEN = previousToken;
  }
});
