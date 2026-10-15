import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evidenceSummaryForDisplay, sourceDescriptionForDisplay } from "../lib/source-text";

test("source descriptions display encoded apostrophes and ampersands as text", () => {
  const description = sourceDescriptionForDisplay("I&#x27;m building R&amp;D tools for founders.");
  const markup = renderToStaticMarkup(createElement("p", null, description));

  assert.equal(description, "I'm building R&D tools for founders.");
  assert.equal(markup, "<p>I&#x27;m building R&amp;D tools for founders.</p>");
});

test("encoded source tags remain inert text in rendered descriptions", () => {
  const description = sourceDescriptionForDisplay("Try &lt;img src=x onerror=alert(1)&gt; today.");
  const markup = renderToStaticMarkup(createElement("p", null, description));

  assert.equal(description, "Try <img src=x onerror=alert(1)> today.");
  assert.equal(markup, "<p>Try &lt;img src=x onerror=alert(1)&gt; today.</p>");
});

test("plain source descriptions stay unchanged", () => {
  const description = "A simple AI tool for teams & makers.";
  assert.equal(sourceDescriptionForDisplay(description), description);
});

test("selected evidence summary decodes references while React keeps embedded tags inert", () => {
  const summary = evidenceSummaryForDisplay({
    factualSummary: "  R&amp;D assistant for &lt;img src=x onerror=alert(1)&gt; teams  ",
    primaryUseCase: "ignored",
  });
  const markup = renderToStaticMarkup(createElement("p", null, summary));

  assert.equal(summary, "R&D assistant for <img src=x onerror=alert(1)> teams");
  assert.equal(markup, "<p>R&amp;D assistant for &lt;img src=x onerror=alert(1)&gt; teams</p>");
});

test("primary use case fallback also decodes references", () => {
  assert.equal(evidenceSummaryForDisplay({ factualSummary: " ", primaryUseCase: "Founders&#x27; research" }), "Founders' research");
  assert.equal(evidenceSummaryForDisplay({ factualSummary: null, primaryUseCase: null }), null);
});
