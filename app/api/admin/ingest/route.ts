import { NextResponse } from "next/server";
import { runDailyIngestion } from "@/lib/ingest";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to refresh the feed." }, { status: 401 });
  try {
    return NextResponse.json(await runDailyIngestion({ force: true }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection failed." }, { status: 500 });
  }
}
