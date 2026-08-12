/**
 * @file uidSearchCache.ts
 * Last-resort CruzID lookup via the campus directory's name search.
 *
 * The bundled maps in public/data cover instructors seen in a harvested term.
 * Someone teaching for the first time, or returning after several quarters off,
 * will be missing from both. The directory's search endpoint can find them
 * live:
 *
 *     GET https://campusdirectory.ucsc.edu/api/search/<query>
 *     -> [{ cn, uid, mail, title, departmentnumber, affiliation }, ...]
 *
 * Only unique matches are accepted. Searching "Lee" returns seven faculty, and
 * a scraped "Lee,D." cannot distinguish Dongwook from David — so an ambiguous
 * search resolves to nothing rather than to a coin flip. A missing photo is a
 * gap; the wrong professor's photo is a bug.
 */

import { getCacheDurationMs } from '@/lib/background/cacheConfig';
import { UID_LOOKUP_CACHE_PREFIX } from '@/lib/constants';
import { parseInstructorName } from '@/lib/nameParsing';
import { logger } from '@/lib/logger';

const DIRECTORY_SEARCH_URL = 'https://campusdirectory.ucsc.edu/api/search/';

interface DirectorySearchResult {
  cn?: string;
  uid?: string;
  title?: string;
  departmentnumber?: string;
  affiliation?: string;
}

interface UidSearchCacheEntry {
  /** null is a real, cacheable answer: "searched, found nothing usable". */
  uid: string | null;
  timestamp: number;
}

/**
 * Resolves an instructor name to a CruzID using the campus directory.
 * Returns null when the name is unparseable, the search fails, or the result
 * is ambiguous.
 */
export async function searchUidByName(
  name: string | null | undefined
): Promise<string | null> {
  const { last, firstInitial } = parseInstructorName(name);
  if (!last || !firstInitial) return null;

  const cacheKey = `${UID_LOOKUP_CACHE_PREFIX}${last},${firstInitial}`;

  try {
    const cache = await chrome.storage.local.get([cacheKey]);
    const cached = cache[cacheKey] as UidSearchCacheEntry | undefined;
    const cacheDurationMs = await getCacheDurationMs();
    if (cached && Date.now() - cached.timestamp < cacheDurationMs) {
      return cached.uid;
    }

    const uid = await fetchUniqueFacultyUid(last, firstInitial);

    await chrome.storage.local.set({
      [cacheKey]: { uid, timestamp: Date.now() } satisfies UidSearchCacheEntry,
    });

    return uid;
  } catch (error) {
    logger.error(
      `Directory search failed for "${name}":`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Searches by last name and keeps only faculty whose first initial matches.
 * Resolves only when exactly one person survives.
 */
async function fetchUniqueFacultyUid(
  last: string,
  firstInitial: string
): Promise<string | null> {
  const response = await fetch(
    `${DIRECTORY_SEARCH_URL}${encodeURIComponent(last)}`
  );
  if (!response.ok) return null;

  // A miss returns `{ success: false, message }` rather than an empty array.
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) return null;

  const candidates = (payload as DirectorySearchResult[]).filter((person) => {
    if (person.affiliation !== 'Faculty' || !person.uid || !person.cn) {
      return false;
    }
    const parsed = parseInstructorName(person.cn);
    return parsed.last === last && parsed.firstInitial === firstInitial;
  });

  if (candidates.length === 1) return candidates[0].uid ?? null;

  if (candidates.length > 1) {
    logger.warn(
      `Directory search for "${last},${firstInitial}" matched ` +
        `${candidates.length} faculty — too ambiguous to use.`
    );
  }
  return null;
}
