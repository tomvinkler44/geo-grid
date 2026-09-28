/**
 * The A/B offer test and version B's Day 90 map target.
 *
 * Version B promises "top 10 in at least N more neighborhoods". N comes from
 * the prospect's own Day 1 map: about a third of the neighborhoods where they
 * don't show up today, kept between 2 and 5 so it is always meaningful and
 * never out of reach. Each of the 25 grid points is called a neighborhood.
 */
import { createHash } from 'node:crypto';
import { band } from './ranks.js';

export const VARIANTS = ['a', 'b'];
export const TEST_MODES = ['ab', 'a', 'b'];

/** Smallest and largest target, and how many pins must have room to move. */
export const GOAL_MIN = 2;
export const GOAL_MAX = 5;
export const GOAL_ROOM = 6;

const third = (n) => Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(n / 3)));

/**
 * The Day 90 target from the lead's Day 1 ranks.
 *
 * Moving a red pin into the top 10 is the easier, steadier step, so that is
 * the default. A map with fewer than 6 red pins has little room there, so the
 * target moves to the top 3 instead. A map that is nearly all green gets no
 * number; the wording then promises improvement over Day 1.
 *
 * @returns {{metric:'top10'|'top3'|null, count:number|null, today:number|null, points:number}}
 */
export function mapGoal(ranks = []) {
  const points = ranks.length;
  const red = ranks.filter((r) => band(r) === 'invisible').length;
  const amber = ranks.filter((r) => band(r) === 'weak').length;
  const green = points - red - amber;
  if (red >= GOAL_ROOM) return { metric: 'top10', count: third(red), today: points - red, points };
  if (amber >= GOAL_ROOM) return { metric: 'top3', count: third(amber), today: green, points };
  return { metric: null, count: null, today: null, points };
}

/** "in Google's top 10 in at least 4 more neighborhoods" */
export function goalPhrase(goal) {
  if (!goal || !goal.metric || !goal.count) return 'in more neighborhoods than your Day 1 map';
  return `in Google’s ${goal.metric === 'top10' ? 'top 10' : 'top 3'} in at least ${goal.count} more neighborhoods`;
}

/**
 * Which version an audit shows. In "ab" mode the split is by a hash of the
 * audit's id, which is effectively random but stable: regenerating the same
 * page never flips it.
 */
export function pickVariant(slug, mode = 'ab', override = null) {
  if (VARIANTS.includes(override)) return override;
  if (VARIANTS.includes(mode)) return mode;
  return createHash('sha1').update(String(slug || '')).digest()[0] % 2 ? 'b' : 'a';
}
