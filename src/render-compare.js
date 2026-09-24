/**
 * The three-panel comparison sheet: the lead business beside two rivals, on
 * one landscape image sized for an email.
 *
 * All three panels share one basemap render and one set of grid coordinates,
 * so the panels are directly comparable - the only thing that differs between
 * them is the colour and number on each pin.
 */
import { createCanvas } from '@napi-rs/canvas';
import { renderBasemap } from './basemap.js';
import { gridExtentMi } from './geometry.js';
import {
  FONT, COLORS, rankColor, miLabel, formatDate, fitText, roundRect, topRoundRect,
  drawScaleBar, drawNorthArrow, drawBadges, drawExtent, wrapText,
} from './draw.js';

const MI_TO_M = 1609.344;
const ROLE_BAR = [COLORS.leadBar, COLORS.rivalABar, COLORS.rivalBBar];
const ROLE_TAG = ['YOUR BUSINESS', 'COMPETITOR A', 'COMPETITOR B'];

const pct = (x) => `${Math.round(x * 100)}%`;

/** One-line verdict under each panel. */
function panelInsight(profile, lead) {
  const m = profile.metrics;
  if (profile.role === 'lead') {
    if (m.top3Share >= 0.8) return 'Dominates the whole search area.';
    if (m.top3Share >= 0.4) return 'Strong near the front door, fading at the edges.';
    if (m.top3Count === 0) return 'Not in the Map Pack anywhere on this grid.';
    return 'Visible close to home only; invisible across most of the area.';
  }
  const diff = lead.metrics.top3Count - m.top3Count;
  if (m.top3Share >= 0.65) return `Current market leader — ${m.top3Count - lead.metrics.top3Count} more green pins than you.`;
  if (diff < 0) return `Ahead of you by ${-diff} green pins.`;
  if (diff > 0) return `Behind you by ${diff} green pins.`;
  return 'Level with you across the grid.';
}

/**
 * @param {object} report   output of runAudit (must have `businesses`)
 * @param {object} takeaway output of generateTakeaway
 * @param {object} [opts]
 */
