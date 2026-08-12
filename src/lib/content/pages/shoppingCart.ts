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
  panelSelector: '[id^="trSSR_REGFORM_VW$0_row"]',
  // Marker is per-module, not shared. Several of these tables coexist on one
  // page (the cart sits above the current-schedule list), and modules now run
  // together — a shared marker would let whichever ran first claim a row and
  // silently stop the others from annotating their own.
  processedClass: 'rms-processed-cart',
};

/**
 * Extracts professor name from a shopping cart row.
 * Reformats "J. Doe" to "Doe,J." for UID lookup.
 */
export function extractProfName(panel: Element): string | null {
  const nameBox = panel.querySelector(
    '[id^="win0divDERIVED_REGFRM1_SSR_INSTR_LONG$"]'
  );
  if (!nameBox) return null;

  const name = (nameBox as HTMLElement).outerText?.trim();
  if (!name || isPlaceholderName(name)) return null;

  return reformatInitialLast(name);
}

export function getMountTarget(panel: Element): Element {
  return (
    panel.querySelector('[id*="win0divDERIVED_REGFRM1_SSR_INSTR_LONG$"]') ||
    panel
  );
}

export function renderPage(): Promise<void> {
  return runRenderPipeline({
    config: PAGE_CONFIG,
    extractProfName,
    getMountTarget,
    // Cart rows label the class "CSE 200-01 (11897)", giving both the exact
    // class number and the subject for fallback disambiguation.
    extractCourseCode: extractCourseFromClassName,
    extractClassNumber,
    panelClass: 'prof-cart-panel',
  });
}
