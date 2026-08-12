/**
 * @file render.ts
 * Two-phase rating renderer for the MyScheduler surfaces.
 *
 * Same shape as the MyUCSC pipeline — skeletons first so the layout settles
 * before any network work, then real ratings swapped in — but driven by an
 * explicit list of mount requests rather than a panel selector, because the
 * four surfaces here disagree about where the rating goes (inside a cell, in an
 * appended row, inside a calendar block) and about how they identify the
 * professor in the first place.
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
  isPlaceholderName,
} from '@/lib/content/shared/mountHelper';
import { getFirst } from '@/lib/format';
import RatingBar, { type RatingBarVariant } from '@/components/RatingBar';
import { logger } from '@/lib/logger';
import type {
  ProfessorData,
  ProfessorBundle,
  FetchProfessorDataResponse,
  CampusProfile,
  RmpTeacherNode,
  RmpReview,
} from '@/types';

export interface RatingMountRequest {
  /** Element the rating is appended to. */
  target: Element;
  /** Instructor's display name, as shown by the app. */
  name: string;
  /**
   * CruzID when the page's API supplied one. This is the whole point of the
   * Schedule Planner integration: an exact id, so no name matching is needed.
   * Null falls back to the bundled maps.
   */
  uid: string | null;
  /** Course code ("CSE 101") — disambiguates fallback matching. */
  course: string | null;
  variant: RatingBarVariant;
  /** Called after a mount is torn down for having no data at all. */
  onEmpty?: () => void;
}

interface MountRecord extends RatingMountRequest {
  mount: HTMLSpanElement;
}

/**
 * Renders ratings for a batch of mount requests. Requests naming a placeholder
 * instructor ("Staff", "TBA") are dropped before any work happens.
 */
export async function renderRatings(
  requests: RatingMountRequest[]
): Promise<void> {
  const mounts: MountRecord[] = [];

  // Phase 1 — skeletons.
  for (const request of requests) {
    if (!request.name || isPlaceholderName(request.name)) continue;

    const mount = createMountPoint(request.target, 'rms-rating-bar-root');
    renderComponent(mount, RatingBar, {
      professorData: null,
      loading: true,
      variant: request.variant,
    });
    mounts.push({ ...request, mount });
  }

  if (!mounts.length) return;

  // Phase 2 — resolve and swap in.
  const [researchTopics, classesTaught] = await Promise.all([
    fetchLocalResearchData(),
    fetchLocalClassesData(),
  ]);

  await Promise.allSettled(
    mounts.map(async (record) => {
      const { mount, name, course, variant } = record;

      const uid = record.uid ?? (await getUIDFromJson(name, course));

      let response: FetchProfessorDataResponse | null = null;
      try {
        response = await fetchProfessorData(uid, name);
      } catch (error) {
        logger.error(`Professor fetch failed for "${name}":`, error);
      }

      const bundle: ProfessorBundle | null =
        response && !('error' in response) ? response : null;

      let campusProfile: CampusProfile | null = null;
      let rateMyProfessor: RmpTeacherNode | null = null;
      let reviews: RmpReview[] = [];
      let localResearchTopic: string | null = null;
      let localClassesTaught: string[] | null = null;

      if (bundle) {
        campusProfile = bundle.campusProfile;
        rateMyProfessor = bundle.rateMyProfessor;
        reviews = bundle.reviews || [];
        const fullName = getFirst(campusProfile?.cn);
        if (fullName) {
          localResearchTopic = researchTopics[fullName];
          localClassesTaught = classesTaught[fullName];
        }
      }

      // Nothing from any source — remove the mount rather than leave a gap
      // where a rating was promised.
      if (
        !campusProfile &&
        !rateMyProfessor &&
        !localResearchTopic &&
        !localClassesTaught
      ) {
        unmountComponent(mount);
        mount.remove();
        record.onEmpty?.();
        return;
      }

      const professorData: ProfessorData = {
        campusProfile,
        rateMyProfessor,
        reviews,
        localResearchTopic,
        localClassesTaught,
        instructorName: name,
        course,
      };

      renderComponent(mount, RatingBar, {
        professorData,
        loading: false,
        variant,
      });
    })
  );
}
