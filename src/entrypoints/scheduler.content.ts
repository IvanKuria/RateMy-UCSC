/**
 * @file scheduler.content.ts
 * WXT content script for MyScheduler (ucsc.collegescheduler.com).
 *
 * Kept separate from content.ts because the two hosts have almost nothing in
 * common. MyUCSC is PeopleSoft: full page loads, partial postbacks, and
 * instructor names abbreviated to "Kuper,L." that have to be matched against a
 * bundled map. MyScheduler is a React SPA that never reloads, hashes its own
 * class names, and publishes exact instructor identities over JSON. Sharing one
 * detector and one pipeline between them would mean two sets of assumptions
 * fighting inside every function.
 *
 * What IS shared: the RatingBar component and its stylesheet, the mount
 * helpers, the background worker, and the side panel.
 *
 * Two things drive re-rendering here, and both are required:
 *
 *   route changes  The SPA navigates with pushState, so DOMContentLoaded fires
 *                  exactly once for the whole session.
 *   re-renders     React discards and rebuilds rows in place — switching the
 *                  Included/Excluded tab on the picker wipes every injected
 *                  node without any URL change.
 */

import '@/assets/rating-bar.css';
import {
  detectPageType,
  type SchedulerPageType,
} from '@/lib/scheduler/pageDetector';
import { preloadData } from '@/lib/content/shared/professorResolver';
import { logger } from '@/lib/logger';

const PAGE_LOADERS: Record<
  SchedulerPageType,
  () => Promise<{ render: () => Promise<void> }>
> = {
  'section-tables': () => import('@/lib/scheduler/pages/sectionTables'),
  'schedule-detail': () => import('@/lib/scheduler/pages/scheduleDetail'),
};

export default defineContentScript({
  matches: ['https://ucsc.collegescheduler.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  main() {
    /** Debounce window for coalescing bursts of React re-render mutations. */
    const RENDER_DEBOUNCE_MS = 200;

    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let rerunRequested = false;

    /**
     * Renders the module for the current route.
     *
     * Serialized: a render is asynchronous (it awaits the API and the
     * background worker), and the observer fires continuously while React
     * rebuilds rows. Overlapping runs would race to inject into the same cells.
     * A request arriving mid-flight sets a flag and runs once afterwards.
     */
    async function renderNow(): Promise<void> {
      if (inFlight) {
        rerunRequested = true;
        return;
      }

      const pageType = detectPageType();
      if (!pageType) return;

      inFlight = true;
      try {
        const module = await PAGE_LOADERS[pageType]();
        await module.render();
      } catch (error) {
        logger.error('MyScheduler render failed:', error);
      } finally {
        inFlight = false;
        if (rerunRequested) {
          rerunRequested = false;
          scheduleRender();
        }
      }
    }

    function scheduleRender(): void {
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(renderNow, RENDER_DEBOUNCE_MS);
    }

    /**
     * Watches for the app rebuilding its content.
     *
     * Only reacts to added elements that contain one of our anchors, so the
     * observer ignores its own injections and cannot feed itself: a rating
     * badge is a span, and never matches these selectors.
     */
    function observeContent(): void {
      const ANCHORS =
        'button[aria-controls^="section_details_"],' +
        'button[aria-label^="View section details for"]';

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches(ANCHORS) || node.querySelector(ANCHORS)) {
              scheduleRender();
              return;
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * Detects SPA navigation.
     *
     * The obvious approach — monkey-patching history.pushState — does not work
     * from a content script. Content scripts run in an isolated world, so
     * reassigning `history.pushState` here only rebinds this world's view of
     * it; the page keeps calling its own untouched copy and the hook never
     * fires. That failure is silent, which makes it worth stating outright.
     *
     * What does cross the boundary: `popstate` (a real DOM event, so back and
     * forward are covered) and the URL itself, which both worlds share. So the
     * path is polled, and a change triggers a render. The interval only
     * compares two strings, and the MutationObserver usually gets there first
     * anyway — this is the backstop for a navigation that reuses DOM nodes
     * instead of adding new ones.
     */
    function observeRouteChanges(): void {
      const POLL_MS = 500;
      let lastPath = location.pathname;

      const checkPath = () => {
        if (location.pathname === lastPath) return;
        lastPath = location.pathname;
        scheduleRender();
      };

      window.addEventListener('popstate', checkPath);
      setInterval(checkPath, POLL_MS);
    }

    // Warm the bundled JSON while the first render is still resolving routes.
    preloadData();

    observeRouteChanges();
    observeContent();
    scheduleRender();
  },
});
