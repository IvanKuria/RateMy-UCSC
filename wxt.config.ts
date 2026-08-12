import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Rate My Slugs',
    version: '2.0.0',
    description:
      'View professor ratings, grade distributions, and detailed profiles while browsing UCSC courses on MyUCSC and Schedule Planner.',
    permissions: ['storage', 'sidePanel'],
    action: {},
    host_permissions: [
      'https://my.ucsc.edu/*',
      'https://pisa.ucsc.edu/*',
      'https://ucsc.collegescheduler.com/*',
      'https://www.ratemyprofessors.com/*',
      'https://rate-my-slugs-server.onrender.com/*',
      'https://campusdirectory.ucsc.edu/*',
    ],
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
