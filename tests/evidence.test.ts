import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichOfficialEvidence,
  fetchBoundedOfficialEvidence,
  hasRefreshableOfficialEvidence,
  renderEvidenceBackedRankingReason,
  type OfficialEvidenceRequest,
} from "../lib/evidence";

function fixtureFetcher(bodies: Record<string, string | null>) {
  const requests: OfficialEvidenceRequest[] = [];
  return {
    requests,
    fetch: async (request: OfficialEvidenceRequest) => {
      requests.push(request);
      return bodies[request.url] ?? null;
    },
  };
}

test("enrichment only retrieves the canonical page and official GitHub README", async () => {
  const canonicalUrl = "https://example.com";
  const readmeUrl = "https://raw.githubusercontent.com/acme/radar/HEAD/README.md";
  const fixture = fixtureFetcher({
    [canonicalUrl]: [
      '<meta name="description" content="Radar is an AI research assistant.">',
      "<p>Primary use case: research synthesis.</p>",
      "<p>Audience: product teams.</p>",
      "<p>Product type: AI assistant.</p>",
    ].join("\n"),
    [readmeUrl]: "# Radar\n\nPrimary use case: research synthesis.",
  });

  const evidence = await enrichOfficialEvidence(
    {
      name: "Radar",
      canonicalUrl,
      githubRepositoryUrl: "https://github.com/acme/radar",
      metadata: { irrelevantLink: "https://untrusted.example/should-not-be-fetched" },
    },
    fixture.fetch,
  );

  assert.deepEqual(fixture.requests, [
    { kind: "canonical_page", url: canonicalUrl },
    { kind: "github_readme", url: readmeUrl },
  ]);
  assert.equal(evidence.factualSummary, "Radar is an AI research assistant.");
  assert.equal(evidence.primaryUseCase, "research synthesis");
  assert.equal(evidence.audience, "product teams");
  assert.equal(evidence.productType, "AI assistant");
  assert.equal(evidence.confidence, "high");
});

test("incomplete official evidence remains usable but has low confidence", async () => {
  const fixture = fixtureFetcher({
    "https://example.com": '<meta name="description" content="A careful assistant for analysts.">',
  });

  const evidence = await enrichOfficialEvidence(
    { name: "Scout", canonicalUrl: "https://example.com" },
    fixture.fetch,
  );

  assert.equal(evidence.factualSummary, "A careful assistant for analysts.");
  assert.equal(evidence.primaryUseCase, null);
  assert.equal(evidence.confidence, "low");
  assert.equal(hasRefreshableOfficialEvidence(evidence), true);
  assert.equal(
    renderEvidenceBackedRankingReason(evidence),
    "Officially described as A careful assistant for analysts; the official page does not state a primary use case.",
  );
});

test("source metadata cannot become an official claim or public reason", async () => {
  const evidence = await enrichOfficialEvidence(
    {
      name: "Scout",
      metadata: { description: "A source collector's unverified claim.", primaryUseCase: "anything" },
      metadataProvenance: "source",
    },
    async () => null,
  );

  assert.equal(evidence.factualSummary, null);
  assert.equal(evidence.confidence, "low");
  assert.equal(renderEvidenceBackedRankingReason(evidence), null);
  assert.equal(hasRefreshableOfficialEvidence(evidence), false);
});

test("bounded retrieval cancels an oversized response without a content-length header", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("x".repeat(24_001));
  try {
    assert.equal(await fetchBoundedOfficialEvidence({ kind: "canonical_page", url: "https://example.com" }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conflicting official claims are omitted and degrade confidence", async () => {
  const canonicalUrl = "https://example.com";
  const readmeUrl = "https://raw.githubusercontent.com/acme/radar/HEAD/README.md";
  const fixture = fixtureFetcher({
    [canonicalUrl]: [
      '<meta name="description" content="Radar is a planning tool.">',
      "<p>Primary use case: roadmap planning.</p>",
      "<p>Audience: product teams.</p>",
      "<p>Product type: planning tool.</p>",
    ].join("\n"),
    [readmeUrl]: "# Radar\n\nAudience: enterprise security teams.",
  });

  const evidence = await enrichOfficialEvidence(
    { name: "Radar", canonicalUrl, githubRepositoryUrl: "https://github.com/acme/radar" },
    fixture.fetch,
  );

  assert.equal(evidence.audience, null);
  assert.deepEqual(evidence.conflicts, ["audience"]);
  assert.equal(evidence.confidence, "low");
});

test("the public ranking reason is exactly two evidence-backed clauses", () => {
  const reason = renderEvidenceBackedRankingReason({
    factualSummary: "Radar is an AI research assistant.",
    primaryUseCase: "research synthesis.",
    audience: "product teams",
    productType: "AI assistant",
    officialEvidenceUrl: "https://example.com",
    supportingExcerpts: [],
    confidence: "high",
    conflicts: [],
  });

  assert.equal(
    reason,
    "Officially described as Radar is an AI research assistant; its stated primary use case is research synthesis.",
  );
  assert.equal(reason?.split("; ").length, 2);
  assert.equal(reason?.includes("model"), false);
});
