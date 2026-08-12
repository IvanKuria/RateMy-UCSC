/**
 * @file classFields.ts
 * Readers for the MyUCSC fields that identify a class.
 *
 * WHY THE CLASS NUMBER MATTERS
 * ----------------------------
 * MyUCSC renders instructors abbreviated — "K. Obraczka", "Moulds,G.B." — which
 * is exactly the form that cannot distinguish two professors sharing a last name
 * and first initial. But every enrollment surface also carries the class number,
 * either labelled outright or in parentheses after the class name:
 *
 *     Class Number: 11830                    (search results)
 *     "CSE 200-01 (11897)"                   (cart, drop, enrolled rows)
 *     DERIVED_CLS_DTL_CLASS_NBR$0 -> 11897   (my class schedule)
 *
 * That number is the registrar's key for the section, and MyScheduler's API
 * publishes the same number alongside the instructor's email. So a class number
 * scraped here resolves to an exact CruzID through the bundled map, with no name
 * matching at all — the same accuracy the MyScheduler pages get directly.
 */

/** A class number is a 4-6 digit registrar key ("11897"). */
const CLASS_NUMBER_RE = /\b(\d{4,6})\b/;

/** "CSE 200-01 (11897)" -> subject + catalog number. */
const CLASS_NAME_RE = /\b([A-Z]{2,5})\s+(\d+[A-Z]*)\b/;

export interface ParsedClassName {
  /** Course code in "CSE 200" form, or null. */
  course: string | null;
  /** Registrar class number, or null. */
  classNumber: string | null;
}

/**
 * Parses a MyUCSC class-name string such as "CSE 200-01 (11897)".
 *
 * The section suffix ("-01") is dropped: the course code is only used to pick a
 * subject for disambiguation, and section numbers vary per offering.
 */
export function parseClassName(
  text: string | null | undefined
): ParsedClassName {
  if (!text) return { course: null, classNumber: null };
  const value = String(text).replace(/\s+/g, ' ').trim();

  const nameMatch = value.match(CLASS_NAME_RE);
  const course = nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : null;

  // Only trust a number inside parentheses here. A bare number elsewhere in the
  // string is far more likely to be part of the catalog number ("CSE 101") than
  // a class number, and a wrong class number resolves to a confidently wrong
  // professor — the exact failure this module exists to prevent.
  const parenMatch = value.match(/\((\d{4,6})\)/);
  return { course, classNumber: parenMatch ? parenMatch[1] : null };
}

/**
 * Reads the class number from a panel, trying the labelled field first and
 * falling back to the "(11897)" form inside a class-name string.
 */
export function extractClassNumber(panel: Element): string | null {
  // Search results print it outright: "Class Number: 11830".
  const labelled = (panel.textContent || '').match(
    /Class\s*(?:Number|Nbr)\s*:?\s*(\d{4,6})/i
  );
  if (labelled) return labelled[1];

  // My Class Schedule has a dedicated field.
  const field = panel.querySelector('[id*="CLASS_NBR"]');
  if (field) {
    const match = (field.textContent || '').match(CLASS_NUMBER_RE);
    if (match) return match[1];
  }

  // Cart / drop / enrolled rows embed it in the class-name span.
  const nameSpan = panel.querySelector(
    '[id*="E_CLASS_NAME"], [id*="R_CLASS_NAME"], [id*="CLASS_NAME"]'
  );
  if (nameSpan) {
    const parsed = parseClassName(nameSpan.textContent);
    if (parsed.classNumber) return parsed.classNumber;
  }

  return null;
}

/**
 * Reads the course code ("CSE 200") from a panel's class-name field.
 */
export function extractCourseFromClassName(panel: Element): string | null {
  const nameSpan = panel.querySelector(
    '[id*="E_CLASS_NAME"], [id*="R_CLASS_NAME"], [id*="CLASS_NAME"]'
  );
  if (nameSpan) {
    const parsed = parseClassName(nameSpan.textContent);
    if (parsed.course) return parsed.course;
  }
  return null;
}

/**
 * Reads the term from the page header, which every enrollment screen renders as
 * "2026 Fall Quarter | Graduate | UC Santa Cruz".
 *
 * Required for class-number lookups, because class numbers are only unique
 * within a term — 11897 means different sections in different quarters. Without
 * a term the class-number path is skipped rather than guessed.
 */
export function getPageTerm(root: ParentNode = document): string | null {
  const header = root.querySelector('[id*="SSR_STDNTKEY_DESCR"]');
  const text = (header?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const term = text.split('|')[0]?.trim();
  // Expect "<year> <season> Quarter"; anything else is not a term label.
  return term && /\d{4}\s+\w+\s+Quarter/i.test(term) ? term : null;
}
