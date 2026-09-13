/**
 * Turns an audit into plain-English, email-ready copy.
 */

const fmtMi = (mi) => (Number.isInteger(mi) ? `${mi}` : mi.toFixed(1).replace(/\.0$/, ''));
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, s, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

function bearingPhrase(label) {
  return label.replace('-', '').toLowerCase().replace(/^(north|south)(east|west)$/, '$1-$2');
}

/** Group the invisible (10+) points by direction and find the nearest one per direction. */
function leakDirections(points) {
  const groups = new Map();
  for (const p of points) {
    if (p.isCenter) continue;
    const bad = p.rank == null || p.rank >= 10;
    if (!bad) continue;
    const g = groups.get(p.bearing) || { bearing: p.bearing, count: 0, nearestMi: Infinity, nearestRank: null };
    g.count++;
    if (p.distanceMi < g.nearestMi) { g.nearestMi = p.distanceMi; g.nearestRank = p.rank; }
    groups.set(p.bearing, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.nearestMi - b.nearestMi);
}

/** Largest distance from centre at which every point is still top-3. */
function safeRadius(points) {
  const sorted = [...points].sort((a, b) => a.distanceMi - b.distanceMi);
  let radius = 0;
  for (const p of sorted) {
    if (p.rank != null && p.rank <= 3) radius = p.distanceMi;
    else break;
  }
  return radius;
}

export function generateTakeaway(report) {
  const { business, keyword, spacingMi, points, metrics } = report;
  const name = business.name;
  const n = points.length;
  const center = points.find((p) => p.isCenter);
  const green = points.filter((p) => p.rank != null && p.rank <= 3);
  const red = points.filter((p) => p.rank == null || p.rank >= 10);
  const radius = safeRadius(points);
  const leaks = leakDirections(points);

  // ---- The Good ----------------------------------------------------------
  let good;
  if (green.length === n) {
    good = `${name} is in the Google Map Pack (top 3) at every one of the ${n} points we tested for "${keyword}". That is rare – you own this search across the whole ${fmtMi(spacingMi * 4)}-mile area.`;
  } else if (green.length === 0) {
    good = center.rank != null && center.rank <= 9
      ? `${name} does appear for "${keyword}" right at your location (rank #${center.rank}), so Google knows the listing is relevant – it just isn't rewarding it yet.`
      : `Google does recognise ${name} as a business, but it is not currently associating the listing with "${keyword}" strongly enough to show it in the Map Pack – even at your own address.`;
  } else {
    const nearby = radius > 0
      ? `Within about ${fmtMi(radius)} ${radius === 1 ? 'mile' : 'miles'} of your location you are solidly in the Map Pack`
      : `At your own address you rank #${center.rank ?? '20+'}`;
    const greenDirs = [...new Set(green.filter((p) => !p.isCenter).map((p) => p.bearing))];
    const dirNote = greenDirs.length && greenDirs.length <= 3 ? `, especially to the ${greenDirs.map(bearingPhrase).join(' and ')}` : '';
    good = `${nearby}${dirNote}. ${plural(green.length, 'of the ' + n + ' points is', 'of the ' + n + ' points are')} green (top 3), which means searchers there see ${name} first, with your phone number and reviews, before they scroll.`;
  }

  // ---- The Revenue Leak --------------------------------------------------
  let leak;
  if (red.length === 0 && metrics.visibleCount === n) {
    leak = green.length === n
      ? `No leak to report. The only risk is complacency: competitors run these same scans, and a new listing with aggressive review velocity can take the outer ring within a few months.`
      : `You are visible (top 9) everywhere in the grid, but ${plural(n - green.length, 'point drops', 'points drop')} to positions 4–9. Those searchers only find you after tapping "More places" – most never do. Closing that gap is the difference between a good month and a great one.`;
  } else {
    const top = leaks.slice(0, 3);
    const dirText = top.map((g) => {
      const rankTxt = g.nearestRank == null ? 'not in the top 20' : `rank #${g.nearestRank}`;
      return `${fmtMi(g.nearestMi)} ${g.nearestMi === 1 ? 'mile' : 'miles'} ${bearingPhrase(g.bearing)} (${rankTxt})`;
    });
    const lead = red.length >= n * 0.6
      ? `At ${red.length} of the ${n} points – ${pct(red.length / n)} of the area – ${name} is effectively invisible for "${keyword}".`
      : `Your visibility falls off fast with distance. At ${plural(red.length, 'point')} out of ${n} (${pct(red.length / n)} of the area) you are effectively invisible for "${keyword}".`;
    leak = `${lead} A homeowner searching just ${dirText[0]} will not see you at all, and it is the same story ${dirText.slice(1).length ? dirText.slice(1).join(' and ') : 'in the outer ring'}. Every one of those searches is a call going to someone else, and those neighbourhoods are well inside your normal service area.`;
  }

  // ---- The Competitive Context ------------------------------------------
  let context;
  const tc = metrics.topCompetitor;
  if (!tc) {
    context = `No single competitor is consistently ahead of you – the map is yours to lose.`;
  } else {
    const second = metrics.competitors[1];
    const share = pct(tc.wins / Math.max(1, metrics.notTop3Count));
    context = `Where you are not in the top 3, the #1 spot belongs to ${tc.name} ${share} of the time (${plural(tc.wins, 'point')})`;
    context += second ? `, followed by ${second.name} (${plural(second.wins, 'point')}).` : '.';
    context += ` They are winning those calls not because they are closer to every searcher – proximity is only one factor – but because Google trusts their listing more: review volume and recency, category and service-area signals, photos, posts, and citations. Those are all things that can be fixed in 60–90 days.`;
  }

  // ---- Email --------------------------------------------------------------
  const avg = metrics.averageRank.toFixed(1);
  const subject = red.length
    ? `${name}: you're invisible for "${keyword}" ${fmtMi(leaks[0]?.nearestMi ?? spacingMi)} mi from your shop`
    : `${name}: your "${keyword}" map rankings (5×5 scan)`;
  const email = [
    `Subject: ${subject}`,
    ``,
    `Hi ${firstWord(name)} team,`,
    ``,
    `I ran a quick Google Maps ranking scan for "${keyword}" from 25 points around your location (a 5×5 grid, ${fmtMi(spacingMi)} mi apart). The attached image shows exactly where you rank when someone searches from each spot – green means you're in the top 3 "Map Pack", red means you're not showing at all.`,
    ``,
    `The good news: ${good}`,
    ``,
    `The problem: ${leak}`,
    ``,
    `Who's getting those calls: ${context}`,
    ``,
    `Quick summary: average rank ${avg} across the 25 points, in the top 3 at ${pct(metrics.top3Share)} of them, invisible at ${pct(red.length / n)}.`,
    ``,
    `If it's useful, I can walk you through the three or four specific things that would move the red and orange circles to green. It usually takes 15 minutes on a call. Would sometime this week or next work?`,
    ``,
    `Best,`,
    `[Your name]`,
  ].join('\n');

  return { good, leak, context, subject, email };
}

function firstWord(name) {
  const w = name.split(/\s+/)[0] || name;
  return w.replace(/[^A-Za-z0-9'&-]/g, '');
}
