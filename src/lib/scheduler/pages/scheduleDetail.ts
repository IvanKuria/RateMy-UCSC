/**
 * @file scheduleDetail.ts
 * Injection for a generated schedule: /terms/<term>/schedules/<encoded>.
 *
 * Two surfaces, needing opposite treatments:
 *
 *   summary table   Renders Status, Class #, Section, Subject, Course, Seats,
 *                   Waitlist, Day(s) and Credits — and no instructor at all.
 *                   There is no cell to append to and no name in the DOM to
 *                   read, so the rating goes in an appended row and the
 *                   instructor comes entirely from the API. Only ~5 rows here,
 *                   so the extra height costs little and the full pill fits.
 *
 *   calendar blocks Already show the instructor's name, but are only a few
 *                   lines tall. They get the bare badge, no Details button.
 *
 * Note that these URLs are not shareable: opening one directly redirects to the
 * term page, because the schedule only exists in the session that generated it.
 * Injection therefore only ever runs after a real "View" click.
 */

import {
  ensureAllCourseSections,
  getTermFromPath,
  instructorForClassNumber,
  loadTermIndex,
  uidForName,
} from '@/lib/scheduler/api';
import {
  CHIP_BUTTON_SELECTOR,
  SECTION_BUTTON_SELECTOR,
  findSectionRows,
  isProcessed,
  markProcessed,
} from '@/lib/scheduler/shared/dom';
import {
  renderRatings,
  type RatingMountRequest,
} from '@/lib/scheduler/shared/render';

/**
 * Inserts a rating row at the end of the section's own block, returning its cell.
 *
 * A section's row is followed by a variable number of rows belonging to it: the
 * collapsible detail row the app toggles, and sometimes a notes row. The rating
 * belongs after those, so the insertion point is found by scanning forward to
 * the next row that carries a section button — the start of the next section —
 * rather than by appending to the tbody. On the schedules table each tbody
 * currently holds a single section, which makes the two equivalent, but this
 * stays correct if a group ever holds more.
 */
function createRatingRow(
  row: HTMLTableRowElement,
  tbody: HTMLElement
): HTMLTableCellElement {
  const ratingRow = document.createElement('tr');
  ratingRow.className = 'rms-schedule-row';

  const cell = document.createElement('td');
  cell.colSpan = row.cells.length || 1;
  cell.className = 'rms-schedule-cell';
  ratingRow.appendChild(cell);

  let nextSection = row.nextElementSibling;
  while (nextSection && !nextSection.querySelector(SECTION_BUTTON_SELECTOR)) {
    nextSection = nextSection.nextElementSibling;
  }

  tbody.insertBefore(ratingRow, nextSection);
  return cell;
}

export async function render(): Promise<void> {
  const term = getTermFromPath();
  if (!term) return;

  const index = await loadTermIndex(term);
  await ensureAllCourseSections(term);

  const requests: RatingMountRequest[] = [];

  // ── Summary table ──
  for (const { row, classNumber } of findSectionRows(document)) {
    if (isProcessed(row)) continue;
    markProcessed(row);

    const instructor = instructorForClassNumber(index, classNumber);
    if (!instructor?.name) continue;

    const tbody = row.parentElement;
    if (!(tbody instanceof HTMLElement)) continue;

    const section = classNumber
      ? index?.byClassNumber.get(classNumber)
      : undefined;

    const cell = createRatingRow(row, tbody);
    requests.push({
      target: cell,
      name: instructor.name,
      uid: instructor.uid,
      course:
        section?.subject && section.course
          ? `${section.subject} ${section.course}`
          : null,
      variant: 'full',
      // Drop the row entirely if the professor turned out to have no data,
      // rather than leaving an empty band under the section.
      onEmpty: () => cell.closest('tr')?.remove(),
    });
  }

  // ── Calendar blocks ──
  for (const button of document.querySelectorAll(CHIP_BUTTON_SELECTOR)) {
    const chip = button.parentElement;
    if (!chip || isProcessed(chip)) continue;

    // The block's description is two stacked divs: an aria-hidden line with the
    // course and room, then the instructor's name. Anchoring on the aria-hidden
    // attribute avoids both the Emotion class names and the separate
    // mobile-only description block, which has no instructor in it.
    const courseLine = chip.querySelector('div[aria-hidden="true"]');
    const nameElement = courseLine?.nextElementSibling;
    const description = courseLine?.parentElement;
    if (!courseLine || !nameElement || !description) continue;

    markProcessed(chip);

    const name = (nameElement.textContent || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    // "View section details for CSE 210A on Friday" -> "CSE 210A"
    const label = button.getAttribute('aria-label') || '';
    const courseMatch = label.match(/for\s+(.+?)\s+on\s+\S+$/);

    requests.push({
      target: description,
      name,
      uid: uidForName(index, name),
      course: courseMatch ? courseMatch[1] : null,
      variant: 'chip',
    });
  }

  await renderRatings(requests);
}
