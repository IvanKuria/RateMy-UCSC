/**
 * @file RatingBar.tsx
 * Compact inline rating bar: star rating badge + details button.
 * Designed for injection into UCSC enrollment pages.
 */

import React from 'react';

import type { ProfessorData, ShowProfessorMessage } from '@/types';

/**
 * Size variants. These change how much of the bar is shown and how tightly it
 * is packed — never its look. Same badge, same star, same radius, same colors.
 *
 *   full     the original bar: rating + would-retake + Details.
 *   compact  rating + Details, sized to sit inside a table cell beside a name.
 *   chip     rating only, for a calendar block with no room for anything else.
 */
export type RatingBarVariant = 'full' | 'compact' | 'chip';

interface Props {
  /** Full professor data bundle. */
  professorData: ProfessorData | null;
  /** Whether data is still loading. */
  loading: boolean;
  /** Defaults to the original full-size bar. */
  variant?: RatingBarVariant;
}

/**
 * Opens the side panel with full professor details.
 */
function handleBarClick(professorData: ProfessorData | null): void {
  if (!professorData) return;
  const message: ShowProfessorMessage = {
    action: 'showProfessor',
    data: { ...professorData },
  };
  chrome.runtime.sendMessage(message);
}

/**
 * RatingBar component.
 */
export default function RatingBar({
  professorData,
  loading,
  variant = 'full',
}: Props) {
  const variantClass = variant === 'full' ? '' : ` rms-rating-bar--${variant}`;

  if (loading) {
    return (
      <div
        className={`rms-rating-bar-skeleton${variantClass}`}
        aria-label="Loading professor rating..."
      />
    );
  }

  if (!professorData) {
    return null;
  }

  const { rateMyProfessor, instructorName } = professorData;

  const numRatings = rateMyProfessor?.numRatings ?? 0;
  const hasRatings = numRatings > 0;
  const overallRating = hasRatings
    ? (rateMyProfessor?.avgRatingRounded ?? null)
    : null;
  const wouldTakeAgain = hasRatings
    ? (rateMyProfessor?.wouldTakeAgainPercentRounded ?? null)
    : null;
  const ratingDisplay =
    overallRating != null ? Number(overallRating).toFixed(1) : null;
  const againDisplay =
    wouldTakeAgain != null && wouldTakeAgain >= 0
      ? `${Math.round(wouldTakeAgain)}%`
      : null;

  // A chip has room for the score and nothing else; both narrow variants drop
  // the would-retake stat, which is the least scannable part at a glance.
  const showWouldRetake = variant === 'full' && againDisplay != null;
  const showDetails = variant !== 'chip';

  // With nothing to show, render nothing rather than an empty box in a cell.
  if (ratingDisplay == null && !showWouldRetake && !showDetails) return null;

  return (
    <div
      className={`rms-rating-bar${variantClass}`}
      aria-label={`Professor rating for ${instructorName || 'unknown'}: ${ratingDisplay ?? 'N/A'}`}
    >
      {ratingDisplay != null && (
        <span className="rms-rating">
          <span className="rms-star">★</span>
          <span className="rms-score">{ratingDisplay}</span>
          {numRatings != null && (
            <span className="rms-count">({numRatings})</span>
          )}
        </span>
      )}

      {showWouldRetake && (
        <span className="rms-again">
          <span className="rms-again-value">{againDisplay}</span>
          <span className="rms-again-label">would retake</span>
        </span>
      )}

      {showDetails && (
        <button
          className="rms-details"
          onClick={() => handleBarClick(professorData)}
          type="button"
          aria-label={`View details for ${instructorName || 'professor'}`}
        >
          <span className="rms-details-text">Details</span>
          <span className="rms-details-arrow">→</span>
        </button>
      )}
    </div>
  );
}
