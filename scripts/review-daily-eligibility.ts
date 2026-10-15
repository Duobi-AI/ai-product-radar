import { prepareDailyCandidates } from "../lib/daily-candidates";
import type { SourceCandidate } from "../lib/domain";

type ReviewFixture = {
  cohort: "clear AI Product" | "topic-only AI Product" | "tangential or unclear AI" | "guide or resource" | "non-AI Product";
  expected: "include" | "exclude" | "uncertain";
  source: SourceCandidate["source"];
  name: string;
  description: string;
  sourceUrl: string;
  metadata?: Record<string, unknown>;
};

// Product copy below is fixed from the public Daily Feed on 2026-10-14, except
// the two explicit boundary fixtures. Product Hunt topic metadata is modeled
// from the collector's AI-topic query, not from a production database export.
const fixtures: ReviewFixture[] = [
  {
    cohort: "clear AI Product", expected: "include", source: "product_hunt", name: "Agent-Native",
    description: "An open-source TypeScript framework for building agentic apps: AI agents with their own UI.",
    sourceUrl: "https://www.producthunt.com/products/agent-native-2", metadata: { topics: ["Artificial Intelligence"] },
  },
  {
    cohort: "clear AI Product", expected: "include", source: "product_hunt", name: "Simple Agent Store",
    description: "Save notes, todos, contacts, and JSON with one AI agent. Retrieve them with another.",
    sourceUrl: "https://www.producthunt.com/products/simple-agent-store", metadata: { topics: ["Artificial Intelligence"] },
  },
  {
    cohort: "clear AI Product", expected: "include", source: "hacker_news", name: "Pulse Local",
    description: "A Mac budgeting app that answers questions about spending with AI models that run on your machine.",
    sourceUrl: "https://news.ycombinator.com/item?id=50080275",
  },
  {
    cohort: "topic-only AI Product", expected: "include", source: "product_hunt", name: "Orbit",
    description: "A focused launch planner for small teams.",
    sourceUrl: "https://www.producthunt.com/posts/orbit", metadata: { topics: ["Artificial Intelligence"] },
  },
  {
    cohort: "guide or resource", expected: "exclude", source: "product_hunt", name: "Best Automation Tools for Freelancers",
    description: "A practical guide that compares automation tools for freelancers and helps them choose options.",
    sourceUrl: "https://www.producthunt.com/products/best-automation-tools-for-freelancers",
    metadata: { topics: ["Artificial Intelligence"] },
  },
  {
    cohort: "guide or resource", expected: "exclude", source: "hacker_news", name: "Building an LLM from Scratch in TypeScript",
    description: "A learning book with chapters on dataloaders, embeddings, and attention.",
    sourceUrl: "https://news.ycombinator.com/item?id=50085332",
  },
  {
    cohort: "guide or resource", expected: "exclude", source: "hacker_news", name: "AI Hub – Open Access Lesson Plans",
    description: "Curated lesson plans teaching middle and high school students about AI.",
    sourceUrl: "https://news.ycombinator.com/item?id=50081297",
  },
  {
    cohort: "tangential or unclear AI", expected: "uncertain", source: "product_hunt", name: "pacr running",
    description: "GPS run tracking, a personal coach, nearby running buddies, clubs, and leaderboards.",
    sourceUrl: "https://www.producthunt.com/products/pacr-running",
    metadata: { topics: ["Artificial Intelligence"] },
  },
  {
    cohort: "non-AI Product", expected: "exclude", source: "github", name: "Trail Journal",
    description: "A GPS logbook for local hiking routes and trail photos.",
    sourceUrl: "https://github.com/example/trail-journal",
  },
];

const now = new Date("2026-10-14T19:00:00.000Z");
function candidate(fixture: ReviewFixture, withoutMetadata: boolean): SourceCandidate {
  return {
    source: fixture.source,
    externalId: fixture.sourceUrl,
    sourceUrl: fixture.sourceUrl,
    sourceName: fixture.source,
    name: fixture.name,
    description: fixture.description,
    websiteUrl: fixture.sourceUrl,
    announcedAt: now,
    metadata: withoutMetadata ? {} : fixture.metadata ?? {},
  };
}

const selected = (withoutMetadata: boolean) => new Set(prepareDailyCandidates(
  fixtures.map((fixture) => candidate(fixture, withoutMetadata)), { now },
).flatMap((group) => group.items.map((item) => item.name)));
const current = selected(false);
const visibleCopyOnly = selected(true);

console.log("| Fixture | Cohort | Review label | Current | Visible-copy-only candidate |");
console.log("| --- | --- | --- | --- | --- |");
for (const fixture of fixtures) {
  console.log(`| ${fixture.name} | ${fixture.cohort} | ${fixture.expected} | ${current.has(fixture.name) ? "include" : "exclude"} | ${visibleCopyOnly.has(fixture.name) ? "include" : "exclude"} |`);
}
for (const [label, outcomes] of [["Current", current], ["Visible-copy-only candidate", visibleCopyOnly]] as const) {
  const known = fixtures.filter((fixture) => fixture.expected !== "uncertain");
  const correct = known.filter((fixture) => outcomes.has(fixture.name) === (fixture.expected === "include")).length;
  console.log(`${label}: ${correct}/${known.length} labeled decisions match review expectations; ${fixtures.length - known.length} uncertain.`);
}
