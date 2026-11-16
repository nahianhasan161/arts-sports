import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

/**
 * ISR cache. Pages with `export const revalidate` (home, product, team,
 * collection) are stored in the R2 bucket bound as NEXT_INC_CACHE_R2_BUCKET
 * (see wrangler.jsonc) and rebuilt in the background when stale.
 *
 * - The regional cache keeps hot entries in the Workers Cache API in front of
 *   R2, so most hits never reach R2 at all.
 * - The memory queue triggers background rebuilds through the
 *   WORKER_SELF_REFERENCE service binding. It is fine at this traffic; switch
 *   to the Durable Object queue if rebuilds ever pile up.
 * - No tag cache: freshness is time-based (60 s). Add the D1 tag cache if
 *   revalidatePath/revalidateTag on save is ever needed.
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  queue: memoryQueue,
  enableCacheInterception: true,
});
