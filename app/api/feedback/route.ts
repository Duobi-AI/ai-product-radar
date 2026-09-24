import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { feedback } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save feedback." }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as { productId?: string; direction?: number; reason?: string } | null;
  if (!body || !/^[0-9a-f-]{36}$/i.test(body.productId || "") || ![-1, 0, 1].includes(Number(body.direction))) {
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  }
  if (body.direction === 0) {
    await db.delete(feedback).where(and(eq(feedback.userId, user.id), eq(feedback.productId, body.productId!)));
    return NextResponse.json({ saved: true, direction: 0 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 80) : null;
  await db.insert(feedback).values({ userId: user.id, productId: body.productId!, direction: body.direction!, reason })
    .onConflictDoUpdate({ target: [feedback.userId, feedback.productId], set: { direction: body.direction!, reason, updatedAt: new Date() } });
  return NextResponse.json({ saved: true, direction: body.direction });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to reset preferences." }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  await db.delete(feedback).where(eq(feedback.userId, user.id));
  return NextResponse.json({ cleared: true });
}
