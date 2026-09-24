/**
 * Renders one grid panel per business as a standalone PNG, for the HTML
 * executive report to lay out in columns.
 *
 * All panels share a single basemap render and the same grid coordinates, so
 * the three columns are directly comparable: the only thing that differs is
 * the colour and number on each pin.
 */
import { createCanvas } from '@napi-rs/canvas';
import { renderBasemap } from './basemap.js';
import { gridExtentMi } from './geometry.js';
import { COLORS, drawBadges, drawExtent, drawScaleBar, drawNorthArrow } from './draw.js';

const MI_TO_M = 1609.344;

/**
 * @param {object} report  output of runAudit
 * @param {object} [opts]
 * @param {number} [opts.width=520]   logical panel width
 * @param {number} [opts.height=460]  logical panel height
 * @param {number} [opts.scale=2]
 * @returns {Promise<{panels: Array<{index:number,name:string,png:Buffer}>, basemap:object, width:number, height:number}>}
 */
export async function renderPanels(report, opts = {}) {
  const W = opts.width ?? 520;
  const H = opts.height ?? 460;
  const scale = opts.scale ?? 2;
  const { points, businesses, spacingMi } = report;
  const extentMi = gridExtentMi(spacingMi);

  const basemap = await renderBasemap({
    lat: report.business.lat,
    lng: report.business.lng,
    width: Math.round(W * scale),
    height: Math.round(H * scale),
    spanMeters: extentMi * MI_TO_M,
    spanFraction: 0.66,
    provider: opts.mapProvider,
  });

  const toPage = (p) => {
    const d = basemap.project(p.lat, p.lng);
    return { x: d.x / scale, y: d.y / scale };
  };
  const xs = points.map((p) => toPage(p).x);
  const ys = points.map((p) => toPage(p).y);
  const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  const pxPerMile = Math.abs(toPage(points[13]).x - toPage(points[12]).x) / spacingMi;
  const radius = Math.max(12, Math.min(20, (box.right - box.left) / 4 / 4.6));

  const panels = businesses.slice(0, 3).map((profile, i) => {
    const canvas = createCanvas(W * scale, H * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(basemap.canvas, 0, 0, W, H);

    drawExtent(ctx, box);
    drawBadges(ctx, points, points.map((p) => p.ranks[i]), toPage, radius, { markCenter: i === 0 });

    if (i === 0) {
      drawScaleBar(ctx, 10, 10, pxPerMile, { compact: true });
      drawNorthArrow(ctx, W - 22, 22, 12);
    }
    return { index: i, name: profile.name, role: profile.role, png: canvas.toBuffer('image/png') };
  });

  return {
    panels,
    width: W * scale,
    height: H * scale,
    basemap: {
      provider: basemap.provider,
      requestedProvider: basemap.requestedProvider,
      fellBack: !!basemap.fellBack,
      offline: !!basemap.offline,
      error: basemap.error,
      attribution: basemap.attribution,
    },
  };
}
