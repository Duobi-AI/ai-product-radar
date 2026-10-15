import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceDescriptionForDisplay } from "../lib/source-text";

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
