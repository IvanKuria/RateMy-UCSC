/**
 * @file cacheReset.ts
 * Clearing of the extension's local caches.
 *
 * WHY UPDATES MUST CLEAR
 * ----------------------
 * Cached entries are keyed by CruzID and expire on a time window (a week by
 * default). That is the right policy for data that goes stale on its own — a
 * professor's rating drifting — but the wrong one for data the extension itself
 * corrects.
 *
 * When a release fixes a professor's identity, the old entry is still keyed by
 * the *wrong* uid and is still inside its freshness window, so users keep seeing
 * the wrong photo and department for up to a week after installing the fix.
 * That happened with nine misfiled entries: "Chen,B." pointed at Shaowei Chen,
 * "Anderson,S." at Elliot Anderson, and so on.
 *
 * Clearing on update ties cache lifetime to the code that produced it, which is
 * the actual invariant. It also removes any need to rename cache prefixes to
 * force invalidation — a trick that works once and then leaves the old keys
 * stranded in storage forever, since nothing sweeps a prefix the code no longer
 * knows about.
 */

import { CLEARABLE_CACHE_PREFIXES } from '@/lib/constants';
import { logger } from '@/lib/logger';

/**
 * Removes every cached API response from chrome.storage.local.
 *
 * Deliberately leaves settings alone: those live in chrome.storage.sync and are
 * the user's, not ours to reset.
 */
export async function clearExtensionCaches(): Promise<number> {
  const all = await chrome.storage.local.get();
  const keys = Object.keys(all).filter((key) =>
    CLEARABLE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}

/**
 * Clears caches whenever the extension is installed or updated.
 *
 * MUST be called synchronously at the top level of the service worker. An MV3
 * worker is terminated between events and replayed on the next one; a listener
 * registered inside an async callback can miss the very event it exists for.
 */
export function registerCacheResetOnUpdate(): void {
  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (reason !== 'update' && reason !== 'install') return;

    void (async () => {
      try {
        const cleared = await clearExtensionCaches();
        logger.warn(
          `Cleared ${cleared} cached entr(ies) after ${reason}` +
            (previousVersion ? ` from ${previousVersion}` : '') +
            `. Corrected professor data takes effect immediately.`
        );
      } catch (error) {
        // A failed clear is not fatal: entries still expire on their own
        // window, so the worst case is the previous behaviour.
        logger.error('Cache reset after update failed:', error);
      }
    })();
  });
}
