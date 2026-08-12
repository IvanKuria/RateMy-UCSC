/**
 * @file harvest-instructors.js
 * Term instructor harvester for MyScheduler (Civitas CollegeScheduler).
 *
 * WHY THIS EXISTS
 * ---------------
 * `public/data/prof_uids.json` maps an abbreviated "Last,F." instructor name to
 * a UCSC CruzID. It was assembled by hand, so it drifts: instructors who joined
 * after it was built are missing, and two professors who share a last name and
 * first initial are indistinguishable under that key.
 *
 * MyScheduler's API solves both problems, because the registrar publishes each
 * section's instructor with an email address:
 *
 *     { "name": "Lindsey Kuper", "email": "lkuper@ucsc.edu", ... }
 *
 * The email local-part IS the CruzID, so this yields exact, unambiguous UIDs
 * plus full first names and the subjects each person actually teaches.
 *
 * HOW TO RUN
 * ----------
 * The API is authenticated with the student's own session cookie, so this runs
 * in the browser rather than in Node (a Node port would require hand-copying a
 * short-lived cookie out of devtools, which is both fiddlier and worse for
 * credential hygiene).
 *
 *   1. Sign in to MyUCSC and open Schedule Planner (Enrollment -> Add Classes).
 *   2. Open devtools on the ucsc.collegescheduler.com tab.
 *   3. Paste this entire file into the console and press Enter.
 *   4. It downloads `harvest-<term>.json` when finished (~90s for a full term).
 *   5. Merge it into the bundled data:
 *        node scripts/merge-instructors.mjs ~/Downloads/harvest-<term>.json
 *
 * Harvests are additive — see merge-instructors.mjs. Run this once per term and
 * coverage accumulates; instructors who skip a quarter are never dropped.
 */

(async () => {
  /** Parallel in-flight requests. Enough to finish quickly, gentle enough to
   *  behave like a browsing session rather than a scrape. */
  const CONCURRENCY = 8;

  /**
   * The term whose sections we harvest. Taken from the URL when the script is
   * pasted on a term page (`/terms/2026%20Fall%20Quarter/...`), otherwise from
   * the app's own selection.
   */
  async function resolveTerm() {
    const fromUrl = location.pathname.match(/\/terms\/([^/]+)/);
    if (fromUrl) return decodeURIComponent(fromUrl[1]);

    const appData = await getJson('/api/app-data');
    const selected = appData?.selectedTermId;
    if (selected) return selected;
    throw new Error(
      'Could not determine the term. Navigate to a /terms/<term>/... page first.'
    );
  }

  async function getJson(path) {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} for ${path}`);
    // The SPA serves its index.html for unknown routes, so a 200 is not on its
    // own proof that we got data. Content-type is the real check.
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json'))
      throw new Error(`non-JSON response for ${path}`);
    return res.json();
  }

  /** Runs `task` over every item with a fixed worker pool. */
  async function pooled(items, task) {
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await task(item);
      }
    });
    await Promise.all(workers);
  }

  const term = await resolveTerm();
  const encodedTerm = encodeURIComponent(term);
  console.log(`[harvest] term: ${term}`);

  // ── Enumerate every course in the term ──
  const subjects = await getJson(`/api/terms/${encodedTerm}/subjects`);
  console.log(`[harvest] ${subjects.length} subjects`);

  const courses = [];
  await pooled(subjects, async (subject) => {
    const list = await getJson(
      `/api/terms/${encodedTerm}/subjects/${encodeURIComponent(subject.id)}/courses`
    );
    for (const course of list) courses.push([subject.id, course.number]);
  });
  console.log(`[harvest] ${courses.length} courses`);

  // ── Pull each course's sections and index their instructors ──
  /** CruzID -> { name, subjects: Set<string> } */
  const instructors = new Map();
  const failures = [];
  let completed = 0;

  await pooled(courses, async ([subject, number]) => {
    const path =
      `/api/terms/${encodedTerm}/subjects/${encodeURIComponent(subject)}` +
      `/courses/${encodeURIComponent(number)}/regblocks`;
    try {
      const data = await getJson(path);
      for (const section of data.sections || []) {
        for (const person of section.instructor || []) {
          // Without an email there is no CruzID, and a name alone is exactly
          // the ambiguous key this harvest exists to replace. Skip it.
          if (!person.email) continue;
          const uid = person.email.split('@')[0].toLowerCase();
          if (!uid) continue;

          let entry = instructors.get(uid);
          if (!entry) {
            entry = { name: person.name, subjects: new Set() };
            instructors.set(uid, entry);
          }
          // Prefer the longest spelling seen; some sections list "L Kuper"
          // where others list "Lindsey A Kuper".
          if (person.name && person.name.length > entry.name.length) {
            entry.name = person.name;
          }
          entry.subjects.add(subject);
        }
      }
    } catch (error) {
      failures.push({ subject, number, error: String(error.message || error) });
    } finally {
      completed++;
      if (completed % 100 === 0) {
        console.log(`[harvest] ${completed}/${courses.length} courses`);
      }
    }
  });

  const payload = {
    term,
    harvestedAt: new Date().toISOString(),
    courseCount: courses.length,
    instructorCount: instructors.size,
    failures,
    instructors: Object.fromEntries(
      [...instructors].map(([uid, entry]) => [
        uid,
        { name: entry.name, subjects: [...entry.subjects].sort() },
      ])
    ),
  };

  console.log(
    `[harvest] done — ${payload.instructorCount} instructors, ` +
      `${failures.length} failed course(s)`
  );
  if (failures.length) console.warn('[harvest] failures:', failures);

  // ── Download ──
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `harvest-${term.replace(/\s+/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return payload;
})();
