/**
 * Content-script page detection and the per-page module contract.
 * Source of truth: src/lib/content/shared/pageDetector and the pages/* modules.
 */

export type PageType =
  | 'search'
  | 'cart-shopping'
  | 'cart-enrolled'
  /** Enrollment: Drop Classes. Its rows use the SSV1 view, not SSVW. */
  | 'cart-drop'
  | 'class-detail'
  | 'enrollment-confirm'
  | 'waitlist'
  | 'generic-instructor';

export interface PageConfig {
  /** CSS selector for the page's professor panels. */
  panelSelector: string;
  /** Marker class added to processed panels to avoid reprocessing. */
  processedClass: string;
}

export interface PageModule {
  PAGE_CONFIG: PageConfig;
  extractProfName(panel: Element): string | null;
  getMountTarget(panel: Element): Element;
  renderPage(): Promise<void>;
}
