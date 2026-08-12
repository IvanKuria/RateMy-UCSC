/**
 * @file api.ts
 * Reads section data from MyScheduler's own JSON API.
 *
 * WHY THIS IS WORTH A NETWORK CALL
 * --------------------------------
 * Everywhere else this extension has to work backwards from an abbreviated
 * name ("Kuper,L.") to a CruzID, guessing between people who share a key. Here
 * the registrar hands us the answer directly — every section's instructor comes
 * with an email address whose local-part IS the CruzID:
 *
 *     { "name": "Lindsey Kuper", "email": "lkuper@ucsc.edu", ... }
 *
 * So on this origin there is no matching problem to solve. It also supplies
 * instructors for the one surface that needs them most: the schedule summary
 * table renders no instructor column at all.
 *
 * Requests are same-origin and ride the student's own session — the page has
 * already made these exact calls to render itself. Nothing here is fetched
 * cross-origin and no credential is bundled with the extension.
 *
 * Every function degrades to null rather than throwing. Callers fall back to
 * the instructor name in the DOM plus the bundled maps, which is strictly the
 * behaviour they would have had without this module.
 */

import { logger } from '@/lib/logger';

export interface SchedulerInstructor {
  /** CruzID derived from the instructor's email, or null if none was given. */
  uid: string | null;
  name: string;
}

export interface SchedulerSection {
  classNumber: string;
  subject: string;
  course: string;
  instructors: SchedulerInstructor[];
}

export interface SchedulerIndex {
  /** Class number ("11880") -> section. */
  byClassNumber: Map<string, SchedulerSection>;
  /** Normalized full name ("lindsey kuper") -> CruzID. */
  uidByName: Map<string, string>;
  /** Course id from the URL ("509214") -> { subject, number }. */
  coursesById: Map<string, { subject: string; number: string }>;
}

/** Raw shapes, narrowed to only the fields this module reads. */
interface RawInstructor {
  name?: string;
  email?: string;
}
interface RawSection {
  registrationNumber?: string;
  subject?: string;
  course?: string;
  instructor?: RawInstructor[];
}
interface RawCourse {
  id?: string;
  subjectId?: string;
  number?: string;
}

/** Memoized per term / per course so SPA navigation never refetches. */
const termIndexes = new Map<string, Promise<SchedulerIndex | null>>();
const loadedCourses = new Set<string>();

/**
 * sessionStorage cache.
 *
 * The in-memory memo above only survives while the page lives. That covers SPA
 * navigation, but every full reload — and every fresh MyScheduler tab
 * opened from MyUCSC — starts cold and refetches term-data, plus one regblocks
 * request per desired course on the schedule views.
 *
 * sessionStorage is the right scope for this: it is per-tab and cleared when
 * the tab closes, which matches the lifetime of a MyScheduler session, and
 * it never leaks one student's data into another profile. Only instructor
 * identity is cached — names and CruzIDs, which do not change mid-session.
 * Volatile values like seat counts are read from the live DOM, never from here.
 */
const CACHE_PREFIX = 'rms_scheduler_';
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedTerm {
  v: number;
  savedAt: number;
  sections: SchedulerSection[];
  courses: [string, { subject: string; number: string }][];
  loadedCourseIds: string[];
}

function cacheKey(term: string): string {
  return `${CACHE_PREFIX}${term}`;
}

/** Rebuilds an index from sessionStorage, or null when absent/stale/unusable. */
function restoreIndex(term: string): SchedulerIndex | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(term));
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedTerm;
    if (cached.v !== CACHE_VERSION) return null;
    if (Date.now() - cached.savedAt > CACHE_TTL_MS) return null;

    const index: SchedulerIndex = {
      byClassNumber: new Map(),
      uidByName: new Map(),
      coursesById: new Map(cached.courses),
    };
    for (const section of cached.sections) {
      index.byClassNumber.set(section.classNumber, section);
      for (const person of section.instructors) {
        if (person.uid)
          index.uidByName.set(normalizeName(person.name), person.uid);
      }
    }
    for (const courseId of cached.loadedCourseIds) {
      loadedCourses.add(`${term}::${courseId}`);
    }
    return index;
  } catch {
    // Corrupt entry, or storage blocked entirely. Refetching is always safe.
    return null;
  }
}

