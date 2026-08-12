import type { PageType } from '@/types';

/**
 * Panel selectors that identify each page type, checked independently.
 *
 * WHY THIS RETURNS A LIST
 * -----------------------
 * This used to return the first matching page type, and the content script
 * loaded that single module. MyUCSC screens are composite, so that lost
 * content: Add Classes and Shopping Cart each render the cart table *and* the
 * enrolled-classes table beneath it. Detection stopped at "cart-shopping", the
 * cart module annotated its one row, and the five enrolled rows below — the
 * ones with the instructors actually on them — were never touched.
 *
 * The same first-match-wins behaviour also silently broke Drop Classes: an
 * unrelated group box was enough to answer "class-detail", a module which then
 * matched nothing, while the generic fallback that would have worked was never
 * consulted.
 *
 * Every type whose panels are present is now returned, and the caller renders
 * all of them.
 */
const PAGE_SELECTORS: Array<{ type: PageType; selector: string }> = [
  { type: 'search', selector: '.panel.panel-default' },
  { type: 'cart-shopping', selector: '[id^="trSSR_REGFORM_VW$0_row"]' },
  { type: 'cart-enrolled', selector: '[id^="trSTDNT_ENRL_SSVW$0_row"]' },
  { type: 'cart-drop', selector: '[id^="trSTDNT_ENRL_SSV1$0_row"]' },
  {
    type: 'class-detail',
    selector:
      '[id*="SSR_CLSRCH_F_WK"], .PSGROUPBOXWBO:has([id*="MTG_INSTR"]), .PSGROUPBOXWBO:has([id*="INSTR_LONG"])',
  },
];

/**
 * Returns every page type whose panels are present, most specific first.
 *
 * `generic-instructor` is deliberately excluded: it matches instructor fields
 * anywhere on the page, including inside rows the specific modules already
 * handle, so running it alongside them would double-render. The caller uses it
 * only as a fallback when nothing else produced a rating.
 */
export function detectPageTypes(root: ParentNode = document): PageType[] {
  const found: PageType[] = [];
  for (const { type, selector } of PAGE_SELECTORS) {
    if (root.querySelector(selector)) found.push(type);
  }
  return found;
}

/**
 * True when the page has any instructor field at all — the condition for the
 * generic fallback to be worth trying.
 */
export function hasAnyInstructorField(root: ParentNode = document): boolean {
  return Boolean(root.querySelector('[id*="INSTR_LONG"], [id*="MTG_INSTR"]'));
}

/**
 * Back-compatible single-type detection: the first match, or the generic
 * fallback when a page shows instructors that no specific module claims.
 */
export function detectPageType(root: ParentNode = document): PageType | null {
  const [first] = detectPageTypes(root);
  if (first) return first;
  return hasAnyInstructorField(root) ? 'generic-instructor' : null;
}
