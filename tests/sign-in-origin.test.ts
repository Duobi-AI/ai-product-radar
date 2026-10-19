import assert from "node:assert/strict";
import test from "node:test";
import { getCanonicalSignInUrl } from "../lib/sign-in-origin";

test("routes sign-in on a deployment URL to the configured OAuth host", () => {
  assert.equal(
    getCanonicalSignInUrl(
      "ai-product-radar-bqhlteyym-dobby22.vercel.app",
      "https://ai-product-radar-gilt.vercel.app",
    ),
    "https://ai-product-radar-gilt.vercel.app/sign-in",
  );
});

test("keeps sign-in on the configured host", () => {
  assert.equal(
    getCanonicalSignInUrl("ai-product-radar-gilt.vercel.app", "https://ai-product-radar-gilt.vercel.app"),
    null,
  );
});

test("does not redirect without a known request host or configured OAuth URL", () => {
  assert.equal(getCanonicalSignInUrl(null, "https://ai-product-radar-gilt.vercel.app"), null);
  assert.equal(getCanonicalSignInUrl("preview.vercel.app", undefined), null);
});
