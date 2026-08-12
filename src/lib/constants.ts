/**
 * Centralized cache-key prefixes, storage keys, and well-known IDs that were
 * previously scattered as string literals across modules.
 */

// chrome.storage.local cache-key prefixes
export const RMP_CACHE_PREFIX = 'rmp_';
/** Legacy 'amp_' prefix kept so existing cached campus entries still match. */
export const CAMPUS_CACHE_PREFIX = 'amp_';
export const GRADES_CACHE_PREFIX = 'cache_grades_';
/** Prefix used to key the RMP cache by name when no UID is known. */
export const NAME_CACHE_PREFIX = 'name_';
/** Caches campus-directory name searches (last name -> uid or a miss). */
export const UID_LOOKUP_CACHE_PREFIX = 'uidsearch_';
/** Prefixes the clearCache route sweeps from chrome.storage.local. */
export const CLEARABLE_CACHE_PREFIXES = [
  RMP_CACHE_PREFIX,
  CAMPUS_CACHE_PREFIX,
  UID_LOOKUP_CACHE_PREFIX,
  'cache_',
] as const;

// chrome.storage.sync
export const SETTINGS_KEY = 'rmsSettings';

// chrome.storage.session (side-panel handoff / hydration)
export const PENDING_PROFESSOR_LATEST = 'pendingProfessor_latest';
export const LAST_DISPLAYED_PROFESSOR = 'lastDisplayedProfessor';
export const pendingProfessorKey = (tabId: number): string =>
  `pendingProfessor_${tabId}`;

// Rate My Professors
/** Base64 of "School-1078" (UCSC). */
export const UCSC_SCHOOL_ID = 'U2Nob29sLTEwNzg=';
