/**
 * @file dom.ts
 * DOM helpers for the MyScheduler surfaces.
 *
 * SELECTOR POLICY
 * ---------------
 * MyScheduler styles itself with Emotion, so every class in its markup is a
 * content hash:
 *
 *     <td class="css-1p12g40-cellCss-hideOnMobileCss">
 *
 * Those hashes change whenever Civitas rebuilds the app, and they change
 * silently — selectors keep parsing, they just stop matching, and the injection
 * quietly disappears. Nothing in this module may select on a `css-*` class.
 *
 * What it selects on instead is the accessibility markup, which is a contract
 * the vendor maintains deliberately: `aria-controls`, `aria-label`, and header
 * text. Column positions are derived by reading the `<thead>` rather than being
 * hardcoded, so inserting or reordering a column cannot silently misread a row.
 */

/** Marks a row/chip as already carrying an injection. */
export const PROCESSED_ATTR = 'data-rms-processed';

/** Anchor for a section row: the app's own "Show Section Details" button. */
export const SECTION_BUTTON_SELECTOR =
  'button[aria-controls^="section_details_"]';

/** Anchor for a calendar block. */
export const CHIP_BUTTON_SELECTOR =
  'button[aria-label^="View section details for"]';

export interface SectionRow {
  row: HTMLTableRowElement;
  /**
   * The class number, read from the button's aria-label ("... #11880").
   *
   * Deliberately NOT read from `aria-controls`/`id`: the section picker pairs
   * one lecture with each lab, so `id="section_details_11880"` legitimately
   * appears six times on that page. Duplicate ids make the class number useless
   * as a DOM lookup key, which is why injection state is tracked on the row
   * element itself rather than by class number.
   */
  classNumber: string | null;
}

/**
 * Finds every section row under `root`, paired with its class number.
 */
export function findSectionRows(root: ParentNode): SectionRow[] {
  const rows: SectionRow[] = [];
  for (const button of root.querySelectorAll(SECTION_BUTTON_SELECTOR)) {
    const row = button.closest('tr');
    if (!(row instanceof HTMLTableRowElement)) continue;

    const label = button.getAttribute('aria-label') || '';
    const match = label.match(/#(\d+)\s*$/);
    rows.push({ row, classNumber: match ? match[1] : null });
  }
  return rows;
}

/**
 * Returns the index of the column whose header matches `headerText`, or -1.
 * Matching is case-insensitive and trims the screen-reader text the app mixes
 * into some headers.
 */
export function findColumnIndex(
  table: HTMLTableElement,
  headerText: string
): number {
  const headers = table.querySelectorAll('thead th');
  const target = headerText.trim().toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    const text = (headers[i].textContent || '').trim().toLowerCase();
    if (text === target) return i;
  }
  return -1;
}

/**
 * Returns the cell at `index` in a row, or null when the row is short — footer
 * and detail rows live in the same tbody and have their own shapes.
 */
export function cellAt(
  row: HTMLTableRowElement,
  index: number
): HTMLTableCellElement | null {
  if (index < 0) return null;
  const cells = row.cells;
  return index < cells.length ? cells[index] : null;
}

/**
 * Reads a cell's visible text, collapsing whitespace. Returns null for an empty
 * cell — which is meaningful here, since labs and discussion sections leave the
 * Instructor column blank.
 */
export function readCellText(cell: HTMLTableCellElement | null): string | null {
  if (!cell) return null;
  const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
  return text || null;
}

/** True when the element has already been processed this render. */
export function isProcessed(element: Element): boolean {
  return element.hasAttribute(PROCESSED_ATTR);
}

/**
 * Marks an element processed.
 *
 * React replaces rows wholesale on re-render (switching the Included/Excluded
 * tab discards and rebuilds every row), so a replacement arrives without this
 * attribute and is correctly picked up again. The marker only needs to stop
 * double-injection within the lifetime of one element.
 */
export function markProcessed(element: Element): void {
  element.setAttribute(PROCESSED_ATTR, '');
}
