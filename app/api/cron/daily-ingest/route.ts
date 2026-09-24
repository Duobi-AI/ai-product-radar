import { NextResponse } from "next/server";
import { isPacificNoonWindow, runDailyIngestion } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ skipped: true, reason: "Database setup is incomplete" });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPacificNoonWindow()) {
    return NextResponse.json({ skipped: true, reason: "Outside the noon Pacific window" });
  }

  try {
    return NextResponse.json(await runDailyIngestion());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily collection failed" },
      { status: 500 },
    );
  }
}
