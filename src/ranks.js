/**
 * Rank bands. Every colour, count and sentence in the app reads from here,
 * so "invisible" cannot mean 10+ in one place and 11+ in another.
 *
 *   1-3   visible   (green)  - in Google's Map Pack
 *   4-10  weak      (amber)  - findable, but below the fold
 *   11+   invisible (red)    - includes "not in the top 20 at all"
 */
export const TOP3_MAX = 3;
export const WEAK_MAX = 10;
export const UNRANKED = 21;

export const inTop3 = (r) => r != null && r <= TOP3_MAX;
export const isInvisible = (r) => r == null || r > WEAK_MAX;
export const isVisible = (r) => !isInvisible(r);

/** 'visible' | 'weak' | 'invisible' */
export function band(r) {
  if (inTop3(r)) return 'visible';
  if (isInvisible(r)) return 'invisible';
  return 'weak';
}

export const BAND_LABELS = {
  visible: `1–${TOP3_MAX} Visible`,
  weak: `${TOP3_MAX + 1}–${WEAK_MAX} Weak`,
  invisible: `${WEAK_MAX + 1}+ Invisible`,
};
