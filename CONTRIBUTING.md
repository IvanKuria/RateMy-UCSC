# Contributing to Rate My Slugs

Thanks for your interest in improving Rate My Slugs. This guide covers everything you need to get set up, understand the codebase, and ship a change.

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) 20 or newer (CI runs on Node 20)
- Google Chrome (or any Chromium browser)
- A UCSC MyUCSC account, for testing against real enrollment pages

### Build and Run

Clone the repo and install dependencies:

```bash
git clone https://github.com/IvanKuria/rate-my-slugs.git
cd rate-my-slugs
npm install
```

Start the dev server with hot reload:

```bash
npm run dev
```

This builds the extension and watches for changes. After the initial build:

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `.output/chrome-mv3-dev` folder.
4. The extension reloads automatically when you edit a file.

To produce a production build:

```bash
npm run build      # output in .output/chrome-mv3/
npm run zip        # packaged zip for distribution
```

A Firefox target is also available with `npm run dev:firefox` and `npm run build:firefox`.

The project is TypeScript. The Vite/WXT build does not type-check, so run the
type checker and formatter separately:

```bash
npm run typecheck   # wxt prepare && tsc --noEmit (strict)
npm run format      # Prettier over the tree
```

`typecheck` also runs in CI on every push and pull request.

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts          # Service worker: API routing and caching
│   ├── content.ts             # Content script: MyUCSC (PeopleSoft)
│   ├── scheduler.content.ts   # Content script: MyScheduler (React SPA)
│   ├── sidepanel/             # Side panel UI (React, main.tsx)
│   └── options/               # Settings page (React, main.tsx)
├── components/
│   ├── RatingBar.tsx          # Inline rating bar injected into host pages
│   ├── SlugRating.tsx         # Slug icon rating visualization
│   ├── GradeDistribution.tsx  # Grade distribution chart
│   ├── professor/             # Side panel professor components
│   ├── settings/              # Settings page components
│   └── ui/                    # Shared UI primitives (shadcn/ui)
├── lib/
│   ├── background/            # Background modules (rmpCache, campusDirectoryCache, cacheConfig)
│   ├── content/               # MyUCSC content logic (pages, shared helpers)
│   ├── scheduler/             # MyScheduler logic (api, pages, shared helpers)
│   ├── hooks/                 # React hooks (settings, theme)
│   ├── storage/               # Chrome storage wrappers
│   └── *.ts                   # Shared helpers (colors, format, constants, logger, nameParsing, ...)
├── types/                     # Shared TypeScript types (one source of truth per shape)
└── assets/                    # CSS files
```

### Key Files

| File | Responsibility |
|------|----------------|
| `src/types/` | Shared types for every cross-boundary shape (RMP, campus, grades, settings, the message protocol, page contracts). |
| `src/entrypoints/background.ts` | Service worker entry. Routes messages and orchestrates API calls. |
| `src/entrypoints/content.ts` | MyUCSC content script entry. Loads the right page module and mounts the UI. |
| `src/entrypoints/scheduler.content.ts` | MyScheduler content script entry. Handles SPA routing and React re-renders. |
| `src/lib/background/rmpCache.ts` | Rate My Professors GraphQL search, name matching, and caching. |
| `src/lib/background/campusDirectoryCache.ts` | UCSC Campus Directory API and caching. |
| `src/lib/background/uidSearchCache.ts` | Campus-directory name search, the last-resort CruzID lookup. |
| `src/lib/content/shared/pageDetector.ts` | Detects which MyUCSC page the user is on. |
| `src/lib/content/shared/professorResolver.ts` | Resolves scraped names to professor data. |
| `src/lib/content/shared/renderPipeline.ts` | Shared two-phase render flow used by every page module. |
| `src/lib/content/shared/mountHelper.tsx` | Mounts React UI into host pages. |
| `src/lib/content/pages/` | Per-page config + extraction, one thin module per page type. |
| `src/lib/scheduler/api.ts` | Reads MyScheduler's JSON API for exact instructor CruzIDs. |
| `src/lib/scheduler/shared/dom.ts` | Selector policy for the SPA: aria anchors only, never Emotion classes. |
| `scripts/harvest-instructors.js` | Per-term instructor harvester (run in the browser console). |
| `scripts/merge-instructors.mjs` | Merges a harvest into `public/data/` additively. |
| `wxt.config.ts` | Extension manifest, permissions, and build configuration. |

## Architecture

### High-Level Overview

```
Content Script           Background SW               Side Panel
--------------           ------------                ----------
Detect page type    -->  Fetch RMP (GraphQL)    -->  Professor profile
Extract names       -->  Fetch Campus Directory -->  Grade distribution
Render rating bar   -->  Cache in storage       -->  Reviews carousel
                         Match best professor        Settings
