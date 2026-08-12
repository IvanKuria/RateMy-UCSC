/**
 * @file pageDetector.ts
 * Route classification for MyScheduler.
 *
 * Only ONE surface is identified by its route: the generated schedule at
 * /terms/<term>/schedules/<hash>. It needs its own module because its table has
 * no Instructor column and it carries a calendar alongside.
 *
 * Everything else is treated as a candidate for the section-table surface, and
 * that module decides for itself whether there is anything to do — it skips any
 * table without an Instructor column and produces nothing when no section rows
 * exist.
 *
 * That fallback is deliberate. An earlier version enumerated the routes which
 * show section tables, and got it wrong: the app's landing page is
 * /terms/<term>/options — headed "Home" — and it renders the very same Current
 * Schedule table as /terms/<term>/courses. Enumerating routes meant the page
 * users actually arrive on was silently skipped while pages reached by
 * navigating worked, which is a confusing way to fail. Deciding from the DOM
 * means an uncatalogued route (or one Civitas adds later) gets handled on its
 * merits instead of ignored.
 */

export type SchedulerPageType = 'section-tables' | 'schedule-detail';

export function detectPageType(
  pathname: string = location.pathname
): SchedulerPageType | null {
  const path = decodeURIComponent(pathname);

  // Every in-app screen is scoped to a term. The bare /terms/<term> chooser has
  // no trailing segment and nothing to annotate.
  if (!/\/terms\/[^/]+\//.test(path)) return null;

  // A schedule needs its hash segment; the bare /schedules list has none.
  if (/\/schedules\/[^/]+$/.test(path)) return 'schedule-detail';

  return 'section-tables';
}
