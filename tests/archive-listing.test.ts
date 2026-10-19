import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import * as schema from "../db/schema";
import { listProducts } from "../lib/data";

test("Archive source limits Products without multiplying multi-source counts", async () => {
  const statements: string[] = [];
  const client = (async (query: string) => {
    statements.push(query);
    if (query.includes("count(")) return { rows: [[1]] };
    return { rows: [] };
  }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle(client, { schema });

  const result = await listProducts({ source: "github", sort: "oldest", page: 5 }, db);
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
  const filteredStatements = statements.filter((statement) => statement.includes("from \"products\"") && !statement.includes("distinct"));
  assert.equal(filteredStatements.length, 2);
  assert.ok(filteredStatements.every((statement) => statement.includes("exists (select") && !statement.includes(" join ")));
  assert.ok(statements.some((statement) => statement.includes('order by "products"."first_seen_at" asc')));
});

test("Archive search matches decoded card text, not encoded entity names", async () => {
  const statements: string[] = [];
  const client = (async (query: string) => {
    statements.push(query);
    if (query.includes('left join "product_evidence"')) return { rows: [
      ["source", "Source product", "R&amp;D tools", null, null],
      ["evidence", "Evidence product", "Unrelated", "R&#38;D assistant", null],
      ["plain", "Plain product", "An ample tool", null, null],
    ] };
    return { rows: [] };
  }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle(client, { schema });

  assert.equal((await listProducts({ query: "R&D" }, db)).total, 2);
  assert.equal((await listProducts({ query: "amp" }, db)).total, 1);
  assert.ok(statements.some((statement) => statement.includes('left join "product_evidence"')));
  assert.ok(statements.every((statement) => !statement.includes("count(")));
});

test("personalized ordering ignores archive discovery sort", async () => {
  const statements: string[] = [];
  const client = (async (query: string) => {
    statements.push(query);
    if (query.includes("count(")) return { rows: [[1]] };
    return { rows: [] };
  }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle(client, { schema });

  await listProducts({ recommended: true, userId: "viewer", sort: "oldest" }, db);
  assert.ok(statements.some((statement) => statement.includes('order by "products"."first_seen_at" desc')));
});

test("discovery sort leaves Daily Feed ranking order intact", async () => {
  const statements: string[] = [];
  const client = (async (query: string) => {
    statements.push(query);
    if (query.includes("count(")) return { rows: [[1]] };
    return { rows: [] };
  }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle(client, { schema });

  await listProducts({ dailySince: new Date("2026-10-14T00:00:00Z"), sort: "oldest", source: "github" }, db);
  const productQuery = statements.find((statement) => statement.includes("order by \"products\".\"daily_rank\""));
  assert.ok(productQuery?.includes('"products"."daily_rank" asc'));
  if (!productQuery) return;
  assert.ok(!productQuery.includes("exists (select"));
});
