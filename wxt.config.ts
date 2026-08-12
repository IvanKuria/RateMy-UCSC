import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

/** The origin MyScheduler runs on, requested at runtime rather than up front. */
const SCHEDULER_ORIGIN = 'https://ucsc.collegescheduler.com/*';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      /**
       * Extension pages load their modules from disk, so preloading them buys
       * nothing — and Vite's `modulepreload` support costs something. It emits
       * `<link rel="modulepreload" crossorigin>` tags plus a polyfill chunk for
       * browsers without native support, and in an extension page Chrome logs:
       *
       *   A preload for '.../chunks/_virtual_wxt-html-plugins-*.js' is found,
       *   but is not used because it is a cross-world extension resource
       *   mismatch.
       *
       * The `crossorigin` attribute puts the preload in a different fetch mode
       * than the actual module load, so the preloaded copy is discarded and
       * fetched again. Harmless, but it is console noise on every page, and
       * Chrome has supported modulepreload natively for years.
       */
      modulePreload: false,
    },
  }),
  hooks: {
    /**
     * Keep the MyScheduler origin out of `host_permissions`.
     *
     * WXT adds a host permission for every `registration: 'runtime'` content
     * script, on the reasonable assumption that you want it granted so the
     * script can register immediately. Here that is exactly wrong: a required
     * host permission is a privilege increase, and Chrome disables the whole
     * extension on update until the user approves it — which is the outcome
     * the optional permission exists to avoid. The permission is requested at
     * runtime instead, so it must appear only under
     * `optional_host_permissions`.
     */
    'build:manifestGenerated': (_wxt, manifest) => {
      const required = manifest.host_permissions;
      if (!required) return;
      manifest.host_permissions = required.filter(
        (pattern: string) => pattern !== SCHEDULER_ORIGIN
      );
    },
  },
  manifest: {
    name: 'Rate My Slugs',
    version: '2.2.0',
    description:
      'View professor ratings, grade distributions, and detailed profiles while browsing UCSC courses on MyUCSC and MyScheduler.',
    // `scripting` is required to register the MyScheduler content script
    // once its permission is granted at runtime.
    permissions: ['storage', 'sidePanel', 'scripting'],
    action: {},
    host_permissions: [
      'https://my.ucsc.edu/*',
      'https://pisa.ucsc.edu/*',
      'https://www.ratemyprofessors.com/*',
      'https://rate-my-slugs-server.onrender.com/*',
      'https://campusdirectory.ucsc.edu/*',
    ],
    // MyScheduler is optional, deliberately.
    //
    // Listing it as a required host permission makes the update a privilege
    // increase, and Chrome responds by DISABLING the extension for every
    // existing user until they approve it. They would not merely lose the new
    // feature — they would lose MyUCSC ratings too, silently, until they
    // noticed a prompt. Asking for it at runtime keeps the update invisible and
    // moves the request to the moment it is worth something.
    optional_host_permissions: ['https://ucsc.collegescheduler.com/*'],
    web_accessible_resources: [
      {
        // The rating bar loads the slug icon and the bundled instructor data
        // through chrome.runtime.getURL, so every injected origin needs to be
        // listed here or those fetches are blocked.
        resources: [
          'icons/sammy/*.png',
          'icons/sammy/*.jpg',
          'data/*.json',
          'images/*',
        ],
        matches: [
          'https://my.ucsc.edu/*',
          'https://pisa.ucsc.edu/*',
          'https://ucsc.collegescheduler.com/*',
        ],
      },
    ],
    icons: {
      '16': 'icons/sammy/sammy-16.jpg',
      '48': 'icons/sammy/sammy-48.png',
      '128': 'icons/sammy/sammy-128.jpg',
    },
  },
});
