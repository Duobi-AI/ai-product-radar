import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export async function getCurrentUser() {
  const auth = getAuth();
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
