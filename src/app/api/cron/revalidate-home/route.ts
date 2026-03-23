import { HYPEMETER_CACHE_TAG_HOME } from "@/lib/homePageCacheConfig";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

/**
 * Warms Next.js Data Cache for the home pipeline (news, Card Highlight, etc.).
 * Call with Authorization: Bearer CRON_SECRET (set in Vercel env).
 * Vercel Hobby cannot schedule frequent crons — use external cron or GitHub Actions, or
 * rely on ISR (15 minute revalidate on home); Pro can add crons in vercel.json.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  revalidateTag(HYPEMETER_CACHE_TAG_HOME, "default");
  return Response.json({ ok: true, revalidated: HYPEMETER_CACHE_TAG_HOME, at: new Date().toISOString() });
}
