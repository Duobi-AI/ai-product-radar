import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import * as schema from "@/db/schema";
import { getDb } from "@/lib/db";

type AuthInstance = ReturnType<typeof betterAuth>;
let authInstance: AuthInstance | null = null;

export function isAuthConfigured() {
  return Boolean(
    process.env.DATABASE_URL &&
      process.env.BETTER_AUTH_SECRET &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
}

export function getAuth(): AuthInstance | null {
  if (!isAuthConfigured()) return null;
  if (authInstance) return authInstance;

  const database = getDb();
  if (!database) return null;

  const options: BetterAuthOptions = {
    appName: "AI Product Radar",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    socialProviders: {
      google: {
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      },
    },
    trustedOrigins: process.env.BETTER_AUTH_URL
      ? [process.env.BETTER_AUTH_URL]
      : undefined,
    advanced: {
      cookiePrefix: "ai-product-radar",
    },
  };
  authInstance = betterAuth(options);
  return authInstance;
}
