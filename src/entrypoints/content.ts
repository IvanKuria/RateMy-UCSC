/**
 * @file content.ts
 * WXT content script entrypoint.
 * Injects into UCSC enrollment pages and renders professor rating UI.
 *
 * Runs at document_start for earlier rendering. CSS is injected via manifest
 * into the host page (all classes are rms- prefixed to avoid collisions).
 */

import '@/assets/rating-bar.css';
import {
  detectPageTypes,
  hasAnyInstructorField,
} from '@/lib/content/shared/pageDetector';
import { setupObserver } from '@/lib/content/shared/mountHelper';
import { preloadData } from '@/lib/content/shared/professorResolver';
import type { PageType, PageModule } from '@/types';

/**
 * Lazy-load only the page modules that match the current page.
 * Reduces initial parse/eval cost since unused modules are never loaded.
 */
const PAGE_LOADERS: Partial<Record<PageType, () => Promise<PageModule>>> = {
  search: () => import('@/lib/content/pages/searchResults'),
  'cart-shopping': () => import('@/lib/content/pages/shoppingCart'),
  'cart-enrolled': () => import('@/lib/content/pages/enrolledClasses'),
  'cart-drop': () => import('@/lib/content/pages/dropClasses'),
  'class-detail': () => import('@/lib/content/pages/classDetail'),
  'enrollment-confirm': () => import('@/lib/content/pages/classDetail'),
  waitlist: () => import('@/lib/content/pages/shoppingCart'),
  'generic-instructor': () => import('@/lib/content/pages/genericInstructor'),
};

/** Any rating bar the extension has mounted, in any state. */
const RENDERED_SELECTOR = '.rms-rating-bar-root';

export default defineContentScript({
  matches: ['https://my.ucsc.edu/*', 'https://pisa.ucsc.edu/*'],
  runAt: 'document_start',
  allFrames: true,
  cssInjectionMode: 'manifest',

  async main() {
    /**
     * Activates one page module: renders immediately, then watches for panels
     * added by later partial postbacks.
     */
    async function activate(pageType: PageType): Promise<void> {
      const loader = PAGE_LOADERS[pageType];
      if (!loader) return;

      const mod = await loader();
      await mod.renderPage();
      setupObserver(mod.PAGE_CONFIG.panelSelector, () => {
        mod.renderPage();
      });
    }

    /**
     * Activates every module whose panels are on the page.
     *
     * All of them, not just the first: a single MyUCSC screen commonly renders
     * more than one kind of class table — the shopping cart sits directly above
     * the enrolled-classes list — and annotating only the first leaves most of
     * the instructors on the page bare.
     */
    async function activateAll(pageTypes: PageType[]): Promise<void> {
      // Start preloading JSON data concurrently with the module loads.
      preloadData();

      await Promise.all(pageTypes.map(activate));

      // The generic module matches instructor fields anywhere, including inside
      // rows the specific modules own, so it runs only as a fallback — when a
      // page shows instructors but nothing above claimed them. That is what
      // Drop Classes needed for a long time and never got, because detection
      // committed to a module that could not render it.
      if (
        !document.querySelector(RENDERED_SELECTOR) &&
        hasAnyInstructorField()
      ) {
        await activate('generic-instructor');
      }
    }

    /**
     * Try to detect page types and activate immediately.
     * Returns true if any panels were found, false otherwise.
     */
    function tryInit() {
      const pageTypes = detectPageTypes().filter((t) => PAGE_LOADERS[t]);
      if (pageTypes.length) {
        activateAll(pageTypes);
        return true;
      }
      // No specific panels, but the page may still show an instructor.
      if (hasAnyInstructorField()) {
        activateAll([]);
        return true;
      }
      return false;
    }

    /**
     * Watches for panels to appear in the DOM.
     * Once any known panel selector is found, activate and disconnect.
     */
    function waitForPanels() {
      const observer = new MutationObserver(() => {
        const pageTypes = detectPageTypes().filter((t) => PAGE_LOADERS[t]);
        if (pageTypes.length) {
          observer.disconnect();
          activateAll(pageTypes);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Safety: stop waiting after 30s to avoid leaking observers
      setTimeout(() => observer.disconnect(), 30000);
    }

    /**
     * Waits for document.body to exist (necessary since we run at document_start).
     */
    function waitForBody(): Promise<void> {
      return new Promise((resolve) => {
        if (document.body) {
          resolve();
          return;
        }

        const observer = new MutationObserver(() => {
          if (document.body) {
            observer.disconnect();
            resolve();
          }
        });

        observer.observe(document.documentElement, {
          childList: true,
        });

        const interval = setInterval(() => {
          if (document.body) {
            clearInterval(interval);
            observer.disconnect();
            resolve();
          }
        }, 10);

        setTimeout(() => {
          clearInterval(interval);
          observer.disconnect();
          resolve();
        }, 10000);
      });
    }

    // ── Entry point ──
    await waitForBody();

    if (!tryInit()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          if (!tryInit()) waitForPanels();
        });
      } else {
        waitForPanels();
      }
    }
  },
});