/** Writes the current index back to sessionStorage. Failures are ignored. */
function persistIndex(term: string, index: SchedulerIndex): void {
  try {
    const prefix = `${term}::`;
    const payload: CachedTerm = {
      v: CACHE_VERSION,
      savedAt: Date.now(),
      sections: [...index.byClassNumber.values()],
      courses: [...index.coursesById.entries()],
      loadedCourseIds: [...loadedCourses]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
    };
    sessionStorage.setItem(cacheKey(term), JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled — the in-memory index still works.
  }
}

/** Normalizes a display name for use as a lookup key. */
export function normalizeName(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Extracts the term from a MyScheduler path (`/terms/<term>/...`). */
export function getTermFromPath(
  pathname: string = location.pathname
): string | null {
  const match = pathname.match(/\/terms\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Extracts the course id from a section-picker path (`/terms/<t>/courses/<id>`). */
export function getCourseIdFromPath(
  pathname: string = location.pathname
): string | null {
  const match = decodeURIComponent(pathname).match(/\/courses\/([^/]+)$/);
  if (!match) return null;
  // `/courses/add` is the add-course screen, not a course id.
  return match[1] === 'add' ? null : match[1];
}

async function getJson(path: string): Promise<unknown | null> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  // Unknown routes are answered with the SPA's index.html, so a 200 alone does
  // not mean we received data.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) return null;
  return response.json();
}

/** Folds raw sections into the index. */
function indexSections(index: SchedulerIndex, sections: RawSection[]): void {
  for (const section of sections) {
    const classNumber = section.registrationNumber;
    if (!classNumber) continue;

    const instructors: SchedulerInstructor[] = [];
    for (const person of section.instructor || []) {
      if (!person.name) continue;
      const uid = person.email
        ? person.email.split('@')[0].toLowerCase() || null
        : null;
      instructors.push({ uid, name: person.name });
      if (uid) index.uidByName.set(normalizeName(person.name), uid);
    }

    index.byClassNumber.set(String(classNumber), {
      classNumber: String(classNumber),
      subject: section.subject || '',
      course: section.course || '',
      instructors,
    });
  }
}

/**
 * Loads and indexes the term's data: the student's current sections, plus the
 * course-id mapping the section-picker page needs.
 */
export function loadTermIndex(term: string): Promise<SchedulerIndex | null> {
  const cached = termIndexes.get(term);
  if (cached) return cached;

  const pending = (async (): Promise<SchedulerIndex | null> => {
    const restored = restoreIndex(term);
    if (restored) return restored;

    try {
      const data = (await getJson(
        `/api/term-data/${encodeURIComponent(term)}`
      )) as { currentSections?: RawSection[]; courses?: RawCourse[] } | null;
      if (!data) return null;

      const index: SchedulerIndex = {
        byClassNumber: new Map(),
        uidByName: new Map(),
        coursesById: new Map(),
      };

      indexSections(index, data.currentSections || []);

      for (const course of data.courses || []) {
        if (course.id && course.subjectId && course.number) {
          index.coursesById.set(String(course.id), {
            subject: course.subjectId,
            number: course.number,
          });
        }
      }

      persistIndex(term, index);
      return index;
    } catch (error) {
      logger.error('MyScheduler term-data fetch failed:', error);
      return null;
    }
  })();

  termIndexes.set(term, pending);
  return pending;
}

/**
 * Adds a single course's sections to the index, for the section-picker page.
 * The picker's URL carries an internal course id rather than subject/number,
 * so the term index is consulted to translate it.
 *
 * No-ops (returning true) once a course has been loaded, so the observer can
 * call this on every re-render without refetching.
 */
export async function ensureCourseSections(
  term: string,
  courseId: string
): Promise<boolean> {
  const courseKey = `${term}::${courseId}`;
  if (loadedCourses.has(courseKey)) return true;

  const index = await loadTermIndex(term);
  if (!index) return false;

  const course = index.coursesById.get(courseId);
  if (!course) return false;

  try {
    const path =
      `/api/terms/${encodeURIComponent(term)}` +
      `/subjects/${encodeURIComponent(course.subject)}` +
      `/courses/${encodeURIComponent(course.number)}/regblocks`;
    const data = (await getJson(path)) as { sections?: RawSection[] } | null;
    if (!data) return false;

    indexSections(index, data.sections || []);
    loadedCourses.add(courseKey);
    persistIndex(term, index);
    return true;
  } catch (error) {
    logger.error('MyScheduler regblocks fetch failed:', error);
    return false;
  }
}

/**
 * Loads sections for every course the student has added this term.
 *
 * A generated schedule mixes enrolled sections (already in term-data) with
 * candidate sections from desired courses (not in term-data), so the schedule
 * views need all of them before they can name an instructor. One request per
 * desired course, memoized, and a failure on one course does not sink the rest.
 */
export async function ensureAllCourseSections(term: string): Promise<void> {
  const index = await loadTermIndex(term);
  if (!index) return;

  await Promise.allSettled(
    [...index.coursesById.keys()].map((courseId) =>
      ensureCourseSections(term, courseId)
    )
  );
}

/**
 * Returns the primary instructor for a class number. Sections may list several
 * (co-taught, or a lecturer plus a supervising PI); the rating UI shows one, so
 * the first named instructor wins — the same one the app itself displays.
 */
export function instructorForClassNumber(
  index: SchedulerIndex | null,
  classNumber: string | null | undefined
): SchedulerInstructor | null {
  if (!index || !classNumber) return null;
  const section = index.byClassNumber.get(String(classNumber));
  return section?.instructors[0] ?? null;
}

/** Resolves a CruzID from a display name seen in the DOM. */
export function uidForName(
  index: SchedulerIndex | null,
  name: string | null | undefined
): string | null {
  if (!index || !name) return null;
  return index.uidByName.get(normalizeName(name)) ?? null;
}
