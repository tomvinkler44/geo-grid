/** Shared canvas primitives and the report palette. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';
import { band } from './ranks.js';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');
for (const f of ['Inter-Regular', 'Inter-Medium', 'Inter-SemiBold', 'Inter-Bold']) {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, `${f}.ttf`), 'Inter');
}
export const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

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
  leadBar: '#15803d',
  rivalABar: '#1e3a5f',
  rivalBBar: '#57606f',
};

export function rankColor(rank) {
  const b = band(rank);
  if (b === 'visible') return COLORS.green;
  if (b === 'invisible') return COLORS.red;
  return COLORS.amber;
}

/**
 * Numeral colour on a pin. White on amber measures about 2:1 contrast and
 * smudges when printed, so amber pins get dark slate numerals instead.
 */
export function rankTextColor(rank) {
  return band(rank) === 'weak' ? '#0f172a' : COLORS.white;
}
export function rankLabel(rank) {
  return rank == null || rank > 20 ? '20+' : String(rank);
}

/** Miles rendered without a trailing ".0" ("2 mi", "0.5 mi", "1.5 mi"). */
export function miLabel(mi) {
  return `${Number(mi.toFixed(2)).toString()} mi`;
}

export function formatDate(d) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function fitText(ctx, text, maxWidth) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Rounded rect with only the top two corners rounded. */
export function topRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A white chip behind text so map detail never fights the label. */
export function chip(ctx, text, x, y, { align = 'left', padX = 9, padY = 6, font } = {}) {
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
export function drawScaleBar(ctx, x, y, pxPerMile, { compact = false } = {}) {
  const NICE = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
  const maxPx = compact ? 110 : 200;
  let best = NICE[0];
  for (const d of NICE) {
    const px = d * pxPerMile;
    if (px <= maxPx) best = d;
    if (px > maxPx) break;
  }
  const barPx = Math.max(28, best * pxPerMile);
  const label = miLabel(best);
  const fontSize = compact ? 10 : 12;
  ctx.font = `600 ${fontSize}px ${FONT}`;
  const boxW = Math.max(barPx, ctx.measureText(label).width) + (compact ? 16 : 22);
  const boxH = compact ? 32 : 40;

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, x, y, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const bx = x + (compact ? 8 : 11);
  const by = y + boxH - (compact ? 10 : 14);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, by - 5);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + barPx, by);
  ctx.lineTo(bx + barPx, by - 5);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.fillText(label, bx, y + (compact ? 14 : 16));
  return boxW;
}

/** Small north arrow so compass wording in the takeaway lines up. */
export function drawNorthArrow(ctx, cx, cy, rad = 17) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const k = rad / 17;
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10 * k);
  ctx.lineTo(cx + 5 * k, cy + 3 * k);
  ctx.lineTo(cx, cy - 0.5 * k);
  ctx.lineTo(cx - 5 * k, cy + 3 * k);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold ${Math.round(9 * k)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy + 13 * k);
  ctx.textAlign = 'left';
}

/** Draw the 25 rank badges for one business over an already-drawn map. */
export function drawBadges(ctx, points, ranks, toPage, radius, { markCenter = true } = {}) {
  const twoDigitFont = Math.round(radius * 0.78);
  const threeDigitFont = Math.round(radius * 0.62);
  for (let i = 0; i < points.length; i++) {
    const { x, y } = toPage(points[i]);
    const rank = ranks[i];
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = radius * 0.34;
    ctx.shadowOffsetY = radius * 0.1;
    ctx.fillStyle = rankColor(rank);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.strokeStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (markCenter && points[i].isCenter) {
      // The grid is centred on the listing's coordinates, so this pin *is*
      // the business address. A white halo then a dark ring keeps it legible
      // on any basemap.
      ctx.lineWidth = Math.max(3, radius * 0.16);
      ctx.strokeStyle = COLORS.white;
      ctx.beginPath();
      ctx.arc(x, y, radius + radius * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(2.5, radius * 0.13);
      ctx.strokeStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(x, y, radius + radius * 0.36, 0, Math.PI * 2);
      ctx.stroke();
    }
    const label = rankLabel(rank);
    ctx.fillStyle = rankTextColor(rank);
    ctx.font = `bold ${label.length > 2 ? threeDigitFont : twoDigitFont}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

/** Dashed outline of the scanned square. Drawn before badges. */
export function drawExtent(ctx, box) {
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(15,23,42,0.38)';
  ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.restore();
}

/** Word-wrap `text` into at most `maxLines` lines of `maxWidth`. */
export function wrapText(ctx, text, maxWidth, maxLines = 99) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.length) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth || line !== last) {
      lines[maxLines - 1] = fitText(ctx, `${last}…`, maxWidth);
    }
  }
  return lines;
}
