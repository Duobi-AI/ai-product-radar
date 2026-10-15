import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "../components/product-card";
import type { ProductListing } from "../lib/domain";

test("filtered archive card keeps the matching source visible among many mentions", () => {
  const product: ProductListing = {
    id: "example", name: "Example", description: "Example product", websiteUrl: null,
    category: "Developer Tools", stage: "New", announcedAt: null,
    firstSeenAt: new Date("2026-10-14T00:00:00Z"), evidenceSummary: null,
    rankingReason: null, feedback: null, relevance: 0,
    sources: [
      { id: "ph", source: "product_hunt", sourceName: "Product Hunt", sourceUrl: "https://example.com/ph", score: 1 },
      { id: "hn", source: "hacker_news", sourceName: "Show HN", sourceUrl: "https://example.com/hn", score: 1 },
      { id: "hf", source: "hugging_face", sourceName: "Hugging Face", sourceUrl: "https://example.com/hf", score: 1 },
      { id: "gh", source: "github", sourceName: "GitHub", sourceUrl: "https://example.com/gh", score: 1 },
    ],
  };
  const html = renderToStaticMarkup(createElement(ProductCard, { product, signedIn: false, filteredSource: "github" }));
  assert.match(html, /href="https:\/\/example.com\/gh"/);
  assert.ok(html.indexOf("GitHub") < html.indexOf("Product Hunt"));
});
