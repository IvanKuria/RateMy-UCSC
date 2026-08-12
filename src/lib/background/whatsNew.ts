/**
 * @file whatsNew.ts
 * Opens the release notes once after an update.
 *
 * This page carries the one request the extension can no longer make on its
 * own: MyScheduler access is an optional permission now, and
 * chrome.permissions.request() needs a real user gesture. Without a page of our
 * own there is nowhere to ask from — the extension cannot inject into Schedule
 * Planner to prompt there, precisely because it lacks the permission it wants.
 *
 * So the page is not an announcement with a button bolted on. It is the only
 * place the feature can be turned on, and it explains itself on the way.
 */

import { logger } from '@/lib/logger';

const PAGE = 'whats-new.html';

/**
 * Shows the notes after install or update.
 *
 * Skipped when the version is unchanged, which is what a developer reload of an
 * unpacked build looks like — otherwise every rebuild spawns a tab.
 */
/** Builds the notes URL, carrying the versions the update moved between. */
export function whatsNewUrl(previousVersion?: string): string {
  const current = chrome.runtime.getManifest().version;
  const params = new URLSearchParams({ to: current });
  if (previousVersion && previousVersion !== current) {
    params.set('from', previousVersion);
  }
  return chrome.runtime.getURL(`${PAGE}?${params}`);
}

/** Opens the notes in a focused tab. */
export function openWhatsNew(previousVersion?: string): void {
  try {
    chrome.tabs.create({
      url: whatsNewUrl(previousVersion),
      // Focused, not background. This page exists to ask for a permission the
      // extension cannot request anywhere else — a tab that opens quietly
      // behind whatever the student is doing is the same as not opening.
      active: true,
    });
  } catch (error) {
    logger.error('Could not open the release notes:', error);
  }
}

export function registerWhatsNewOnUpdate(): void {
  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (reason !== 'update' && reason !== 'install') return;

    // Reloading an unpacked build fires 'update' with the version unchanged.
    // Suppressed so a rebuild does not spawn a tab every time — which also
    // means "reload the extension" will not show this page. Use the link in
    // settings, or open whats-new.html directly, to see it on demand.
    const current = chrome.runtime.getManifest().version;
    if (reason === 'update' && previousVersion === current) return;

    openWhatsNew(previousVersion);
  });
}
