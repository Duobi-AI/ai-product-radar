import assert from "node:assert/strict";
import test from "node:test";
import type { SourceCandidate } from "../lib/domain";
import { prepareDailyCandidates } from "../lib/daily-candidates";

function productHuntCandidate(name: string, redirectPath: string): SourceCandidate {
  return {
    source: "product_hunt",
    externalId: redirectPath,
    sourceUrl: `https://www.producthunt.com/posts/${redirectPath}`,
    sourceName: "Product Hunt",
    name,
    description: "A focused launch for a small team.",
    websiteUrl: `https://www.producthunt.com/r/${redirectPath}`,
    metadata: { topics: ["Artificial Intelligence"] },
  };
}

test("separate Product Hunt launches sharing the redirect host remain separate", () => {
  const groups = prepareDailyCandidates([
    productHuntCandidate("Launch One", "launch-one"),
    productHuntCandidate("Launch Two", "launch-two"),
  ]);

  assert.deepEqual(groups.map((group) => group.items.map((item) => item.name)), [
    ["Launch One"],
    ["Launch Two"],
  ]);
});

test("separate Product Hunt products sharing a platform homepage host remain separate", () => {
  const first = productHuntCandidate("AI Prompts Mega Collection", "ai-prompts-mega-collection");
  const second = productHuntCandidate("Altriba AI", "altriba-ai");
  first.websiteUrl = "https://demo-platform.example/ai-prompts";
  second.websiteUrl = "https://demo-platform.example/altriba";

  const groups = prepareDailyCandidates([first, second]);

  assert.deepEqual(groups.map((group) => group.items.map((item) => item.name)), [
    ["AI Prompts Mega Collection"],
    ["Altriba AI"],
  ]);
});

test("Product Hunt topic evidence keeps a candidate eligible", () => {
  const candidate = productHuntCandidate("Orbit", "orbit");
  candidate.description = "A focused launch planner for small teams.";

  const groups = prepareDailyCandidates([candidate]);

  assert.deepEqual(groups.map((group) => group.items.map((item) => item.name)), [["Orbit"]]);
});
