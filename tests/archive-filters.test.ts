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
