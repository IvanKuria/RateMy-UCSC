/**
 * @file schedulerScript.ts
 * Registers and unregisters the Schedule Planner content script at runtime.
 *
 * The script cannot live in the manifest. A static `content_scripts` entry for
 * a new origin is a privilege increase, and Chrome answers a privilege increase
 * by disabling the extension until the user approves it — taking MyUCSC
 * ratings, which already worked, down with it. Registering at runtime keeps the
 * update silent and ties the script's existence to a permission the user
 * actually granted.
 *
 * Registration state is therefore derived, never assumed: it is recomputed from
 * chrome.permissions on every startup and whenever a permission is added or
 * removed, including from Chrome's own settings where the extension gets no say.
 */

import { logger } from '@/lib/logger';

/** Match pattern for the optional Schedule Planner origin. */
export const SCHEDULER_ORIGIN = 'https://ucsc.collegescheduler.com/*';

/** Stable id so repeated syncs update one registration rather than stacking. */
const SCRIPT_ID = 'scheduler';

/** Build outputs for the runtime-registered entrypoint. */
const SCRIPT_JS = 'content-scripts/scheduler.js';
const SCRIPT_CSS = 'content-scripts/scheduler.css';

/** True when the user has granted access to Schedule Planner. */
export async function hasSchedulerPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [SCHEDULER_ORIGIN] });
  } catch {
    return false;
  }
}

async function isRegistered(): Promise<boolean> {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({
      ids: [SCRIPT_ID],
    });
    return scripts.length > 0;
  } catch {
    // Chrome throws rather than returning empty when the id is unknown.
    return false;
  }
}

/**
 * Brings the registration in line with the current permission.
 *
 * Safe to call repeatedly — it is a reconciliation, not a toggle.
 */
export async function syncSchedulerScript(): Promise<void> {
  const [granted, registered] = await Promise.all([
    hasSchedulerPermission(),
    isRegistered(),
  ]);

  try {
    if (granted && !registered) {
      await chrome.scripting.registerContentScripts([
        {
          id: SCRIPT_ID,
          matches: [SCHEDULER_ORIGIN],
          js: [SCRIPT_JS],
          css: [SCRIPT_CSS],
          runAt: 'document_idle',
          // Survives browser restarts, so the script does not silently vanish
          // until the next time the worker happens to wake.
          persistAcrossSessions: true,
        },
      ]);
      logger.warn('Registered the Schedule Planner content script.');
      return;
    }

    if (!granted && registered) {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      logger.warn(
        'Schedule Planner permission revoked; unregistered its content script.'
      );
    }
  } catch (error) {
    logger.error('Could not sync the Schedule Planner content script:', error);
  }
}

/**
 * Wires up every event that can change the answer. Call synchronously at the
 * top of the service worker.
 */
export function watchSchedulerPermission(): void {
  chrome.permissions.onAdded.addListener(() => void syncSchedulerScript());
  chrome.permissions.onRemoved.addListener(() => void syncSchedulerScript());
  chrome.runtime.onStartup.addListener(() => void syncSchedulerScript());
}