```

### Data Flow

1. The **content script** detects which UCSC page you are on (search results, shopping cart, enrolled classes, class detail, and so on).
2. It extracts professor names from the DOM and renders loading skeletons.
3. Names are sent to the **background service worker**, which fetches data from:
   - Rate My Professors GraphQL API (ratings and reviews)
   - UCSC Campus Directory API (contact info and department)
   - The grade distribution server (historical grade data)
4. Results are cached in `chrome.storage.local`, one week by default. The window is user-configurable via the `cacheDurationDays` setting (see `src/lib/background/cacheConfig.ts`).
5. The inline **rating bar** updates with the resolved professor rating.
6. Clicking "Details" opens the **side panel** with the full professor profile.

### Page Modules

Each supported MyUCSC page has its own module under `src/lib/content/pages/`. A page module exports a small, consistent contract (the `PageModule` type in `src/types`) so the content script can load it generically:

- `PAGE_CONFIG` describing the page (selector + processed-marker class)
- `extractProfName()` to read professor names from the DOM
- `getMountTarget()` to find where the rating bar attaches
- `renderPage()` to mount the UI

The two-phase render flow (skeleton mount, then fetch and update) is shared in `renderPipeline.ts`, so each page module is small: it just declares its selector and extraction functions and delegates to `runRenderPipeline()`.

## Coding Guidelines

### Style

- TypeScript throughout, under `strict`. Keep `npm run typecheck` clean.
- Reuse the shared types in `src/types` rather than redefining shapes; add a new type there when something crosses a module or process boundary.
- Functional React components with hooks; type each component's props.
- ES modules (`import` and `export`).
- Prefer small, focused functions over large multipurpose ones.
- Code is formatted with Prettier (`npm run format`).

### Content Script CSS

The content script runs inside UCSC pages, so styles must not leak into or collide with the host page.

| Avoid | Prefer |
|-------|--------|
| Global or unprefixed class names | Class names prefixed with `rms-` |
| Tailwind inside the injected rating bar | Plain CSS in `src/assets/rating-bar.css` |
| Relying on host page styles | Self-contained, scoped styles |

The side panel and options page run in their own extension context, so they use Tailwind via `src/assets/tailwind.css` freely.

### Where Styles Live

- Inline rating bar: `src/assets/rating-bar.css` (plain CSS, injected into the host page)
- Side panel and options: Tailwind CSS via `src/assets/tailwind.css`
- Grade distribution: `src/assets/styles.css`

## Making Changes

### Adding Support for a New Page Type

1. Create a new module in `src/lib/content/pages/` exporting `PAGE_CONFIG`, `extractProfName()`, `getMountTarget()`, and a `renderPage()` that delegates to `runRenderPipeline()`.
2. Add the page type to the `PageType` union in `src/types`.
3. Register it in `src/lib/content/shared/pageDetector.ts` and the loader map in `src/entrypoints/content.ts`.

### Modifying the RMP Search

All Rate My Professors logic lives in `src/lib/background/rmpCache.ts`:

- `generateSearchVariants()` produces name variants from scraped names.
- `searchWithFallback()` runs the cascading search strategy.
- `selectBestRmpMatch()` does Fuse.js matching with school validation.

## Pull Request Guidelines

Before opening a pull request, confirm that:

1. The change is focused. Keep unrelated edits in separate PRs.
2. `npm run typecheck` and `npm run build` both pass.
3. You tested on at least one real UCSC enrollment page.
4. Content script CSS stays prefixed with `rms-`.
5. The PR description explains what changed and why.

To submit:

1. Fork the repo and create a feature branch from `main`.
2. Make and test your changes.
3. Open a pull request with a clear description.

## AI-Assisted Contributions

AI-assisted contributions are welcome. If you used an AI tool to help write a change, a few practices keep the result reviewable:

- Read and understand every line before you submit it. You are responsible for the code, not the tool.
- Test the behavior in the browser, not just the build. Generated code can compile and still be wrong.
- Keep the change scoped to the task. AI tools tend to refactor adjacent code; revert anything unrelated to your PR.
- Note in the PR description that AI assistance was used, so reviewers know what to look for.

## Reporting Bugs

Use the [bug report template](https://github.com/IvanKuria/rate-my-slugs/issues/new?template=bug_report.md). Include:

- What page you were on
- What you expected to happen
- What actually happened
- Screenshots, if relevant

## Questions

Open a [discussion or issue](https://github.com/IvanKuria/rate-my-slugs/issues), or reach out to [@IvanKuria](https://github.com/IvanKuria).
