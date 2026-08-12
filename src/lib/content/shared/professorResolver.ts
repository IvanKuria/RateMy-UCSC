import { logger } from '@/lib/logger';
import { parseInstructorName } from '@/lib/nameParsing';
import type {
  ProfUidsMap,
  ResearchTopicsMap,
  ClassesMap,
  InstructorsIndex,
  FetchProfessorDataResponse,
} from '@/types';

// Caches for bundled JSON data (loaded on first use)
let profUidsCache: ProfUidsMap | null = null;
let researchCache: ResearchTopicsMap | null = null;
let classesCache: ClassesMap | null = null;
let instructorsCache: InstructorsIndex | null = null;

/**
 * Kicks off all JSON fetches concurrently so data is warm
 * by the time individual professor lookups happen.
 */
export function preloadData(): void {
  loadProfUids();
  loadInstructors();
  fetchLocalResearchData();
  fetchLocalClassesData();
}

/**
 * Loads the harvested instructor index (see scripts/merge-instructors.mjs).
 * Absent or malformed data is not fatal — resolution falls back to the
 * abbreviated map, which is how this worked before the index existed.
 */
async function loadInstructors(): Promise<InstructorsIndex | null> {
  if (instructorsCache) return instructorsCache;

  const url = chrome.runtime.getURL('data/instructors.json');
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    instructorsCache = (await response.json()) as InstructorsIndex;
    return instructorsCache;
  } catch (e) {
    logger.error('Error loading instructors.json:', e);
    return null;
  }
}

/**
 * Loads professor UIDs from the bundled JSON file.
 */
async function loadProfUids(): Promise<ProfUidsMap> {
  if (profUidsCache) return profUidsCache;

  const url = chrome.runtime.getURL('data/prof_uids.json');
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    profUidsCache = await response.json();
    return profUidsCache as ProfUidsMap;
  } catch (e) {
    logger.error('Error loading prof_uids.json:', e);
    return {};
  }
}

/**
 * Extracts a bare CruzID from a prof_uids value, which is historically either
 * a bare uid or a directory URL containing `uid=...`.
 */
function extractUid(value: string | undefined): string | null {
  if (!value) return null;
  const stringValue = String(value);
  const uidMatch = stringValue.match(/uid=([\w-]+)/);
  if (uidMatch && uidMatch[1]) return uidMatch[1];
  return stringValue.includes('http') ? null : stringValue;
}

/**
 * Pulls the subject code out of a course string ("CSE 101" -> "CSE").
 */
function extractSubject(course: string | null | undefined): string | null {
  if (!course) return null;
  const match = String(course)
    .trim()
    .match(/^([A-Za-z]{2,5})\b/);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Resolves a professor's UID, most-confident source first:
 *
 *   1. subject-qualified index — "AM|lee,d" vs "CMPM|lee,d". The only step that
 *      can tell two professors apart when they share a last name and first
 *      initial, which is why it outranks an exact key match: for "Lee,D." on an
 *      AM course the abbreviated map confidently returns the wrong person.
 *   2. exact key in the abbreviated map.
 *   3. unique "Last,F." match in the abbreviated map.
 *
 * Returns null when nothing matches. `course` is optional; without it step 1 is
 * skipped and behaviour is as it was before the index existed.
 */
export async function getUIDFromJson(
  name: string,
  course?: string | null
): Promise<string | null> {
  const data = await loadProfUids();

  const { last, firstInitial } = parseInstructorName(name);
  const subject = extractSubject(course);

  // 1. Subject-qualified.
  if (subject && last && firstInitial) {
    const instructors = await loadInstructors();
    const qualified =
      instructors?.bySubjectName?.[`${subject}|${last},${firstInitial}`];
    if (qualified) return qualified;
  }

  // 2. Exact key.
  const exact = extractUid(data[name]);
  if (exact) return exact;

  // 3. Unique "Last,F." match. Two keys matching means the name is genuinely
  // ambiguous and any pick would be a coin flip, so resolve nothing rather than
  // show a confidently wrong professor.
  if (last && firstInitial) {
    try {
      const matches = Object.keys(data).filter((key) => {
        if (!key.includes(',')) return false;
        const parsed = parseInstructorName(key);
        return parsed.last === last && parsed.firstInitial === firstInitial;
      });

      if (matches.length === 1) return extractUid(data[matches[0]]);
      if (matches.length > 1) {
        logger.warn(
          `Ambiguous instructor "${name}"${subject ? ` (${subject})` : ''}: ` +
            `${matches.length} candidates, no subject match — skipping.`
        );
      }
    } catch (err) {
      logger.error('Error during fuzzy matching:', err);
    }
  }

  return null;
}

/**
 * Sends a message to the background script to fetch all professor data.
 */
export async function fetchProfessorData(
  uID: string | null,
  name: string
): Promise<FetchProfessorDataResponse> {
  return chrome.runtime.sendMessage({
    action: 'fetchProfessorData',
    ID: uID,
    name,
  });
}

/**
 * Fetches research topics from the local JSON file.
 */
export async function fetchLocalResearchData(): Promise<ResearchTopicsMap> {
  if (researchCache) return researchCache;
  const url = chrome.runtime.getURL('data/prof_research_topics.json');
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    researchCache = await response.json();
    return researchCache as ResearchTopicsMap;
  } catch (e) {
    logger.error('Error loading research JSON:', e);
    return {};
  }
}

/**
 * Fetches classes taught from the local JSON file.
 */
export async function fetchLocalClassesData(): Promise<ClassesMap> {
  if (classesCache) return classesCache;
  const url = chrome.runtime.getURL('data/prof_classes.json');
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    classesCache = await response.json();
    return classesCache as ClassesMap;
  } catch (e) {
    logger.error('Error loading classes JSON:', e);
    return {};
  }
}
