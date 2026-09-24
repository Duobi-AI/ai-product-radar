import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

const auth = getAuth();
export const { GET, POST } = auth
  ? toNextJsHandler(auth)
  : {
      GET: () => new Response("Authentication is not configured", { status: 503 }),
      POST: () => new Response("Authentication is not configured", { status: 503 }),
    };
