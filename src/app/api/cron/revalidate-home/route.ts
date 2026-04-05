import { HYPEMETER_CACHE_TAG_HOME } from "@/lib/homePageCacheConfig";
import { refreshHomePageRuntimeSnapshot } from "@/lib/homePageRuntimeSnapshot";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

function hourInRome(now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const hour = Number(formatted);
  return Number.isNaN(hour) ? now.getUTCHours() : hour;
}

/**
 * Warms Next.js Data Cache for the home pipeline (news, Card Highlight, etc.).
 * Call with Authorization: Bearer CRON_SECRET (set in Vercel env).
 * Vercel Hobby cannot schedule frequent crons — use external cron or GitHub Actions, or
 * rely on ISR (15 minute revalidate on home); Pro can add crons in vercel.json.
 * Quiet window: skip manual revalidation from 23:00 to 09:00 Europe/Rome.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const hour = hourInRome(now);
  const inQuietWindow = hour >= 23 || hour < 9;
  if (inQuietWindow) {
    return Response.json({
      ok: true,
      paused: true,
      reason: "quiet_window_23_09_rome",
      at: now.toISOString(),
      timezone: "Europe/Rome",
    });
  }

  revalidateTag(HYPEMETER_CACHE_TAG_HOME, "default");
  try {
    await refreshHomePageRuntimeSnapshot();
  } catch {
    /* keep old snapshot if upstreams fail */
  }
  return Response.json({ ok: true, revalidated: HYPEMETER_CACHE_TAG_HOME, at: now.toISOString() });
}
