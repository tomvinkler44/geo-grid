/**
 * The single-business report card: one large grid with the full legend.
 * Layout is in logical pixels at width 1200; `scale` multiplies for export.
 */
import { createCanvas } from '@napi-rs/canvas';
import { renderBasemap } from './basemap.js';
import { gridExtentMi } from './geometry.js';
import {
  FONT, COLORS, rankColor, rankLabel, miLabel, formatDate, fitText, roundRect,
  chip, drawScaleBar, drawNorthArrow, drawBadges, drawExtent,
} from './draw.js';

export { COLORS, rankColor, rankLabel };

const MI_TO_M = 1609.344;

/**
 * @param {object} report  output of runAudit
 * @param {object} [opts]
 * @param {number} [opts.scale=2]
 * @param {string} [opts.agencyName]
 * @param {string} [opts.mapProvider]
 */
export async function renderReport(report, opts = {}) {
  const scale = opts.scale ?? 2;
  const W = 1200;
  const M = 48;
  const headerH = 150;
  const mapW = W - 2 * M;
  const mapH = 960;
  const mapY = headerH;
  const metricsY = mapY + mapH + 24;
  const metricsH = 120;
  const legendY = metricsY + metricsH + 26;
  const H = legendY + 78;

  const { business, keyword, spacingMi, points, metrics } = report;
  const extentMi = gridExtentMi(spacingMi);

  const basemap = await renderBasemap({
    lat: business.lat,
    lng: business.lng,
    width: Math.round(mapW * scale),
    height: Math.round(mapH * scale),
    spanMeters: extentMi * MI_TO_M,
    spanFraction: 0.68,
    provider: opts.mapProvider,
  });

  const canvas = createCanvas(W * scale, H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, W, H);

  // ---- Header -------------------------------------------------------------
  ctx.fillStyle = COLORS.ink;
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText(fitText(ctx, business.name, 740), M, 66);
  ctx.fillStyle = COLORS.slate;
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(fitText(ctx, `Local rankings for “${keyword}”`, 740), M, 98);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 15px ${FONT}`;
  const sub = [business.address || business.city, business.rating ? `${business.rating}★ (${business.reviews ?? 0})` : null]
    .filter(Boolean).join('  ·  ');
  if (sub) ctx.fillText(fitText(ctx, sub, 740), M, 124);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText(formatDate(report.generatedAt ? new Date(report.generatedAt) : new Date()), W - M, 62);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(`5 × 5 grid  ·  ${spacingMi} mi spacing  ·  ${miLabel(extentMi)} across`, W - M, 88);
  if (opts.agencyName) {
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText(`Prepared by ${opts.agencyName}`, W - M, 112);
  }
  ctx.textAlign = 'left';

  // ---- Map ----------------------------------------------------------------
  ctx.save();
  roundRect(ctx, M, mapY, mapW, mapH, 18);
  ctx.clip();
  ctx.drawImage(basemap.canvas, M, mapY, mapW, mapH);
  ctx.restore();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1.5;
  roundRect(ctx, M, mapY, mapW, mapH, 18);
  ctx.stroke();

  const r = 30;
  const toPage = (p) => {
    const d = basemap.project(p.lat, p.lng);
    return { x: M + d.x / scale, y: mapY + d.y / scale };
  };
  const gx = points.map((p) => toPage(p).x);
  const gy = points.map((p) => toPage(p).y);
  const gridBox = { left: Math.min(...gx), right: Math.max(...gx), top: Math.min(...gy), bottom: Math.max(...gy) };
  const pxPerMile = Math.abs(toPage(points[13]).x - toPage(points[12]).x) / spacingMi;

  drawExtent(ctx, gridBox);
  drawBadges(ctx, points, points.map((p) => p.rank), toPage, r);

  // ---- Area legend --------------------------------------------------------
  {
    const { left, right, bottom, top } = gridBox;
    const heightMi = (bottom - top) / pxPerMile;
    const dy = Math.min(bottom + r + 30, mapY + mapH - 46);
    ctx.save();
    ctx.strokeStyle = 'rgba(15,23,42,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, dy - 7); ctx.lineTo(left, dy + 7);
    ctx.moveTo(right, dy - 7); ctx.lineTo(right, dy + 7);
    ctx.moveTo(left, dy); ctx.lineTo(right, dy);
    ctx.stroke();
    ctx.restore();
    ctx.font = `600 13px ${FONT}`;
    chip(ctx, `${miLabel(extentMi)} × ${miLabel(heightMi)} area scanned`, (left + right) / 2, dy - 14, { align: 'center' });
    drawScaleBar(ctx, M + 16, mapY + 16, pxPerMile);
    drawNorthArrow(ctx, M + mapW - 32, mapY + 32);
  }

  // Attribution chip (bottom-right of map)
  ctx.font = `400 11px ${FONT}`;
  const attr = basemap.attribution;
  const aw = ctx.measureText(attr).width + 14;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(ctx, M + mapW - aw - 10, mapY + mapH - 26, aw, 18, 4);
  ctx.fill();
  ctx.fillStyle = COLORS.slate;
  ctx.fillText(attr, M + mapW - aw - 3, mapY + mapH - 13);

  // ---- Metrics ------------------------------------------------------------
  const gap = 16;
  const cardW = (mapW - gap * 2) / 3;
  const cards = [
    {
      label: 'Average rank',
      value: metrics.averageRank == null ? '—' : metrics.averageRank.toFixed(1),
      sub: `across ${points.length} points · 20+ counts as 21`,
      color: rankColor(metrics.averageRank),
    },
    {
      label: 'Top-3 share',
      value: `${Math.round(metrics.top3Share * 100)}%`,
      sub: `${metrics.top3Count} of ${points.length} points in the Map Pack`,
      color: rankColor(metrics.top3Share >= 0.6 ? 1 : metrics.top3Share >= 0.3 ? 5 : 12),
    },
    {
      label: 'Top competitor',
      value: metrics.topCompetitor ? metrics.topCompetitor.name : 'None',
      sub: metrics.topCompetitor
        ? `#1 at ${metrics.topCompetitor.wins} of the ${metrics.notTop3Count} points you don't win`
        : 'You hold the Map Pack everywhere',
      color: COLORS.ink,
      isText: true,
    },
  ];
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    ctx.fillStyle = COLORS.card;
    roundRect(ctx, x, metricsY, cardW, metricsH, 14);
    ctx.fill();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(c.label.toUpperCase(), x + 20, metricsY + 32);
    ctx.fillStyle = c.color;
    ctx.font = `bold ${c.isText ? 24 : 38}px ${FONT}`;
    ctx.fillText(fitText(ctx, c.value, cardW - 40), x + 20, metricsY + (c.isText ? 68 : 76));
    ctx.fillStyle = COLORS.slate;
    ctx.font = `400 13px ${FONT}`;
    ctx.fillText(fitText(ctx, c.sub, cardW - 40), x + 20, metricsY + 100);
  });

  // ---- Legend + footer ----------------------------------------------------
  let lx = M;
  const items = [
    [COLORS.green, 'Ranks 1–3 · in the Map Pack'],
    [COLORS.amber, 'Ranks 4–9 · visible after a click'],
    [COLORS.red, 'Rank 10+ · effectively invisible'],
  ];
  ctx.font = `500 14px ${FONT}`;
  for (const [color, text] of items) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx + 8, legendY + 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.slate;
    ctx.fillText(text, lx + 24, legendY + 13);
    lx += 24 + ctx.measureText(text).width + 28;
  }
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lx + 8, legendY + 8, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLORS.slate;
  ctx.fillText('Business location', lx + 24, legendY + 13);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText(
    `Each number is where this business appears in Google Maps for “${keyword}” when searched from that exact spot. ` +
    `25 points, ${spacingMi} mi apart, covering ${miLabel(extentMi)} × ${miLabel(extentMi)} (${Number((extentMi * extentMi).toFixed(1))} sq mi).`,
    M,
    legendY + 46,
  );
  if (opts.agencyUrl) {
    ctx.textAlign = 'right';
    ctx.fillText(opts.agencyUrl, W - M, legendY + 46);
    ctx.textAlign = 'left';
  }

  return {
    png: canvas.toBuffer('image/png'),
    width: W * scale,
    height: H * scale,
    basemap: {
      provider: basemap.provider,
      requestedProvider: basemap.requestedProvider,
      fellBack: !!basemap.fellBack,
      zoom: basemap.zoom,
      offline: !!basemap.offline,
      error: basemap.error,
    },
  };
}
