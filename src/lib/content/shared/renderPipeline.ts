/**
 * Shared two-phase render pipeline for the MyUCSC page modules.
 *
 * Every page module followed the same flow: render loading skeletons for the
 * matched panels (Phase 1), then resolve each professor and swap in real
 * ratings (Phase 2). Only the panel selector, name/course extraction, mount
 * target, and a Phase-1 CSS class differ — those are passed in as config.
 */

import {
  getUIDFromJson,
  fetchProfessorData,
  fetchLocalResearchData,
  fetchLocalClassesData,
} from '@/lib/content/shared/professorResolver';
import {
  createMountPoint,
  renderComponent,
  unmountComponent,
} from '@/lib/content/shared/mountHelper';
import { getPageTerm } from '@/lib/content/shared/classFields';
import { getFirst } from '@/lib/format';
import RatingBar from '@/components/RatingBar';
import type {
  PageConfig,
  ProfessorData,
  ProfessorBundle,
  FetchProfessorDataResponse,
  CampusProfile,
  RmpTeacherNode,
  RmpReview,
} from '@/types';

export interface RenderPipelineConfig {
  config: PageConfig;
  extractProfName(panel: Element): string | null;
  getMountTarget(panel: Element): Element;
  /** Optional course-code extraction; pages without a course pass nothing. */
  extractCourseCode?: (panel: Element) => string | null;
  /**
   * Optional class-number extraction. When a page provides one, the instructor
   * resolves by exact registrar key instead of by abbreviated name.
   */
  extractClassNumber?: (panel: Element) => string | null;
  /** Optional class added to the panel in Phase 1 (e.g. positioning hooks). */
  panelClass?: string;
}

interface MountRecord {
  mount: HTMLSpanElement;
  name: string;
  course: string | null;
  classNumber: string | null;
}

/**
 * Reformats a scraped "J. Doe" instructor string into the "Doe,J." form used
 * for UID lookup. Returns null if it cannot be parsed.
 */
export function reformatInitialLast(name: string): string | null {
  const res = name.match(/^([^\s]+)/i);
  if (!res || !res[1]) return null;
  const firstInitial = res[1];
  const lastName = name.slice(firstInitial.length + 1).trim();
  if (!lastName) return null;
  return `${lastName},${firstInitial}`;
}

export async function runRenderPipeline(
  opts: RenderPipelineConfig
): Promise<void> {
  const {
    config,
    extractProfName,
    getMountTarget,
    extractCourseCode,
    extractClassNumber,
  } = opts;
  const panels = document.querySelectorAll(config.panelSelector);
  if (!panels.length) return;

  // Read once: the term labels the whole page, not any individual row.
  const term = getPageTerm();

  // Phase 1: render loading skeletons. Dedupe in case a node matches more than
  // one selector in a comma-separated list.
  const seen = new Set<Element>();
  const mounts: MountRecord[] = [];
  for (const panel of panels) {
    if (seen.has(panel)) continue;
    seen.add(panel);

    if (panel.classList.contains(config.processedClass)) continue;
    if (panel.querySelector('.rms-rating-bar-root')) continue;

    const name = extractProfName(panel);
    if (!name) continue;

    const course = extractCourseCode ? extractCourseCode(panel) : null;
    const classNumber = extractClassNumber ? extractClassNumber(panel) : null;
    const target = getMountTarget(panel);
    if (opts.panelClass) panel.classList.add(opts.panelClass);
    // Mark processed regardless of fetch outcome so a not-found professor is
    // never reprocessed on the next partial postback.
    panel.classList.add(config.processedClass);
    const mount = createMountPoint(target, 'rms-rating-bar-root');
    renderComponent(mount, RatingBar, { professorData: null, loading: true });
    mounts.push({ mount, name, course, classNumber });
  }

  if (!mounts.length) return;

  // Phase 2: fetch data and update.
  const [researchTopics, classesTaught] = await Promise.all([
    fetchLocalResearchData(),
    fetchLocalClassesData(),
  ]);

  await Promise.allSettled(
    mounts.map(async ({ mount, name, course, classNumber }) => {
      // The class number resolves an exact professor; the course code is the
      // fallback tie-breaker for instructors sharing a last name and initial.
      const uID = await getUIDFromJson(name, { course, classNumber, term });

      let profileDict: FetchProfessorDataResponse | null = null;
      try {
        profileDict = await fetchProfessorData(uID, name);
      } catch {
        // silently continue — error is non-critical
      }

      // Drop the { error } variant; only a successful bundle carries data.
      const bundle: ProfessorBundle | null =
        profileDict && !('error' in profileDict) ? profileDict : null;

      let profData: CampusProfile | null = null;
      let rateMyProfessorData: RmpTeacherNode | null = null;
      let reviews: RmpReview[] = [];
      let researchTopicText: string | null = null;
      let classesTaughtList: string[] | null = null;

      if (bundle) {
        profData = bundle.campusProfile;
        rateMyProfessorData = bundle.rateMyProfessor;
        reviews = bundle.reviews || [];
        const fullName = getFirst(profData?.cn);
        if (fullName) {
          researchTopicText = researchTopics[fullName];
          classesTaughtList = classesTaught[fullName];
        }
      }

      // Only remove if ALL data sources returned nothing.
      if (
        !profData &&
        !rateMyProfessorData &&
        !researchTopicText &&
        !classesTaughtList
      ) {
        unmountComponent(mount);
        mount.remove();
        return;
      }

      const professorData: ProfessorData = {
        campusProfile: profData,
        rateMyProfessor: rateMyProfessorData,
        reviews,
        localResearchTopic: researchTopicText,
        localClassesTaught: classesTaughtList,
        instructorName: name,
        course,
      };
      renderComponent(mount, RatingBar, { professorData, loading: false });
    })
  );
}
