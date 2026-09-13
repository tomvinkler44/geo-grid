/**
 * Grid geometry helpers.
 * All distances in miles. Uses a spherical-earth approximation which is
 * accurate to well under 0.1% at the 0.5–2 mile scales used here.
 */
export const EARTH_RADIUS_MI = 3958.7613;
export const GRID_SIZE = 5;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Offset a lat/lng by north/east distances in miles. */
export function offsetLatLng(lat, lng, northMi, eastMi) {
  const dLat = toDeg(northMi / EARTH_RADIUS_MI);
  const dLng = toDeg(eastMi / (EARTH_RADIUS_MI * Math.cos(toRad(lat))));
  return { lat: lat + dLat, lng: lng + dLng };
}

/** Great-circle distance in miles. */
export function haversineMi(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

/**
 * Build the 5x5 grid centred on (lat, lng). `spacingMi` is the distance
 * between adjacent points. Row 0 is the northern-most row; col 0 is the
 * western-most column. The centre pin is [2,2] (index 12).
 */
export function buildGrid(lat, lng, spacingMi, size = GRID_SIZE) {
  const half = (size - 1) / 2;
  const points = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const north = (half - row) * spacingMi;
      const east = (col - half) * spacingMi;
      const p = offsetLatLng(lat, lng, north, east);
      points.push({
        index: row * size + col,
        row,
        col,
        lat: +p.lat.toFixed(6),
        lng: +p.lng.toFixed(6),
        offsetNorthMi: north,
        offsetEastMi: east,
        distanceMi: Math.hypot(north, east),
        bearing: bearingLabel(north, east),
        isCenter: row === half && col === half,
      });
    }
  }
  return points;
}

/** Compass label for a grid offset, e.g. "North-East". */
export function bearingLabel(northMi, eastMi) {
  if (northMi === 0 && eastMi === 0) return 'Center';
  const ns = northMi > 0 ? 'North' : northMi < 0 ? 'South' : '';
  const ew = eastMi > 0 ? 'East' : eastMi < 0 ? 'West' : '';
  if (ns && ew) return `${ns}-${ew}`;
  return ns || ew;
}

/** Total edge length of the grid (distance from col 0 to col 4). */
export function gridExtentMi(spacingMi, size = GRID_SIZE) {
  return spacingMi * (size - 1);
}
