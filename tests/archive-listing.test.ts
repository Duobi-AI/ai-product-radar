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

test("Archive search includes the evidence summary shown on cards without multiplying results", async () => {
  const statements: string[] = [];
  const client = (async (query: string) => {
    statements.push(query);
    if (query.includes("count(")) return { rows: [[1]] };
    return { rows: [] };
  }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle(client, { schema });

  const result = await listProducts({ query: "research" }, db);
  assert.equal(result.total, 1);
  const productStatements = statements.filter((statement) => statement.includes('from "products"') && !statement.includes("distinct"));
  assert.equal(productStatements.length, 2);
  for (const statement of productStatements) {
    assert.match(statement, /exists \(select .* from "product_evidence"/);
    assert.match(statement, /"product_evidence"\."product_id" = "products"\."id"/);
    assert.match(statement, /"product_evidence"\."factual_summary"/);
    assert.match(statement, /"product_evidence"\."primary_use_case"/);
    assert.match(statement, /coalesce\(nullif\(btrim\(/);
    assert.ok(!statement.includes(" join "));
  }
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
