import { HYPEMETER_CACHE_TAG_HOME } from "@/lib/homePageCacheConfig";
import { revalidatePath, revalidateTag } from "next/cache";

export const runtime = "nodejs";

/**
 * Public manual reload endpoint used by the homepage "Reload" button.
 * Invalidates home-tagged data cache and lets `router.refresh()` request fresh payloads.
 */
export async function POST() {
  // Ensure both data-tag cache and the homepage route cache are invalidated.
  revalidateTag(HYPEMETER_CACHE_TAG_HOME, "default");
  revalidatePath("/");
  return Response.json({ ok: true, revalidated: HYPEMETER_CACHE_TAG_HOME, at: new Date().toISOString() });
}
