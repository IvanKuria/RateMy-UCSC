/**
 * @file dropClasses.ts
 * Enrollment: Drop Classes — `SA_LEARNER_SERVICES.SSR_SSENRL_DROP.GBL`.
 *
 * This page listed five classes and rendered zero ratings.
 *
 * Its rows are `trSTDNT_ENRL_SSV1$0_rowN` — note SSV1, where the enrolled-list
 * page uses SSVW. Nothing matched that view, so no module could annotate it. It
 * was not simply unhandled, either: the page has a `.PSGROUPBOXWBO` and an
 * `INSTR_LONG` somewhere in it, which was enough for detection to answer
 * "class-detail", and that module requires the instructor to sit *inside* a
 * group box. Zero panels matched, and because detection had already committed
 * to an answer, the generic-instructor fallback never ran.
 *
 * Dropping a class is the decision where a rating is arguably most relevant, so
 * this is worth its own module rather than leaving it to the fallback.
 */

import { isPlaceholderName } from '@/lib/content/shared/mountHelper';
import {
  runRenderPipeline,
  reformatInitialLast,
} from '@/lib/content/shared/renderPipeline';
import {
  extractClassNumber,
  extractCourseFromClassName,
} from '@/lib/content/shared/classFields';
import type { PageConfig } from '@/types';

export const PAGE_CONFIG: PageConfig = {
  panelSelector: '[id^="trSTDNT_ENRL_SSV1$0_row"]',
  processedClass: 'rms-processed-drop',
};

/**
 * Reads the instructor from a drop row and reformats "K. Obraczka" into the
 * "Obraczka,K." shape the abbreviated map is keyed by. When the class number
 * resolves, that reformatting is bypassed entirely.
 */
export function extractProfName(panel: Element): string | null {
  const nameBox =
    panel.querySelector('[id^="win0divDERIVED_REGFRM1_SSR_INSTR_LONG$"]') ||
    panel.querySelector('[id*="INSTR_LONG"]');
  if (!nameBox) return null;

  const name = (nameBox as HTMLElement).textContent?.trim();
  if (!name || isPlaceholderName(name)) return null;

  return reformatInitialLast(name);
}

export function getMountTarget(panel: Element): Element {
  return panel.querySelector('[id*="INSTR_LONG"]') || panel;
}

export function renderPage(): Promise<void> {
  return runRenderPipeline({
    config: PAGE_CONFIG,
    extractProfName,
    getMountTarget,
    // Rows read "CSE 200-01 (11897)".
    extractCourseCode: extractCourseFromClassName,
    extractClassNumber,
    panelClass: 'prof-cart-panel',
  });
}
