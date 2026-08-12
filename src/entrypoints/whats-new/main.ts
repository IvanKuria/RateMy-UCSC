/**
 * @file main.ts
 * Behaviour for the release-notes page.
 *
 * Two jobs: stamp the versions the update moved between, and host the one
 * permission request the extension cannot make anywhere else.
 * chrome.permissions.request() needs a user gesture, and the extension cannot
 * inject a prompt into Schedule Planner because lacking that very permission is
 * the problem — so the button here is the only door in.
 */

const SCHEDULER_ORIGIN = 'https://ucsc.collegescheduler.com/*';

const els = {
  version: document.getElementById('version'),
  ask: document.getElementById('ask'),
  title: document.getElementById('ask-title'),
  copy: document.getElementById('ask-copy'),
  allow: document.getElementById('allow') as HTMLButtonElement | null,
  state: document.getElementById('state'),
};

/** "v2.1.0 → v2.2.0", or just the current version on a fresh install. */
function stampVersion(): void {
  if (!els.version) return;
  const params = new URLSearchParams(location.search);
  const from = params.get('from');
  // Prefer the query string so the page still stamps correctly when opened
  // outside an extension context, e.g. previewing the build over http.
  const to = params.get('to') ?? chrome?.runtime?.getManifest?.().version ?? '';
  if (!to) return;
  els.version.textContent =
    from && from !== to ? `v${from} → v${to}` : `v${to}`;
}

/**
 * Renders the permission block for the current state.
 *
 * The block changes in place rather than being replaced by a success banner:
 * same heading position, same copy slot, with the gold rule turning green. A
 * granted permission is a change of state, not a new screen.
 */
function renderGrantState(granted: boolean): void {
  const { ask, title, copy, allow, state } = els;
  if (!ask || !title || !copy || !allow || !state) return;

  ask.dataset.state = granted ? 'on' : 'off';
  allow.hidden = granted;
  state.hidden = !granted;

  if (granted) {
    title.textContent = 'schedule planner is on';
    copy.textContent =
      'open a schedule and the ratings will be there. you can turn this back off any time from the extension’s site access settings.';
  } else {
    title.textContent = 'one thing to turn on';
    copy.textContent =
      'schedule planner is a different site from myucsc, so chrome needs your permission before the extension can read it. only ucsc.collegescheduler.com, only while you are on it — nothing is sent anywhere.';
  }
}

async function refresh(): Promise<void> {
  try {
    renderGrantState(
      await chrome.permissions.contains({ origins: [SCHEDULER_ORIGIN] })
    );
  } catch {
    // Nothing useful to say if the query fails; the default "off" state still
    // offers the button.
  }
}

els.allow?.addEventListener('click', async () => {
  // Called directly in the handler: awaiting anything first spends the user
  // gesture and Chrome rejects the request.
  try {
    const granted = await chrome.permissions.request({
      origins: [SCHEDULER_ORIGIN],
    });
    renderGrantState(granted);
    if (!granted && els.copy) {
      els.copy.textContent =
        'not granted. schedule planner stays unannotated and everything else works exactly as before — you can come back to this page from the extension’s options.';
    }
  } catch {
    if (els.copy) {
      els.copy.textContent =
        'chrome would not show the prompt. you can still grant access under the extension’s site access settings.';
    }
  }
});

// Version first: it needs no extension APIs, so a failure in anything that does
// must not block it.
stampVersion();

// Reflect changes made elsewhere, e.g. from chrome://extensions. Guarded so the
// page still renders when opened outside an extension context.
try {
  chrome.permissions.onAdded.addListener(() => void refresh());
  chrome.permissions.onRemoved.addListener(() => void refresh());
} catch {
  // No permissions API here; the block keeps its default state.
}

void refresh();
