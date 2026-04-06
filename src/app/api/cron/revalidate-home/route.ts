import { HYPEMETER_CACHE_TAG_HOME } from "@/lib/homePageCacheConfig";
import { refreshHomePageRuntimeSnapshot } from "@/lib/homePageRuntimeSnapshot";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

/**
 * Warms Next.js Data Cache for the home pipeline (news, Card Highlight, etc.).
 * Call with Authorization: Bearer CRON_SECRET (set in Vercel env).
 * Runs on the backend schedule (every 5 hours) to refresh DB snapshot.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const hasValidBearer = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!isVercelCron && !hasValidBearer) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  revalidateTag(HYPEMETER_CACHE_TAG_HOME, "default");
  try {
    await refreshHomePageRuntimeSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh_failed";
    return Response.json(
      { ok: false, error: message, revalidated: HYPEMETER_CACHE_TAG_HOME, at: now.toISOString() },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, revalidated: HYPEMETER_CACHE_TAG_HOME, at: now.toISOString() });
}
