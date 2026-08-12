/**
 * @file sectionTables.ts
 * Injection for the two MyScheduler tables that carry an Instructor column:
 *
 *   /terms/<term>/courses        the "Current Schedule" table on the home page
 *   /terms/<term>/courses/<id>   the section picker
 *
 * Both use the same row markup, so they share one implementation. The compact
 * pill goes inside the Instructor cell, immediately after the name, which keeps
 * every row exactly as tall as the app drew it. That matters most on the
 * picker: it pairs each lab with a repeat of the lecture row, so CSE 101 shows
 * the same lecture six times. A full-height injection there would be repeated
 * six times too and would swamp the page it is meant to annotate.
 */

import {
  ensureCourseSections,
  getCourseIdFromPath,
  getTermFromPath,
  instructorForClassNumber,
  loadTermIndex,
  uidForName,
  type SchedulerIndex,
} from '@/lib/scheduler/api';
import {
  cellAt,
  findColumnIndex,
  findSectionRows,
  isProcessed,
  markProcessed,
  readCellText,
} from '@/lib/scheduler/shared/dom';
import {
  renderRatings,
  type RatingMountRequest,
} from '@/lib/scheduler/shared/render';

/**
 * Course code for a row, preferring the API (authoritative) and falling back to
 * the table's own Subject/Course columns when the API had nothing.
 */
function courseCodeFor(
  index: SchedulerIndex | null,
  classNumber: string | null,
  row: HTMLTableRowElement,
  subjectIndex: number,
  courseIndex: number
): string | null {
  const section = classNumber
    ? index?.byClassNumber.get(classNumber)
    : undefined;
  if (section?.subject && section.course) {
    return `${section.subject} ${section.course}`;
  }

  const subject = readCellText(cellAt(row, subjectIndex));
  const course = readCellText(cellAt(row, courseIndex));
  return subject && course ? `${subject} ${course}` : subject;
}

export async function render(): Promise<void> {
  const term = getTermFromPath();
  if (!term) return;

  const index = await loadTermIndex(term);

  // The picker's sections are not in term-data — they belong to a course the
  // student is still choosing between — so pull that course in as well.
  const courseId = getCourseIdFromPath();
  if (courseId) await ensureCourseSections(term, courseId);

  const requests: RatingMountRequest[] = [];

  for (const table of document.querySelectorAll('table')) {
    if (!(table instanceof HTMLTableElement)) continue;

    const instructorIndex = findColumnIndex(table, 'Instructor');
    if (instructorIndex < 0) continue;

    const subjectIndex = findColumnIndex(table, 'Subject');
    const courseIndex = findColumnIndex(table, 'Course');

    for (const { row, classNumber } of findSectionRows(table)) {
      if (isProcessed(row)) continue;

      const cell = cellAt(row, instructorIndex);
      if (!cell) continue;

      // Labs and discussion sections have an empty Instructor cell. The API
      // agrees, so there is genuinely nobody to rate.
      const apiInstructor = instructorForClassNumber(index, classNumber);
      const name = apiInstructor?.name ?? readCellText(cell);
      if (!name) {
        markProcessed(row);
        continue;
      }

      markProcessed(row);
      requests.push({
        target: cell,
        name,
        uid: apiInstructor?.uid ?? uidForName(index, name),
        course: courseCodeFor(
          index,
          classNumber,
          row,
          subjectIndex,
          courseIndex
        ),
        variant: 'compact',
      });
    }
  }

  await renderRatings(requests);
}
