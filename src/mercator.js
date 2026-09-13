/** Web Mercator helpers (slippy-map tile scheme, 256px tiles). */
export const TILE_SIZE = 256;

export function lngToX(lng, zoom) {
  return ((lng + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

export function latToY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    TILE_SIZE *
    2 ** zoom
  );
}

/** Metres per pixel at a given latitude / zoom. */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Choose a fractional zoom so that `spanMeters` occupies `targetPx` pixels.
 * Tile servers only serve integer zooms, so callers should floor this and
 * scale the stitched image to hit the exact target.
 */
export function zoomForSpan(lat, spanMeters, targetPx) {
  const mpp = spanMeters / targetPx;
  return Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp);
}
