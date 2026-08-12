/**
 * @file whatsNew.ts
 * Opens the release notes once after an update.
 *
 * This page carries the one request the extension can no longer make on its
 * own: Schedule Planner access is an optional permission now, and
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
export function registerWhatsNewOnUpdate(): void {
  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (reason !== 'update' && reason !== 'install') return;

    const current = chrome.runtime.getManifest().version;
    if (reason === 'update' && previousVersion === current) return;

    const params = new URLSearchParams({ to: current });
    if (previousVersion) params.set('from', previousVersion);

    try {
      chrome.tabs.create({
        url: chrome.runtime.getURL(`${PAGE}?${params}`),
        // Opened in the background: an update lands while the student is doing
        // something else, and stealing focus to advertise at them is rude.
        active: false,
      });
    } catch (error) {
      logger.error('Could not open the release notes:', error);
    }
  });
}
