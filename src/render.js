/**
 * Renders the report card PNG with @napi-rs/canvas.
 * All layout is in "logical" pixels at width 1200; `scale` multiplies for
 * a crisp export (2 => 2400px wide).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { renderBasemap } from './basemap.js';
import { gridExtentMi } from './geometry.js';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');
for (const f of ['Inter-Regular', 'Inter-Medium', 'Inter-SemiBold', 'Inter-Bold']) {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, `${f}.ttf`), 'Inter');
}
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

export const COLORS = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  ink: '#0f172a',
  slate: '#475569',
  muted: '#64748b',
  line: '#e2e8f0',
  card: '#f8fafc',
  white: '#ffffff',
};

export function rankColor(rank) {
  if (rank == null || rank >= 10) return COLORS.red;
  if (rank <= 3) return COLORS.green;
  return COLORS.amber;
}
export function rankLabel(rank) {
  return rank == null || rank > 20 ? '20+' : String(rank);
}

const MI_TO_M = 1609.344;

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Miles rendered without a trailing ".0" ("2 mi", "0.5 mi", "1.5 mi"). */
function miLabel(mi) {
  return `${Number(mi.toFixed(2)).toString()} mi`;
}

/** A white chip behind text so map detail never fights the label. */
function chip(ctx, text, x, y, { align = 'left', padX = 9, padY = 6, font } = {}) {
  if (font) ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 16 + padY * 2;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, left, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, y + h / 2);
  ctx.textBaseline = 'alphabetic';
  return { left, width: w, height: h };
}

/** Standard map scale bar. `pxPerMile` comes from the real projection. */
function drawScaleBar(ctx, x, y, pxPerMile) {
  const NICE = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
  let best = NICE[0];
  for (const d of NICE) {
    const px = d * pxPerMile;
    if (px <= 200) best = d;
    if (px > 200) break;
  }
  const barPx = Math.max(34, best * pxPerMile);
  const label = miLabel(best);
  ctx.font = `600 12px ${FONT}`;
  const boxW = Math.max(barPx, ctx.measureText(label).width) + 22;
  const boxH = 40;

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, x, y, boxW, boxH, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const bx = x + 11;
  const by = y + 26;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, by - 5);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + barPx, by);
  ctx.lineTo(bx + barPx, by - 5);
  ctx.stroke();
  // half-way tick
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + barPx / 2, by - 3);
  ctx.lineTo(bx + barPx / 2, by);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(label, bx, y + 16);
  return boxW;
}

/** Small north arrow so the compass wording in the takeaway lines up. */
function drawNorthArrow(ctx, cx, cy) {
  const rad = 17;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx + 5, cy + 3);
  ctx.lineTo(cx, cy - 0.5);
  ctx.lineTo(cx - 5, cy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy + 13);
  ctx.textAlign = 'left';
}

/**
 * @param {object} report  output of runAudit (business, keyword, spacingMi, points, metrics)
 * @param {object} [opts]
 * @param {number} [opts.scale=2]
 * @param {string} [opts.agencyName]
 * @param {string} [opts.mapProvider]
 * @returns {Promise<{png: Buffer, width:number, height:number, basemap:object}>}
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

  // Page background
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, W, H);

  // ---- Header -----------------------------------------------------------
  ctx.fillStyle = COLORS.ink;
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText(fitText(ctx, business.name, 740), M, 66);
  ctx.fillStyle = COLORS.slate;
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(fitText(ctx, `Local rankings for “${keyword}”`, 740), M, 98);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 15px ${FONT}`;
  const sub = [business.address || business.city, business.rating ? `${business.rating}★ (${business.reviews ?? 0})` : null].filter(Boolean).join('  ·  ');
  if (sub) ctx.fillText(fitText(ctx, sub, 740), M, 124);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText(formatDate(report.generatedAt ? new Date(report.generatedAt) : new Date()), W - M, 62);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(`5 × 5 grid  ·  ${spacingMi} mi spacing  ·  ${extentMi.toFixed(1)} mi across`, W - M, 88);
  const agency = opts.agencyName ?? '';
  if (agency) {
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText(`Prepared by ${agency}`, W - M, 112);
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

  // Badges
  const r = spacingMi <= 0.5 ? 30 : spacingMi <= 1 ? 30 : 30;
  const toPage = (p) => {
    const d = basemap.project(p.lat, p.lng);
    return { x: M + d.x / scale, y: mapY + d.y / scale };
  };
  // Bounds of the scanned square, in page pixels.
  const gx = points.map((p) => toPage(p).x);
  const gy = points.map((p) => toPage(p).y);
  const gridBox = {
    left: Math.min(...gx), right: Math.max(...gx),
    top: Math.min(...gy), bottom: Math.max(...gy),
  };
  const pxPerMile = Math.abs(toPage(points[13]).x - toPage(points[12]).x) / spacingMi;

  // Outline of the area covered. Drawn first so the badges sit on top of it.
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.strokeRect(gridBox.left, gridBox.top, gridBox.right - gridBox.left, gridBox.bottom - gridBox.top);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(15,23,42,0.38)';
  ctx.strokeRect(gridBox.left, gridBox.top, gridBox.right - gridBox.left, gridBox.bottom - gridBox.top);
  ctx.restore();

  for (const p of points) {
    const { x, y } = toPage(p);
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = rankColor(p.rank);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (p.isCenter) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    const label = rankLabel(p.rank);
    ctx.fillStyle = COLORS.white;
    ctx.font = `bold ${label.length > 2 ? 19 : 24}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- Area legend: how much ground the grid actually covers --------------
  {
    const { left, right, bottom } = gridBox;
    const heightMi = (bottom - gridBox.top) / pxPerMile;

    // Dimension bracket under the bottom row.
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

    const areaText = `${miLabel(extentMi)} × ${miLabel(heightMi)} area scanned`;
    ctx.font = `600 13px ${FONT}`;
    chip(ctx, areaText, (left + right) / 2, dy - 14, { align: 'center' });

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

  return { png: canvas.toBuffer('image/png'), width: W * scale, height: H * scale, basemap: {
      provider: basemap.provider,
      requestedProvider: basemap.requestedProvider,
      fellBack: !!basemap.fellBack,
      zoom: basemap.zoom,
      offline: !!basemap.offline,
      error: basemap.error,
    } };
}
