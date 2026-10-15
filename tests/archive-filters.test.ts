import assert from "node:assert/strict";
import test from "node:test";
import { archiveHref, parseArchiveFilters } from "../lib/archive-filters";

test("archive source and discovery sort form a shareable URL and preserve applied pagination", () => {
  const filters = parseArchiveFilters({ archive: "1", q: "agents", source: "github", sort: "oldest", page: "2" });
  assert.equal(archiveHref(filters, 3), "/?archive=1&q=agents&source=github&sort=oldest&page=3");
});

test("invalid archive values fall back safely and changing filters starts at page one", () => {
  const filters = parseArchiveFilters({ source: "unknown", sort: "random", page: "-10" });
  assert.deepEqual({ source: filters.source, sort: filters.sort, page: filters.page, archive: filters.archive },
    { source: "", sort: "newest", page: 1, archive: false });
  assert.equal(archiveHref({ ...filters, archive: true, source: "github" }), "/?archive=1&source=github");
});

test("invalid calendar dates do not activate or survive archive filters", () => {
  for (const date of ["2026-02-29", "2026-13-01", "2026-1-01", "not-a-date"]) {
    const filters = parseArchiveFilters({ date });
    assert.equal(filters.date, "");
    assert.equal(filters.archive, false);
    assert.equal(archiveHref(filters), "/");
  }
  assert.equal(parseArchiveFilters({ date: "2024-02-29" }).date, "2024-02-29");
  assert.equal(parseArchiveFilters({ date: "0001-01-01" }).date, "0001-01-01");
});

test("personalized archive canonicalizes discovery sort in links", () => {
  const filters = parseArchiveFilters({ archive: "1", recommended: "1", sort: "oldest" });
  assert.equal(filters.sort, "newest");
  assert.equal(archiveHref(filters), "/?archive=1&recommended=1");
  assert.equal(archiveHref({ ...filters, sort: "oldest" }), "/?archive=1&recommended=1");
});
