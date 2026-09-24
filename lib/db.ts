import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

type Database = NeonHttpDatabase<typeof schema>;

let database: Database | null = null;

export function getDb(): Database | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!database) {
    database = drizzle(neon(url), { schema });
  }
  return database;
}