export async function renderComparison(report, takeaway, opts = {}) {
  const scale = opts.scale ?? 2;
  const W = 1600;
  const M = 40;
  const GAP = 24;

  const headerY = M;
  const headerH = 104;
  const panelsY = headerY + headerH + 26;
  const panelW = (W - 2 * M - 2 * GAP) / 3;
  const titleH = 46;
  const mapH = 440;
  const statsH = 78;
  const insightH = 48;
  const panelH = titleH + mapH + statsH + insightH;
  const tableY = panelsY + panelH + 28;
  const tableHeadH = 44;
  const rowH = 38;

  const { keyword, spacingMi, points, businesses } = report;
  const lead = businesses[0];
  const panels = businesses.slice(0, 3);
  const extentMi = gridExtentMi(spacingMi);

  const ROWS = [
    { label: 'Average grid rank', get: (b) => b.metrics.averageRank.toFixed(1), best: 'min', num: (b) => b.metrics.averageRank },
    { label: 'Map Pack coverage (top 3)', get: (b) => pct(b.metrics.top3Share), best: 'max', num: (b) => b.metrics.top3Share },
    { label: 'Points ranked #1', get: (b) => `${b.metrics.firstCount} of ${points.length}`, best: 'max', num: (b) => b.metrics.firstCount },
    { label: 'Points not visible (10+)', get: (b) => `${b.metrics.invisibleCount} of ${points.length}`, best: 'min', num: (b) => b.metrics.invisibleCount },
    { label: 'Google rating', get: (b) => (b.rating ? `${b.rating} ★` : '—') },
    { label: 'Total reviews', get: (b) => (b.reviews == null ? '—' : b.reviews.toLocaleString('en-US')) },
    { label: 'Primary category', get: (b) => b.category || '—' },
    { label: 'Website', get: (b) => (b.website ? b.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '—') },
  ];
  // The table starts 40px below its own heading, so that offset is part of
  // the block's height - leaving it out clipped the last row.
  const TABLE_TITLE_H = 40;
  const tableH = TABLE_TITLE_H + tableHeadH + ROWS.length * rowH;
  const takeawayY = tableY + tableH + 28;
  const takeawayH = 144;
  const H = takeawayY + takeawayH + M;

  // One basemap, reused by all three panels.
  const basemap = await renderBasemap({
    lat: lead.lat ?? report.business.lat,
    lng: lead.lng ?? report.business.lng,
    width: Math.round(panelW * scale),
    height: Math.round(mapH * scale),
    spanMeters: extentMi * MI_TO_M,
    spanFraction: 0.66,
    provider: opts.mapProvider,
  });

  const canvas = createCanvas(W * scale, H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, W, H);

  // ---- Header band --------------------------------------------------------
  ctx.fillStyle = COLORS.ink;
  roundRect(ctx, M, headerY, W - 2 * M, headerH, 14);
  ctx.fill();

  ctx.fillStyle = COLORS.white;
  ctx.font = `bold 27px ${FONT}`;
  ctx.fillText(fitText(ctx, `Local visibility: ${lead.name}`, W - 2 * M - 400), M + 26, headerY + 44);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `400 16px ${FONT}`;
  const where = report.business.address || report.location;
  ctx.fillText(
    fitText(ctx, `Searched for “${keyword}”  ·  ${where}`, W - 2 * M - 400),
    M + 26, headerY + 74,
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.white;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(formatDate(report.generatedAt ? new Date(report.generatedAt) : new Date()), W - M - 26, headerY + 42);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText(`5 × 5 grid · ${spacingMi} mi spacing · ${miLabel(extentMi)} × ${miLabel(extentMi)} scanned`, W - M - 26, headerY + 66);
  if (opts.agencyName) ctx.fillText(`Prepared by ${opts.agencyName}`, W - M - 26, headerY + 86);
  ctx.textAlign = 'left';

  // ---- Panels -------------------------------------------------------------
  panels.forEach((profile, i) => {
    const px = M + i * (panelW + GAP);
    const mapY = panelsY + titleH;

    // Title bar
    ctx.fillStyle = ROLE_BAR[i];
    topRoundRect(ctx, px, panelsY, panelW, titleH, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = `700 10px ${FONT}`;
    ctx.fillText(ROLE_TAG[i], px + 16, panelsY + 18);
    ctx.fillStyle = COLORS.white;
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(fitText(ctx, profile.name, panelW - 32), px + 16, panelsY + 37);

    // Map
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, mapY, panelW, mapH);
    ctx.clip();
    ctx.drawImage(basemap.canvas, px, mapY, panelW, mapH);
    ctx.restore();

    const toPage = (p) => {
      const d = basemap.project(p.lat, p.lng);
      return { x: px + d.x / scale, y: mapY + d.y / scale };
    };
    const xs = points.map((p) => toPage(p).x);
    const ys = points.map((p) => toPage(p).y);
    const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    drawExtent(ctx, box);
    drawBadges(ctx, points, points.map((p) => p.ranks[i]), toPage, 18, { markCenter: i === 0 });

    if (i === 0) {
      const pxPerMile = Math.abs(toPage(points[13]).x - toPage(points[12]).x) / spacingMi;
      drawScaleBar(ctx, px + 10, mapY + 10, pxPerMile, { compact: true });
      drawNorthArrow(ctx, px + panelW - 24, mapY + 24, 13);
    }
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, mapY + 0.5, panelW - 1, mapH - 1);

    // Stats strip
    const statsY = mapY + mapH;
    ctx.fillStyle = COLORS.card;
    ctx.fillRect(px, statsY, panelW, statsH);
    const m = profile.metrics;
    const stats = [
      { label: 'AVG RANK', value: m.averageRank.toFixed(1), color: rankColor(m.averageRank) },
      { label: 'TOP-3 PINS', value: `${m.top3Count}/${points.length}`, color: rankColor(m.top3Share >= 0.6 ? 1 : m.top3Share >= 0.3 ? 5 : 12) },
      { label: 'COVERAGE', value: pct(m.top3Share), color: COLORS.ink },
    ];
    const sw = panelW / 3;
    stats.forEach((s, k) => {
      const sx = px + k * sw;
      if (k > 0) {
        ctx.strokeStyle = COLORS.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, statsY + 14);
        ctx.lineTo(sx, statsY + statsH - 14);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 10px ${FONT}`;
      ctx.fillText(s.label, sx + sw / 2, statsY + 26);
      ctx.fillStyle = s.color;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText(s.value, sx + sw / 2, statsY + 58);
      ctx.textAlign = 'left';
    });

    // Insight line
    const insY = statsY + statsH;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(px, insY, panelW, insightH);
    ctx.fillStyle = COLORS.slate;
    ctx.font = `400 13px ${FONT}`;
    const lines = wrapText(ctx, panelInsight(profile, lead), panelW - 32, 2);
    lines.forEach((ln, k) => ctx.fillText(ln, px + 16, insY + 20 + k * 17));

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    roundRect(ctx, px + 0.5, panelsY + 0.5, panelW - 1, panelH - 1, 12);
    ctx.stroke();
  });

  // ---- Comparison table ---------------------------------------------------
  const labelW = 300;
  const colW = (W - 2 * M - labelW) / 3;
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('SIDE-BY-SIDE COMPARISON', M, tableY + 26);

  const headY = tableY + TABLE_TITLE_H;
  // Lead column gets a tint down the whole table so the eye can follow it.
  ctx.fillStyle = 'rgba(34,197,94,0.07)';
  ctx.fillRect(M + labelW, headY, colW, tableHeadH + ROWS.length * rowH);

  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('METRIC', M + 4, headY + 28);
  panels.forEach((b, i) => {
    const cx = M + labelW + i * colW;
    ctx.fillStyle = ROLE_BAR[i];
    ctx.fillRect(cx + 12, headY + 12, 4, 20);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(fitText(ctx, b.name, colW - 34), cx + 24, headY + 28);
  });
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(M, headY + tableHeadH);
  ctx.lineTo(W - M, headY + tableHeadH);
  ctx.stroke();

  ROWS.forEach((row, ri) => {
    const ry = headY + tableHeadH + ri * rowH;
    if (ri % 2 === 1) {
      ctx.fillStyle = 'rgba(15,23,42,0.025)';
      ctx.fillRect(M, ry, W - 2 * M, rowH);
    }
    ctx.fillStyle = COLORS.slate;
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText(fitText(ctx, row.label, labelW - 16), M + 4, ry + 25);

    // Which column wins this row, for the four comparable numbers.
    let bestIdx = -1;
    if (row.best && row.num) {
      const vals = panels.map(row.num);
      const target = row.best === 'min' ? Math.min(...vals) : Math.max(...vals);
      if (vals.filter((v) => v === target).length === 1) bestIdx = vals.indexOf(target);
    }
    panels.forEach((b, i) => {
      const cx = M + labelW + i * colW;
      const winner = i === bestIdx;
      ctx.fillStyle = winner ? COLORS.ink : COLORS.slate;
      ctx.font = `${winner ? 700 : 400} 13px ${FONT}`;
      ctx.fillText(fitText(ctx, row.get(b), colW - 36), cx + 24, ry + 25);
    });
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, ry + rowH);
    ctx.lineTo(W - M, ry + rowH);
    ctx.stroke();
  });

  // ---- Takeaway band ------------------------------------------------------
  ctx.fillStyle = COLORS.card;
  roundRect(ctx, M, takeawayY, W - 2 * M, takeawayH, 14);
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  const cols = [
    { title: 'THE GOOD', color: COLORS.green, text: takeaway.compare?.good ?? takeaway.good },
    { title: 'THE REVENUE LEAK', color: COLORS.red, text: takeaway.compare?.leak ?? takeaway.leak },
    { title: 'WHO IS WINNING INSTEAD', color: COLORS.amber, text: takeaway.compare?.context ?? takeaway.context },
  ];
  const tcolW = (W - 2 * M - 48) / 3;
  cols.forEach((c, i) => {
    const cx = M + 24 + i * tcolW;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(cx + 5, takeawayY + 28, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(c.title, cx + 18, takeawayY + 33);
    ctx.fillStyle = COLORS.slate;
    ctx.font = `400 13px ${FONT}`;
    wrapText(ctx, c.text, tcolW - 34, 4).forEach((ln, k) => {
      ctx.fillText(ln, cx, takeawayY + 58 + k * 18);
    });
  });

  // ---- Footer -------------------------------------------------------------
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 11px ${FONT}`;
  const legend = 'Green = ranks 1–3 (visible)   ·   Amber = ranks 4–10 (weak)   ·   Red = rank 11+ or not shown (invisible)';
  ctx.fillText(legend, M, H - 14);
  ctx.textAlign = 'right';
  ctx.fillText(`${basemap.attribution}${opts.agencyUrl ? `   ·   ${opts.agencyUrl}` : ''}`, W - M, H - 14);
  ctx.textAlign = 'left';

  return {
    png: canvas.toBuffer('image/png'),
    width: W * scale,
    height: H * scale,
    basemap: {
      provider: basemap.provider,
      requestedProvider: basemap.requestedProvider,
      fellBack: !!basemap.fellBack,
      offline: !!basemap.offline,
      error: basemap.error,
    },
  };
}
